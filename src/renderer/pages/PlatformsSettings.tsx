import { useEffect, useRef, useState } from 'react';
import type { KickAuthStatus, KickConnectionStatus, KickSettings, TikTokConnectionStatus, TikTokSettings, TwitchConnectionStatus, TwitchCredentials, YouTubeChatChannel, YouTubeSettings, YouTubeStreamInfo } from '../../shared/types.js';
import { ConnectedAccounts } from '../components/ConnectedAccounts.js';

interface LiveCheckResult {
  handle: string;
  videoIds: string[];
}

type Step = 'idle' | 'waiting-browser' | 'confirm-channel';

// ── Shared UI Atoms ───────────────────────────────────────────────────────────

function StatusPill({ color, label, pulse = false }: { color: 'green' | 'yellow' | 'red' | 'gray'; label: string; pulse?: boolean }) {
  const bg = { green: 'bg-green-500/15 text-green-400', yellow: 'bg-yellow-500/15 text-yellow-400', red: 'bg-red-500/15 text-red-400', gray: 'bg-gray-700 text-gray-400' }[color];
  const dot = { green: 'bg-green-400', yellow: 'bg-yellow-400', red: 'bg-red-400', gray: 'bg-gray-500' }[color];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot} ${pulse ? 'animate-pulse' : ''}`} />
      {label}
    </span>
  );
}

function PlatformCard({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <div className={`bg-gray-800/50 border border-gray-700/60 rounded-xl overflow-hidden border-l-4 ${accent}`}>
      {children}
    </div>
  );
}

function CardHeader({ icon, name, status }: { icon: React.ReactNode; name: string; status: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-4">
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm font-semibold text-gray-100">{name}</span>
      </div>
      {status}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Platform Icons ────────────────────────────────────────────────────────────

function TwitchIcon() {
  return (
    <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
      <svg className="w-4.5 h-4.5 text-purple-400 w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
      </svg>
    </div>
  );
}

function YouTubeIcon() {
  return (
    <div className="w-9 h-9 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
      <svg className="w-[18px] h-[18px] text-red-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z" />
      </svg>
    </div>
  );
}

function KickIcon() {
  return (
    <div className="w-9 h-9 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
      <svg className="w-[18px] h-[18px] text-green-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M2 2h4v8l4-4h4l-6 6 6 6h-4l-4-4v4H2V2zm14 0h4v20h-4z" />
      </svg>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function PlatformsSettingsPage() {
  const channelRef = useRef<HTMLInputElement>(null);

  // Twitch
  const [status, setStatus] = useState<TwitchConnectionStatus>('disconnected');
  const [savedCreds, setSavedCreds] = useState<TwitchCredentials | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [pendingToken, setPendingToken] = useState('');
  const [pendingUsername, setPendingUsername] = useState('');
  const [channel, setChannel] = useState('');
  const [isEditingChannel, setIsEditingChannel] = useState(false);

  // YouTube
  const [ytStreams, setYtStreams] = useState<YouTubeStreamInfo[]>([]);
  const [ytSettings, setYtSettings] = useState<YouTubeSettings>({ channels: [], autoConnect: true });
  const [newChannelHandle, setNewChannelHandle] = useState('');
  const [isSavingYtSettings, setIsSavingYtSettings] = useState(false);
  const [checkingHandle, setCheckingHandle] = useState<string | null>(null);
  const [liveCheckResult, setLiveCheckResult] = useState<LiveCheckResult | null>(null);
  const [ytChatChannels, setYtChatChannels] = useState<YouTubeChatChannel[]>([]);
  const [isLoadingChatChannels, setIsLoadingChatChannels] = useState(false);
  const [chatChannelError, setChatChannelError] = useState<string | null>(null);

  // Kick
  const [kickStatus, setKickStatus] = useState<KickConnectionStatus>('disconnected');
  const [kickSlug, setKickSlug] = useState<string | null>(null);
  const [kickAuth, setKickAuth] = useState<KickAuthStatus>({ channelSlug: null, expiresAt: null, scope: null, isAuthorized: false });
  const [kickSettings, setKickSettings] = useState<KickSettings>({ channelInput: '', clientId: '', clientSecret: '', autoConnect: false });

  // TikTok (disabled but still tracked)
  const [, setTiktokStatus] = useState<TikTokConnectionStatus>('disconnected');
  const [, setTiktokSettings] = useState<TikTokSettings>({ username: '', autoConnect: false });

  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [
        currentStatus, creds, ytConnected, ytSaved,
        tiktokCurrentStatus, tiktokSaved,
        kickCurrentStatus, kickSaved, kickAuthStatus,
      ] = await Promise.all([
        window.copilot.twitchGetStatus(),
        window.copilot.twitchGetCredentials(),
        window.copilot.youtubeGetStatus(),
        window.copilot.youtubeGetSettings(),
        window.copilot.tiktokGetStatus(),
        window.copilot.tiktokGetSettings(),
        window.copilot.kickGetStatus(),
        window.copilot.kickGetSettings(),
        window.copilot.kickGetAuthStatus(),
      ]);
      setStatus(currentStatus);
      setSavedCreds(creds);
      setYtStreams(ytConnected);
      setYtSettings(ytSaved);
      setTiktokStatus(tiktokCurrentStatus);
      setTiktokSettings(tiktokSaved);
      setKickStatus(kickCurrentStatus);
      setKickSettings(kickSaved);
      setKickAuth(kickAuthStatus);
    })();

    const unsubTwitch = window.copilot.onTwitchStatus((s) => setStatus(s));
    const unsubYt = window.copilot.onYoutubeStatus((s) => setYtStreams(s));
    const unsubTiktok = window.copilot.onTiktokStatus((s) => setTiktokStatus(s));
    const unsubKick = window.copilot.onKickStatus((s, slug) => { setKickStatus(s); setKickSlug(slug); });

    return () => { unsubTwitch(); unsubYt(); unsubTiktok(); unsubKick(); };
  }, []);

  // ── Twitch Actions ────────────────────────────────────────────────────────

  const startOAuth = async () => {
    setError(null);
    setStep('waiting-browser');
    try {
      const { accessToken, username } = await window.copilot.twitchStartOAuth();
      setPendingToken(accessToken);
      setPendingUsername(username);
      setChannel(username);
      setStep('confirm-channel');
      requestAnimationFrame(() => channelRef.current?.focus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'OAuth failed');
      setStep('idle');
    }
  };

  const confirmConnect = async () => {
    if (!channel.trim()) { setError('Channel is required'); return; }
    setIsBusy(true);
    setError(null);
    try {
      await window.copilot.twitchConnect({ channel: channel.trim().replace(/^#/, '').toLowerCase(), username: pendingUsername, oauthToken: `oauth:${pendingToken}` });
      setSavedCreds(await window.copilot.twitchGetCredentials());
      setStep('idle');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to connect');
    } finally { setIsBusy(false); }
  };

  const saveEditedChannel = async () => {
    if (!channel.trim() || !savedCreds) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.copilot.twitchConnect({ channel: channel.trim().replace(/^#/, '').toLowerCase(), username: savedCreds.username, oauthToken: savedCreds.oauthToken });
      setSavedCreds(await window.copilot.twitchGetCredentials());
      setIsEditingChannel(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to update channel');
    } finally { setIsBusy(false); }
  };

  const disconnectTwitch = async () => {
    setIsBusy(true);
    try { await window.copilot.twitchDisconnect(); setSavedCreds(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Failed to disconnect'); }
    finally { setIsBusy(false); }
  };

  // ── YouTube Actions ───────────────────────────────────────────────────────

  const saveYtSettings = async (next: YouTubeSettings) => {
    const prev = ytSettings;
    setYtSettings(next);
    setIsSavingYtSettings(true);
    try {
      const saved = await window.copilot.youtubeSaveSettings(next);
      setYtSettings(saved);
      return saved;
    } catch (cause) {
      setYtSettings(prev);
      throw cause;
    } finally { setIsSavingYtSettings(false); }
  };

  const normalizeYtHandle = (raw: string): string => {
    try {
      const url = new URL(raw);
      const parts = url.pathname.replace(/^\//, '').split('/');
      return parts[0] ?? raw;
    } catch {
      return raw.startsWith('@') ? raw : `@${raw}`;
    }
  };

  const addYouTubeChannel = async () => {
    const raw = newChannelHandle.trim();
    if (!raw || isSavingYtSettings) return;
    const handle = normalizeYtHandle(raw);
    await saveYtSettings({ ...ytSettings, channels: [...ytSettings.channels, { id: crypto.randomUUID(), handle, enabled: true }] });
    setNewChannelHandle('');
  };

  const removeYouTubeChannel = async (id: string) => {
    if (isSavingYtSettings) return;
    await saveYtSettings({ ...ytSettings, channels: ytSettings.channels.filter(c => c.id !== id) });
  };

  const toggleYouTubeChannel = async (id: string) => {
    if (isSavingYtSettings) return;
    await saveYtSettings({ ...ytSettings, channels: ytSettings.channels.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c) });
  };

  const checkChannelLive = async (handle: string) => {
    setCheckingHandle(handle);
    try {
      const result = await window.copilot.youtubeCheckLive(handle);
      setLiveCheckResult({ handle, videoIds: result.videoIds });
    } finally { setCheckingHandle(null); }
  };

  const loadYtChatChannels = async () => {
    setIsLoadingChatChannels(true);
    setChatChannelError(null);
    try {
      const channels = await (window.copilot as any).youtubeGetChatChannels() as YouTubeChatChannel[];
      setYtChatChannels(channels);
    } catch (cause) {
      setChatChannelError(cause instanceof Error ? cause.message : 'Failed to load channels');
    } finally { setIsLoadingChatChannels(false); }
  };

  const selectYtChatChannel = async (pageId: string) => {
    const ch = ytChatChannels.find((c) => c.pageId === pageId);
    await saveYtSettings({ ...ytSettings, chatChannelPageId: pageId || undefined, chatChannelName: ch?.name || undefined });
  };

  // ── Kick Actions ──────────────────────────────────────────────────────────

  const saveKickSettings = async (next: KickSettings) => {
    setKickSettings(next);
    await window.copilot.kickSaveSettings(next);
  };

  const connectKick = async () => {
    if (!kickSettings.channelInput.trim()) { setError('Kick channel slug or URL is required'); return; }
    setIsBusy(true);
    setError(null);
    try {
      await window.copilot.kickSaveSettings(kickSettings);
      await window.copilot.kickConnect({ channelInput: kickSettings.channelInput.trim(), clientId: '', clientSecret: '' });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Failed to connect to Kick'); }
    finally { setIsBusy(false); }
  };

  const authorizeKick = async () => {
    setIsBusy(true);
    setError(null);
    try {
      await window.copilot.kickSaveSettings(kickSettings);
      const { channelSlug } = await window.copilot.kickStartOAuth();
      const authStatus = await window.copilot.kickGetAuthStatus();
      setKickAuth({ ...authStatus, channelSlug: authStatus.channelSlug ?? channelSlug, isAuthorized: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Failed to authorize Kick'); }
    finally { setIsBusy(false); }
  };

  const disconnectKick = async () => {
    setIsBusy(true);
    try { await window.copilot.kickDisconnect(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Failed to disconnect Kick'); }
    finally { setIsBusy(false); }
  };

  // ── Twitch Status Helpers ─────────────────────────────────────────────────

  const twitchStatus = (): { color: 'green' | 'yellow' | 'gray' | 'red'; label: string; pulse?: boolean } => {
    if (step === 'waiting-browser') return { color: 'yellow', label: 'Waiting for authorization…', pulse: true };
    if (step === 'confirm-channel') return { color: 'yellow', label: 'Almost there…', pulse: true };
    if (status === 'connected') return { color: 'green', label: savedCreds ? `#${savedCreds.channel}` : 'Connected' };
    if (status === 'connecting') return { color: 'yellow', label: 'Connecting…', pulse: true };
    if (status === 'error') return { color: 'red', label: 'Connection error' };
    return { color: 'gray', label: 'Disconnected' };
  };

  const ytStatus = () => {
    if (ytStreams.length > 0) return { color: 'green' as const, label: `${ytStreams.length} live${ytStreams.length > 1 ? 's' : ''} connected` };
    return { color: 'gray' as const, label: 'Monitoring' };
  };

  const kickStatusInfo = () => {
    if (kickStatus === 'connected') return { color: 'green' as const, label: kickSlug ?? 'Connected' };
    if (kickStatus === 'connecting') return { color: 'yellow' as const, label: 'Connecting…', pulse: true };
    if (kickStatus === 'error') return { color: 'red' as const, label: 'Connection error' };
    return { color: 'gray' as const, label: 'Disconnected' };
  };

  return (
    <>
      <div className="min-h-full p-6 max-w-lg">
        <h2 className="text-base font-semibold mb-0.5">Platforms</h2>
        <p className="text-sm text-gray-500 mb-6">Connect your streaming accounts to enable chat integration.</p>

        <ConnectedAccounts />

        <details className="mb-4 text-xs text-gray-500">
          <summary className="cursor-pointer text-gray-400 hover:text-gray-200">Legacy connection panels</summary>
          <p className="mt-2">
            The panels below are kept for backward compatibility while the new wizard is rolled out. New connections
            should use <strong>Add network</strong> above. These will be removed in a future release.
          </p>
        </details>

        {error && (
          <div className="mb-4 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5">
            <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-xs text-red-300 flex-1">{error}</p>
            <button type="button" onClick={() => setError(null)} className="text-red-400/60 hover:text-red-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        <div className="space-y-3">

          {/* ── Twitch ──────────────────────────────────────────────────── */}
          <PlatformCard accent="border-l-purple-500">
            <CardHeader
              icon={<TwitchIcon />}
              name="Twitch"
              status={<StatusPill {...twitchStatus()} />}
            />

            {status === 'connected' && step === 'idle' && !isEditingChannel && (
              <div className="px-5 pb-4 flex items-center justify-between border-t border-gray-700/40 pt-3">
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="font-mono text-xs">{savedCreds?.username}</span>
                  <span className="text-gray-600">·</span>
                  <button type="button" onClick={() => { setChannel(savedCreds?.channel ?? ''); setIsEditingChannel(true); }} className="text-xs text-purple-400 hover:text-purple-300">
                    Edit channel
                  </button>
                </div>
                <button type="button" onClick={() => void disconnectTwitch()} disabled={isBusy} className="text-xs px-3 py-1.5 rounded-lg bg-gray-700/80 text-gray-300 hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  Disconnect
                </button>
              </div>
            )}

            {isEditingChannel && (
              <div className="px-5 pb-4 border-t border-gray-700/40 pt-3">
                <label className="block text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-2">Join a different channel</label>
                <div className="flex gap-2">
                  <input
                    ref={channelRef}
                    type="text"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void saveEditedChannel()}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 px-3 py-1.5 focus:outline-none focus:border-purple-500 font-mono"
                  />
                  <button type="button" onClick={() => setIsEditingChannel(false)} className="px-3 py-1.5 rounded-lg bg-gray-700 text-xs text-gray-300">Cancel</button>
                  <button type="button" disabled={isBusy} onClick={() => void saveEditedChannel()} className="px-3 py-1.5 rounded-lg bg-purple-600 text-xs font-medium text-white disabled:opacity-50">Save</button>
                </div>
              </div>
            )}

            {step === 'waiting-browser' && (
              <div className="px-5 pb-4 border-t border-gray-700/40 pt-3">
                <div className="flex items-center justify-between bg-yellow-500/8 border border-yellow-500/20 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Spinner />
                    <p className="text-xs text-gray-300">Complete the authorization in the browser window that opened…</p>
                  </div>
                  <button type="button" onClick={() => setStep('idle')} className="text-xs text-gray-500 hover:text-gray-300 ml-3">Cancel</button>
                </div>
              </div>
            )}

            {step === 'confirm-channel' && (
              <div className="px-5 pb-4 border-t border-gray-700/40 pt-3 space-y-3">
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                  Authorized as <span className="font-mono font-medium">{pendingUsername}</span>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Channel to join <span className="text-purple-400">*</span></label>
                  <input
                    ref={channelRef}
                    type="text"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void confirmConnect()}
                    placeholder="mychannel"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 px-3 py-2 focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep('idle')} className="flex-1 px-3 py-2 rounded-lg bg-gray-700 text-sm text-gray-300">Cancel</button>
                  <button type="button" disabled={isBusy} onClick={() => void confirmConnect()} className="flex-1 px-3 py-2 rounded-lg bg-purple-600 text-sm font-medium disabled:opacity-60">
                    {isBusy ? 'Connecting…' : 'Connect'}
                  </button>
                </div>
              </div>
            )}

            {step === 'idle' && status !== 'connected' && !isEditingChannel && (
              <div className="px-5 pb-4 border-t border-gray-700/40 pt-3">
                <button type="button" onClick={() => void startOAuth()} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-medium transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
                  </svg>
                  Connect with Twitch
                </button>
              </div>
            )}
          </PlatformCard>

          {/* ── YouTube ─────────────────────────────────────────────────── */}
          <PlatformCard accent="border-l-red-500">
            <CardHeader
              icon={<YouTubeIcon />}
              name="YouTube"
              status={<StatusPill {...ytStatus()} />}
            />

            {/* Active live streams */}
            {ytStreams.length > 0 && (
              <div className="mx-5 mb-4 rounded-lg bg-red-500/8 border border-red-500/20 overflow-hidden">
                <div className="px-3 py-2 border-b border-red-500/15 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Live now</span>
                  <button
                    type="button"
                    onClick={() => void window.copilot.youtubeDisconnect()}
                    className="text-[10px] text-red-400/70 hover:text-red-400 transition-colors"
                  >
                    Disconnect all
                  </button>
                </div>
                {ytStreams.map((stream) => (
                  <div key={stream.videoId} className="flex items-center justify-between px-3 py-2 border-b border-red-500/10 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
                      <span className="text-xs text-gray-200 font-medium truncate">{stream.channelHandle ?? stream.videoId}</span>
                      {stream.viewerCount !== null && (
                        <span className="text-[10px] text-gray-500 shrink-0">{stream.viewerCount.toLocaleString()} viewers</span>
                      )}
                    </div>
                    <a href={stream.liveUrl} target="_blank" rel="noreferrer" className="text-red-400/50 hover:text-red-400 ml-2 shrink-0">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* Channel monitoring */}
            <div className="px-5 pb-4 border-t border-gray-700/40 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-200">Channel monitoring</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Channels watched for live detection</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-gray-500">Auto-connect</span>
                  <button
                    type="button"
                    disabled={isSavingYtSettings}
                    onClick={() => void saveYtSettings({ ...ytSettings, autoConnect: !ytSettings.autoConnect })}
                    className={`w-8 h-4 rounded-full transition-colors relative shrink-0 overflow-hidden ${ytSettings.autoConnect ? 'bg-red-600' : 'bg-gray-600'} disabled:opacity-50`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${ytSettings.autoConnect ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="@handle or channel URL"
                  value={newChannelHandle}
                  onChange={(e) => setNewChannelHandle(e.target.value)}
                  disabled={isSavingYtSettings}
                  onKeyDown={(e) => e.key === 'Enter' && void addYouTubeChannel()}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 px-3 py-1.5 focus:outline-none focus:border-red-500 font-mono placeholder:text-gray-600"
                />
                <button
                  type="button"
                  disabled={isSavingYtSettings || !newChannelHandle.trim()}
                  onClick={() => void addYouTubeChannel()}
                  className="px-3 py-1.5 rounded-lg bg-gray-700 text-xs font-medium hover:bg-gray-600 disabled:opacity-50 transition-colors"
                >
                  {isSavingYtSettings ? <Spinner /> : 'Add'}
                </button>
              </div>

              {ytSettings.channels.length > 0 ? (
                <div className="space-y-1.5">
                  {ytSettings.channels.map(c => {
                    const normalHandle = c.handle.startsWith('@') ? c.handle : `@${c.handle}`;
                    const isActive = ytStreams.some(s => s.channelHandle === c.handle || s.channelHandle === normalHandle);
                    const result = liveCheckResult?.handle === c.handle ? liveCheckResult : null;
                    return (
                      <div key={c.id} className="flex items-center justify-between px-3 py-2 bg-gray-900/60 rounded-lg border border-gray-700/40">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => void toggleYouTubeChannel(c.id)}
                            disabled={isSavingYtSettings}
                            className={`w-8 h-4 rounded-full transition-colors relative shrink-0 overflow-hidden ${c.enabled ? 'bg-red-600' : 'bg-gray-600'} disabled:opacity-50`}
                          >
                            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${c.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                          </button>
                          <span className={`text-xs font-mono truncate ${c.enabled ? 'text-gray-200' : 'text-gray-500'}`}>{c.handle}</span>
                          {isActive && <span className="text-[9px] font-semibold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded shrink-0">LIVE</span>}
                          {result && !isActive && (
                            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0 ${result.videoIds.length > 0 ? 'text-red-400 bg-red-500/15' : 'text-gray-500 bg-gray-700/60'}`}>
                              {result.videoIds.length > 0 ? 'LIVE' : 'offline'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            type="button"
                            disabled={checkingHandle === c.handle}
                            onClick={() => void checkChannelLive(c.handle)}
                            className="text-[10px] px-2 py-1 rounded bg-gray-700/80 text-gray-400 hover:bg-gray-700 hover:text-gray-200 disabled:opacity-40 flex items-center gap-1 transition-colors"
                          >
                            {checkingHandle === c.handle ? <Spinner /> : 'Check'}
                          </button>
                          <button
                            type="button"
                            disabled={isSavingYtSettings}
                            onClick={() => void removeYouTubeChannel(c.id)}
                            className="p-1.5 text-gray-600 hover:text-red-400 disabled:opacity-40 transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-600 italic text-center py-2">No channels added yet. Paste a @handle or channel URL above.</p>
              )}
            </div>

            {/* Account / login */}
            <div className="mx-5 mb-5 rounded-lg border border-gray-700/50 bg-gray-900/40 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-700/40 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-300">YouTube account</p>
                <button
                  type="button"
                  onClick={() => void window.copilot.youtubeOpenLogin()}
                  className="flex items-center gap-1.5 text-[11px] text-red-400/80 hover:text-red-400 transition-colors font-medium"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Log in / switch account
                </button>
              </div>

              <div className="px-4 py-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-gray-400">Channel for sending messages</p>
                  <button
                    type="button"
                    onClick={() => void loadYtChatChannels()}
                    disabled={isLoadingChatChannels}
                    className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-50"
                  >
                    {isLoadingChatChannels ? <Spinner /> : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                    Load
                  </button>
                </div>

                {chatChannelError && (
                  <p className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">{chatChannelError}</p>
                )}

                {ytChatChannels.length > 0 ? (
                  <div className="space-y-1">
                    {ytChatChannels.map((ch, i) => {
                      const key = ch.pageId || ch.handle || String(i);
                      const isSelected = ch.pageId
                        ? ytSettings.chatChannelPageId === ch.pageId
                        : !ytSettings.chatChannelPageId && ch.isSelected;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => void selectYtChatChannel(ch.pageId)}
                          disabled={isSavingYtSettings}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs transition-colors ${
                            isSelected
                              ? 'bg-red-500/15 border-red-500/40 text-gray-200'
                              : 'bg-gray-800/60 border-gray-700/40 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                          } disabled:opacity-50`}
                        >
                          <span className={`w-3 h-3 rounded-full border-2 shrink-0 flex items-center justify-center ${isSelected ? 'border-red-400 bg-red-400' : 'border-gray-600'}`}>
                            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                          <span className="font-medium truncate">{ch.name || ch.handle}</span>
                          {ch.handle && ch.name && <span className="font-mono text-[10px] text-gray-500 ml-auto shrink-0">{ch.handle}</span>}
                        </button>
                      );
                    })}
                  </div>
                ) : !chatChannelError && (
                  <p className="text-[10px] text-gray-600 italic">After logging in, click &quot;Load&quot; to choose which channel sends messages.</p>
                )}
              </div>
            </div>
          </PlatformCard>

          {/* ── Kick ────────────────────────────────────────────────────── */}
          <PlatformCard accent="border-l-green-500">
            <CardHeader
              icon={<KickIcon />}
              name="Kick"
              status={<StatusPill {...kickStatusInfo()} />}
            />

            {kickStatus === 'connected' ? (
              <div className="px-5 pb-4 flex items-center justify-between border-t border-gray-700/40 pt-3">
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="font-mono text-xs">{kickSlug}</span>
                </div>
                <button type="button" onClick={() => void disconnectKick()} disabled={isBusy} className="text-xs px-3 py-1.5 rounded-lg bg-gray-700/80 text-gray-300 hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  Disconnect
                </button>
              </div>
            ) : (
              <div className="px-5 pb-4 border-t border-gray-700/40 pt-3 space-y-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Channel slug or URL <span className="text-green-400">*</span></label>
                  <input
                    type="text"
                    value={kickSettings.channelInput}
                    onChange={(e) => setKickSettings({ ...kickSettings, channelInput: e.target.value })}
                    onBlur={() => void saveKickSettings(kickSettings)}
                    onKeyDown={(e) => e.key === 'Enter' && void connectKick()}
                    placeholder="gaules or https://kick.com/gaules"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg text-sm text-gray-200 px-3 py-1.5 focus:outline-none focus:border-green-500 font-mono placeholder:text-gray-600"
                  />
                </div>

                <div className="bg-gray-900/60 border border-gray-700/40 rounded-lg px-3.5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-200">Chat authorization</p>
                      <p className="mt-0.5 text-[11px] text-gray-500 leading-snug">
                        {kickAuth.isAuthorized && kickAuth.channelSlug
                          ? `Authorized as ${kickAuth.channelSlug} — can send messages`
                          : 'Authorize to send messages. Reading chat works without it.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void authorizeKick()}
                      disabled={isBusy}
                      className="shrink-0 rounded-lg bg-green-700 hover:bg-green-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50 transition-colors"
                    >
                      {kickAuth.isAuthorized ? 'Re-authorize' : 'Authorize'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label htmlFor="kick-auto-connect" className="text-xs text-gray-400 cursor-pointer select-none">Auto-connect on startup</label>
                  <button
                    id="kick-auto-connect"
                    type="button"
                    onClick={() => { const next = { ...kickSettings, autoConnect: !kickSettings.autoConnect }; setKickSettings(next); void saveKickSettings(next); }}
                    className={`w-8 h-4 rounded-full transition-colors relative shrink-0 overflow-hidden ${kickSettings.autoConnect ? 'bg-green-600' : 'bg-gray-600'}`}
                  >
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${kickSettings.autoConnect ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isBusy || !kickSettings.channelInput.trim()}
                  onClick={() => void connectKick()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-500 text-sm font-medium disabled:opacity-50 transition-colors"
                >
                  {kickStatus === 'connecting' ? <><Spinner /> Connecting…</> : 'Connect'}
                </button>
              </div>
            )}
          </PlatformCard>

        </div>
      </div>

      {/* Live check modal */}
      {liveCheckResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setLiveCheckResult(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-6 w-80 text-center" onClick={(e) => e.stopPropagation()}>
            {liveCheckResult.videoIds.length > 0 ? (
              <>
                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-green-400 mb-1">
                  {liveCheckResult.videoIds.length === 1 ? 'Live detected!' : `${liveCheckResult.videoIds.length} lives detected!`}
                </p>
                <p className="text-xs text-gray-400 mb-2">{liveCheckResult.handle}</p>
                <div className="space-y-1">
                  {liveCheckResult.videoIds.map((id) => (
                    <p key={id} className="text-[10px] font-mono text-gray-500 bg-gray-800 rounded px-2 py-1">{id}</p>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-300 mb-1">Not live right now</p>
                <p className="text-xs text-gray-500">{liveCheckResult.handle} doesn't appear to be streaming.</p>
              </>
            )}
            <button type="button" onClick={() => setLiveCheckResult(null)} className="mt-4 px-4 py-1.5 rounded-lg bg-gray-700 text-xs text-gray-300 hover:bg-gray-600">Close</button>
          </div>
        </div>
      )}
    </>
  );
}
