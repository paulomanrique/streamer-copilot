import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { BrowserWindow, session } from 'electron';
import type { ChatMessage, StreamEvent, TikTokConnectionStatus } from '../../shared/types.js';
import type { PlatformChatAdapter } from '../base.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

const HEARTBEAT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 15_000;
const CAPTURE_TIMEOUT_MS = 35_000;

// ─── Minimal Protobuf reader ───────────────────────────────────────────────────

interface Cur { buf: Buffer; pos: number; }

function cur(buf: Buffer): Cur { return { buf, pos: 0 }; }
function done(c: Cur): boolean { return c.pos >= c.buf.length; }

function readVarint(c: Cur): bigint {
  let result = 0n, shift = 0n;
  while (c.pos < c.buf.length) {
    const b = c.buf[c.pos++];
    result |= BigInt(b & 0x7f) << shift;
    if (!(b & 0x80)) break;
    shift += 7n;
  }
  return result;
}

function readTag(c: Cur): [number, number] {
  const v = readVarint(c);
  return [Number(v >> 3n), Number(v & 7n)];
}

function readBytes(c: Cur): Buffer<ArrayBuffer> {
  const len = Number(readVarint(c));
  const slice = c.buf.subarray(c.pos, c.pos + len);
  c.pos += len;
  return Buffer.from(slice) as Buffer<ArrayBuffer>;
}

function skipField(c: Cur, wireType: number): void {
  switch (wireType) {
    case 0: readVarint(c); break;
    case 1: c.pos += 8; break;
    case 2: readBytes(c); break;
    case 5: c.pos += 4; break;
  }
}

// ─── Minimal Protobuf writer ───────────────────────────────────────────────────

class PW {
  private chunks: Buffer[] = [];

  varint(v: bigint | number): this {
    let n = typeof v === 'bigint' ? v : BigInt(v);
    if (n < 0n) n = BigInt.asUintN(64, n);
    const bytes: number[] = [];
    while (true) {
      const b = Number(n & 0x7fn);
      n >>= 7n;
      bytes.push(n === 0n ? b : b | 0x80);
      if (n === 0n) break;
    }
    this.chunks.push(Buffer.from(bytes));
    return this;
  }

  tag(field: number, wire: number): this { return this.varint((field << 3) | wire); }

  str(field: number, value: string): this {
    if (!value) return this;
    const b = Buffer.from(value, 'utf-8');
    this.tag(field, 2).varint(b.length);
    this.chunks.push(b);
    return this;
  }

  buf(field: number, data: Buffer | Uint8Array): this {
    if (!data.length) return this;
    const b = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.tag(field, 2).varint(b.length);
    this.chunks.push(b);
    return this;
  }

  i64(field: number, value: bigint | string | number): this {
    const v = typeof value === 'bigint' ? value : BigInt(value);
    if (v === 0n) return this;
    return this.tag(field, 0).varint(v);
  }

  finish(): Buffer { return Buffer.concat(this.chunks); }
}

// ─── Message decoders ─────────────────────────────────────────────────────────

interface UserInfo { nickname: string; uniqueId: string; avatarUrl: string; }

function decodeImageUrl(buf: Buffer): string {
  // Image message: field 1 = urlList (repeated string) — take first entry
  const c = cur(buf);
  while (!done(c)) {
    const [f, w] = readTag(c);
    if (w === 2) {
      const b = readBytes(c);
      if (f === 1) return b.toString('utf-8');
    } else skipField(c, w);
  }
  return '';
}

function decodeUser(buf: Buffer): UserInfo {
  const c = cur(buf);
  let nickname = '', uniqueId = '', avatarUrl = '';
  while (!done(c)) {
    const [f, w] = readTag(c);
    if (w === 2) {
      const b = readBytes(c);
      if (f === 3) nickname = b.toString('utf-8');             // User.nickname
      else if (f === 9 && !avatarUrl) avatarUrl = decodeImageUrl(b); // User.avatarThumb
      else if (f === 38) uniqueId = b.toString('utf-8');       // User.uniqueId
    } else skipField(c, w);
  }
  return { nickname, uniqueId, avatarUrl };
}

function decodeText(buf: Buffer): string {
  const c = cur(buf);
  while (!done(c)) {
    const [f, w] = readTag(c);
    if (w === 2) {
      const b = readBytes(c);
      if (f === 1) return b.toString('utf-8'); // Text.displayType
    } else skipField(c, w);
  }
  return '';
}

