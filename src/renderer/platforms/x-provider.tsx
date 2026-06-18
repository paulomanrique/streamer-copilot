import { useState } from 'react';

import type { XLiveStats } from '../../shared/types.js';
import { registerPlatformProvider, type AuthStepProps } from './registry.js';
import { fmtNum } from './live-entry.js';

function normalizeXHandle(raw: string): string {
  let value = raw.trim();
  // Accept full URLs (https://x.com/@user, x.com/user, twitter.com/user)
  value = value.replace(/^https?:\/\//, '').replace(/^www\./, '');
  value = value.replace(/^(?:twitter|x)\.com\//, '');
  value = value.replace(/^@/, '').replace(/^\/+|\/+$/g, '');
  return value.split(/[/?#]/)[0] ?? '';
}

function XAuthStep({ draft, updateDraft, channel, setChannel, setError }: AuthStepProps) {
  const broadcastUrl = String(draft.broadcastUrl ?? '');
  const [openingLogin, setOpeningLogin] = useState(false);

  async function openLogin() {
    setOpeningLogin(true);
    setError(null);
    try {
      await window.copilot.xOpenLogin();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setOpeningLogin(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs uppercase text-gray-500 mb-1">X handle</label>
        <input
          type="text"
          placeholder="handle (without @)"
          value={channel}
          onChange={(e) => setChannel(normalizeXHandle(e.target.value))}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
        />
        <p className="text-xs text-gray-500 mt-2">
          Read-only access to the broadcast chat. The user must be live. With an X login the app auto-detects
          the live broadcast from the handle each time the user goes live.
        </p>
      </div>
      <div className="rounded border border-gray-700 bg-gray-900/50 p-3">
        <p className="text-xs text-gray-300 font-medium mb-1">Entrar no X</p>
        <p className="text-xs text-gray-500 mb-3">
          Necessário para a <strong className="text-gray-300">detecção automática</strong> da live (o X não
          expõe isso sem login). A leitura do chat continua anônima. Abre uma janela de login do X; os cookies
          ficam guardados na sessão do app.
        </p>
        <button
          type="button"
          disabled={openingLogin}
          onClick={() => void openLogin()}
          className="px-4 py-2 rounded bg-slate-600/30 border border-slate-500/40 text-slate-200 hover:bg-slate-600/40 disabled:opacity-50 text-sm"
        >
          {openingLogin ? 'Abrindo login…' : 'Entrar no X'}
        </button>
      </div>
      <div>
        <label className="block text-xs uppercase text-gray-500 mb-1">Broadcast URL (fallback, optional)</label>
        <input
          type="text"
          placeholder="https://x.com/i/broadcasts/..."
          value={broadcastUrl}
          onChange={(e) => updateDraft({ broadcastUrl: e.target.value.trim() })}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
        />
        <p className="text-xs text-gray-500 mt-2">
          Sem login (ou se a auto-detecção falhar), cole a URL da live aqui e ela será usada direto.
        </p>
      </div>
    </div>
  );
}

registerPlatformProvider({
  id: 'x',
  displayName: 'X',
  accentClass: 'border-l-slate-400',
  supportsMultipleAccounts: true,
  // Official X logo glyph (24×24).
  icon: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  badge: {
    bg: 'bg-slate-500/20',
    text: 'text-slate-200',
    rowBorder: 'border-slate-500/20',
  },
  accentBg: 'bg-slate-400',
  bannerBorderColor: 'rgba(148,163,184,0.2)',
  card: {
    classes: 'bg-slate-500/10 border-slate-500/20 text-slate-200',
    metaClass: 'text-slate-300',
  },
  liveLink: {
    color: 'text-slate-300',
    border: 'border-slate-500/30',
    btnBg: 'bg-slate-600/30 hover:bg-slate-600/50 text-slate-200',
  },
  subscriberBadge: 'subscriber',
  authorAtPrefix: false,
  hasNativeBadgeUrls: false,
  supportedRoles: ['everyone', 'moderator', 'broadcaster'],
  hasSubscriberTiers: false,
  canSendMessages: false,
  liveEntries: ({ liveStats, status, primaryChannel }) => {
    const keys = Object.keys(liveStats);
    const handles = keys.length > 0 ? keys : (status === 'connected' && primaryChannel ? [primaryChannel] : []);
    const multi = handles.length > 1;
    return handles.map((handle) => {
      const s = liveStats[handle] as XLiveStats | undefined;
      return {
        key: `x:${handle}`,
        platformId: 'x',
        isLive: s?.isLive ?? true,
        liveUrl: `https://x.com/${handle}`,
        linkLabel: `X @${handle}`,
        cardLabel: multi ? `X · @${handle}` : 'X',
        value: s ? fmtNum(s.viewerCount) : '—',
        valueLabel: 'viewers',
      };
    });
  },
  profileUrl: (handle) => {
    const username = normalizeXHandle(handle);
    return username ? `https://x.com/${encodeURIComponent(username)}` : '';
  },
  AuthStep: XAuthStep,
  validate(channel) {
    if (!channel) return 'X handle is required';
    return null;
  },
  defaultLabel(channel) { return `@${channel}`; },
});