function decodeCommonDisplayType(buf: Buffer): string {
  const c = cur(buf);
  while (!done(c)) {
    const [f, w] = readTag(c);
    if (w === 2) {
      const b = readBytes(c);
      if (f === 8) return decodeText(b); // CommonMessageData.displayText (field 8)
    } else skipField(c, w);
  }
  return '';
}

function decodeGiftDetails(buf: Buffer): { giftType: number; diamondCount: number; giftName: string } {
  const c = cur(buf);
  let giftType = 0, diamondCount = 0, giftName = '';
  while (!done(c)) {
    const [f, w] = readTag(c);
    if (w === 0) {
      const v = Number(readVarint(c));
      if (f === 11) giftType = v;       // Gift.giftType (tag 88)
      else if (f === 12) diamondCount = v; // Gift.diamondCount (tag 96)
    } else if (w === 2) {
      const b = readBytes(c);
      if (f === 16) giftName = b.toString('utf-8'); // Gift.giftName (tag 130)
    } else skipField(c, w);
  }
  return { giftType, diamondCount, giftName };
}

interface ChatData { user: UserInfo; comment: string; }
interface SocialData { user: UserInfo; displayType: string; }
interface GiftData { user: UserInfo; giftType: number; repeatEnd: number; repeatCount: number; diamondCount: number; giftName: string; }
interface BaseMsg { type: string; payload: Buffer<ArrayBuffer>; msgId: string; }
interface FetchResult { messages: BaseMsg[]; cursor: string; internalExt: string; wsParams: Record<string, string>; needsAck: boolean; wsUrl: string; }
interface PushFrame { payloadEncoding: string; payloadType: string; payload: Buffer<ArrayBuffer>; logId: string; }
type WsHandle = { send(d: Buffer): void; close(): void; readyState: number; addEventListener(e: string, h: (...a: unknown[]) => void, opts?: unknown): void; binaryType: string; };

function decodeChatMsg(buf: Buffer): ChatData {
  const c = cur(buf);
  let user: UserInfo = { nickname: '', uniqueId: '', avatarUrl: '' };
  let comment = '';
  while (!done(c)) {
    const [f, w] = readTag(c);
    if (w === 2) {
      const b = readBytes(c);
      if (f === 2) user = decodeUser(b);
      else if (f === 3) comment = b.toString('utf-8'); // WebcastChatMessage.comment
    } else skipField(c, w);
  }
  return { user, comment };
}

function decodeSocialMsg(buf: Buffer): SocialData {
  const c = cur(buf);
  let user: UserInfo = { nickname: '', uniqueId: '', avatarUrl: '' };
  let displayType = '';
  while (!done(c)) {
    const [f, w] = readTag(c);
    if (w === 2) {
      const b = readBytes(c);
      if (f === 1) displayType = decodeCommonDisplayType(b); // WebcastSocialMessage.common
      else if (f === 2) user = decodeUser(b);
    } else skipField(c, w);
  }
  return { user, displayType };
}

function decodeGiftMsg(buf: Buffer): GiftData {
  const c = cur(buf);
  let user: UserInfo = { nickname: '', uniqueId: '', avatarUrl: '' };
  let giftType = 0, repeatEnd = 0, repeatCount = 0, diamondCount = 0, giftName = '';
  while (!done(c)) {
    const [f, w] = readTag(c);
    if (w === 0) {
      const v = Number(readVarint(c));
      if (f === 5) repeatCount = v; // WebcastGiftMessage.repeatCount (tag 40)
      else if (f === 9) repeatEnd = v; // WebcastGiftMessage.repeatEnd (tag 72)
    } else if (w === 2) {
      const b = readBytes(c);
      if (f === 7) user = decodeUser(b); // WebcastGiftMessage.user (tag 58)
      else if (f === 15) {               // WebcastGiftMessage.giftDetails (tag 122)
        const d = decodeGiftDetails(b);
        giftType = d.giftType;
        diamondCount = d.diamondCount;
        giftName = d.giftName;
      }
    } else skipField(c, w);
  }
  return { user, giftType, repeatEnd, repeatCount, diamondCount, giftName };
}

function decodeControlMsg(buf: Buffer): number {
  const c = cur(buf);
  while (!done(c)) {
    const [f, w] = readTag(c);
    if (w === 0) {
      const v = Number(readVarint(c));
      if (f === 2) return v; // WebcastControlMessage.action (tag 16)
    } else skipField(c, w);
  }
  return 0;
}

function decodeBaseMsg(buf: Buffer): BaseMsg {
  const c = cur(buf);
  let type = '', msgId = '0';
  let payload: Buffer<ArrayBuffer> = Buffer.alloc(0);
  while (!done(c)) {
    const [f, w] = readTag(c);
    if (w === 2) {
      const b = readBytes(c);
      if (f === 1) type = b.toString('utf-8');
      else if (f === 2) payload = b;
    } else if (w === 0) {
      const v = readVarint(c);
      if (f === 3) msgId = v.toString();
    } else skipField(c, w);
  }
  return { type, payload, msgId };
}

function decodeMapEntry(buf: Buffer): { key: string; value: string } {
  const c = cur(buf);
  let key = '', value = '';
  while (!done(c)) {
    const [f, w] = readTag(c);
    if (w === 2) {
      const b = readBytes(c);
      if (f === 1) key = b.toString('utf-8');
      else if (f === 2) value = b.toString('utf-8');
    } else skipField(c, w);
  }
  return { key, value };
}

function decodeFetchResult(buf: Buffer): FetchResult {
  const c = cur(buf);
  const messages: BaseMsg[] = [];
  let msgCursor = '', internalExt = '', wsUrl = '';
  const wsParams: Record<string, string> = {};
  let needsAck = false;
  while (!done(c)) {
    const [f, w] = readTag(c);
    if (w === 2) {
      const b = readBytes(c);
      if (f === 1) messages.push(decodeBaseMsg(b));       // ProtoMessageFetchResult.messages
      else if (f === 2) msgCursor = b.toString('utf-8');  // .cursor
      else if (f === 5) internalExt = b.toString('utf-8'); // .internalExt
      else if (f === 7) {                                  // .wsParams (map entry)
        const e = decodeMapEntry(b);
        if (e.key) wsParams[e.key] = e.value;
      }
      else if (f === 10) wsUrl = b.toString('utf-8');     // .wsUrl
    } else if (w === 0) {
      const v = readVarint(c);
      if (f === 9) needsAck = v !== 0n; // .needsAck
    } else skipField(c, w);
  }
  return { messages, cursor: msgCursor, internalExt, wsParams, needsAck, wsUrl };
}

function decodePushFrame(buf: Buffer): PushFrame {
  const c = cur(buf);
  let payloadEncoding = '', payloadType = '', logId = '0';
  let payload: Buffer<ArrayBuffer> = Buffer.alloc(0);
  while (!done(c)) {
    const [f, w] = readTag(c);
    if (w === 2) {
      const b = readBytes(c);
      if (f === 6) payloadEncoding = b.toString('utf-8');
      else if (f === 7) payloadType = b.toString('utf-8');
      else if (f === 8) payload = b;
    } else if (w === 0) {
      const v = readVarint(c);
      if (f === 2) logId = v.toString(); // WebcastPushFrame.logId
    } else skipField(c, w);
  }
  return { payloadEncoding, payloadType, payload, logId };
}

// ─── Message encoders ─────────────────────────────────────────────────────────

function encodePushFrame(payloadType: string, payload: Buffer, logId?: string): Buffer {
  const w = new PW();
  if (logId && logId !== '0') w.i64(2, BigInt(logId));
  w.str(6, 'pb');
  w.str(7, payloadType);
  w.buf(8, payload);
  return w.finish();
}

function encodeHeartbeat(roomId: string): Buffer {
  const hb = new PW().i64(1, BigInt(roomId)).i64(2, 1n);
  return encodePushFrame('hb', hb.finish());
}

function encodeEnterRoom(roomId: string): Buffer {
  const msg = new PW()
    .i64(1, BigInt(roomId)) // roomId
    .i64(4, 12n)            // liveId = '12'
    .str(5, 'audience')     // identity
    .str(9, '0');           // filterWelcomeMsg
  return encodePushFrame('im_enter_room', msg.finish());
}

function encodeAck(logId: string, internalExt: string): Buffer {
  return encodePushFrame('ack', Buffer.from(internalExt, 'utf-8'), logId);
}

// ─── WebSocket URL capture via hidden BrowserWindow ───────────────────────────

interface WsCaptureResult {
  wsUrl: string;
  cookieHeader: string;
  roomId: string;
}

async function captureWsCredentials(username: string): Promise<WsCaptureResult> {
  return new Promise<WsCaptureResult>((resolve, reject) => {
    let captured = false;
    let win: BrowserWindow | null = null;

    const cleanup = () => {
      if (!win) return;
      try { win.webContents.debugger.detach(); } catch { /* ignore */ }
      try { win.destroy(); } catch { /* ignore */ }
      win = null;
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`TikTok: timed out waiting for live stream — is @${username} currently live?`));
    }, CAPTURE_TIMEOUT_MS);

    const partition = `tiktok-ws-capture-${Date.now()}`;
    const ses = session.fromPartition(partition);

    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 720,
      autoHideMenuBar: true,
      skipTaskbar: true,
      webPreferences: {
        session: ses,
        backgroundThrottling: false,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    const wc = win.webContents;

    // CDP intercepts WebSocket creation at the JS engine level, which is reliable
    // even in Electron 35 where session.webRequest doesn't fire for WebSocket upgrades
    try {
      wc.debugger.attach('1.1');
    } catch {
      clearTimeout(timer);
      cleanup();
      reject(new Error('TikTok: failed to attach CDP debugger'));
      return;
    }

    void wc.debugger.sendCommand('Network.enable').catch(() => {});

    wc.debugger.on('message', async (_, method, params: Record<string, unknown>) => {
      if (captured) return;
      if (method !== 'Network.webSocketCreated') return;

      const wsUrl = (params.url as string) ?? '';
      if (!wsUrl.includes('tiktok.com')) return;

      const roomId = (() => {
        try { return new URL(wsUrl).searchParams.get('room_id') ?? ''; }
        catch { return ''; }
      })();
      if (!roomId) return;

      captured = true;
      clearTimeout(timer);

      // Fetch the session cookies for webcast.tiktok.com — these are exactly what
      // Chromium would include in the WebSocket handshake headers automatically
      const cookies = await ses.cookies.get({ url: 'https://webcast.tiktok.com' });
      const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      setImmediate(cleanup);
      resolve({ wsUrl, cookieHeader, roomId });
    });

    win.loadURL(`https://www.tiktok.com/@${encodeURIComponent(username)}/live`, {
      userAgent: UA,
    });

    wc.on('did-fail-load', (_event, errorCode, errorDesc) => {
      if (captured) return;
      clearTimeout(timer);
      cleanup();
      reject(new Error(`TikTok: page failed to load (${errorCode}: ${errorDesc})`));
    });
  });
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export interface TikTokAdapterOptions {
  username: string;
  onStatusChange?: (status: TikTokConnectionStatus) => void;
  onError?: (error: unknown) => void;
}

export function createTikTokChatAdapter(options: TikTokAdapterOptions): TikTokChatAdapter {
  return new TikTokChatAdapter(options);
}

export class TikTokChatAdapter implements PlatformChatAdapter {
  readonly platform = 'tiktok' as const;

  private ws: WsHandle | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private roomId = '';
  private internalExt = '';
  private connected = false;
  private readonly messageHandlers = new Set<(msg: ChatMessage) => void>();
  private readonly eventHandlers = new Set<(ev: StreamEvent) => void>();

  constructor(private readonly options: TikTokAdapterOptions) {}

  async connect(): Promise<void> {
    if (this.connected) return;
    this.options.onStatusChange?.('connecting');
    try {
      await this.doConnect();
    } catch (cause) {
      this.connected = false;
      this.options.onError?.(cause);
      this.options.onStatusChange?.('error');
    }
  }

  private async doConnect(): Promise<void> {
    const { username } = this.options;

    // 1. Open a hidden browser window, let TikTok's JS build the signed WebSocket
    //    URL, intercept the upgrade request before it goes out, capture URL + cookies
    const { wsUrl, cookieHeader, roomId } = await captureWsCredentials(username);
    this.roomId = roomId;

    // 2. Connect undici WebSocket (supports custom headers, no extra npm packages)
    const _req = createRequire(import.meta.url);
    const UndiciWS = (_req('undici') as { WebSocket: new (url: string, opts?: unknown) => WsHandle }).WebSocket;
    const ws = new UndiciWS(wsUrl, {
      headers: { 'User-Agent': UA, 'Cookie': cookieHeader },
    } as unknown);

    this.ws = ws as unknown as NonNullable<typeof this.ws>;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('TikTok WebSocket connection timeout'));
      }, CONNECT_TIMEOUT_MS);

      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true } as unknown);
      ws.addEventListener('error', (ev: unknown) => {
        clearTimeout(timer);
        const msg = (ev as { message?: string })?.message ?? 'WebSocket error';
        reject(new Error(`TikTok WebSocket: ${msg}`));
      }, { once: true } as unknown);
    });

    // 3. Wire up ongoing handlers
    ws.binaryType = 'arraybuffer';
    ws.addEventListener('message', (ev: unknown) => {
      const data = (ev as { data: unknown }).data;
      this.onWsMessage(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
    });
    ws.addEventListener('close', () => this.onDisconnect());
    ws.addEventListener('error', (ev: unknown) => {
      this.options.onError?.((ev as { message?: string })?.message ?? 'WebSocket error');
    });

    // 4. Enter room + start heartbeat
    ws.send(encodeEnterRoom(this.roomId));
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === 1) this.ws.send(encodeHeartbeat(this.roomId));
    }, HEARTBEAT_MS);

    this.connected = true;
    this.options.onStatusChange?.('connected');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.clearHb();
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    this.options.onStatusChange?.('disconnected');
  }

  async sendMessage(_content: string): Promise<void> {
    throw new Error('TikTok does not support sending messages (requires browser session authentication)');
  }

  onMessage(handler: (msg: ChatMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onEvent(handler: (ev: StreamEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  async fetchIsLive(): Promise<boolean> {
    try {
      const params = new URLSearchParams({
        uniqueId: this.options.username,
        sourceType: '54',
        aid: '1988',
        app_name: 'tiktok_web',
        device_platform: 'web_pc',
      });
      const res = await fetch(`https://www.tiktok.com/api-live/user/room/?${params}`, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://www.tiktok.com/' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return false;
      const data = await res.json() as Record<string, unknown>;
      // status 2 = live, status 4 = offline
      return ((data?.data as Record<string, unknown>)?.data as Record<string, unknown>)?.status === 2;
    } catch {
      return false;
    }
  }

  private onWsMessage(raw: Buffer): void {
    try {
      const frame = decodePushFrame(raw);
      if (frame.payloadEncoding !== 'pb') return;

      let payload = frame.payload;
      if (payload.length > 2 && payload[0] === 0x1f && payload[1] === 0x8b && payload[2] === 0x08) {
        payload = gunzipSync(payload);
      }

      const result = decodeFetchResult(payload);

      if (result.needsAck && frame.logId !== '0') {
        this.ws?.send(encodeAck(frame.logId, result.internalExt || this.internalExt));
      }
      if (result.internalExt) this.internalExt = result.internalExt;

      this.processMessages(result.messages, result.needsAck, frame.logId);
    } catch {
      // Silently ignore malformed frames
    }
  }

  private processMessages(messages: BaseMsg[], _needsAck: boolean, _logId: string): void {
    for (const msg of messages) {
      try { this.dispatchMsg(msg); } catch { /* ignore */ }
    }
  }

  private dispatchMsg(msg: BaseMsg): void {
    switch (msg.type) {
      case 'WebcastChatMessage': {
        const d = decodeChatMsg(msg.payload);
        const author = d.user.uniqueId || d.user.nickname;
        if (!author || !d.comment) return;
        this.emitMsg({
          id: `tiktok-${msg.msgId}-${Math.random().toString(36).slice(2, 7)}`,
          platform: 'tiktok',
          author,
          content: d.comment,
          badges: [],
          timestampLabel: ts(),
          avatarUrl: d.user.avatarUrl || undefined,
        });
        break;
      }

      case 'WebcastSocialMessage': {
        const d = decodeSocialMsg(msg.payload);
        if (!d.displayType.includes('follow')) return;
        const author = d.user.uniqueId || d.user.nickname || 'TikTok user';
        this.emitEv({
          id: `tiktok-ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          platform: 'tiktok',
          type: 'follow',
          author,
          timestampLabel: ts(),
        });
        break;
      }

      case 'WebcastGiftMessage': {
        const d = decodeGiftMsg(msg.payload);
        // Only emit when streak ends (giftType === 1 && repeatEnd) or non-streak gifts
        if (d.giftType === 1 && !d.repeatEnd) return;
        const author = d.user.uniqueId || d.user.nickname || 'TikTok user';
        this.emitEv({
          id: `tiktok-ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          platform: 'tiktok',
          type: 'gift',
          author,
          amount: d.repeatCount || d.diamondCount || 1,
          message: d.giftName ? `${d.giftName} x${d.repeatCount || 1}` : undefined,
          timestampLabel: ts(),
        });
        break;
      }

      case 'WebcastControlMessage': {
        const action = decodeControlMsg(msg.payload);
        // 3 = STREAM_ENDED, 4 = STREAM_SUSPENDED
        if (action === 3 || action === 4) this.onDisconnect();
        break;
      }
    }
  }

  private onDisconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.clearHb();
    this.ws = null;
    this.options.onStatusChange?.('disconnected');
  }

  private clearHb(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
  }

  private emitMsg(msg: ChatMessage): void {
    for (const h of this.messageHandlers) { try { h(msg); } catch { /* ignore */ } }
  }

  private emitEv(ev: StreamEvent): void {
    for (const h of this.eventHandlers) { try { h(ev); } catch { /* ignore */ } }
  }
}

function ts(): string {
  return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date());
}
