import { useState } from 'react';

import type { LinkedInLiveStats, PlatformAccount } from '../../shared/types.js';
import { linkedInProfileUrl, normalizeLinkedInChannel, parseLinkedInLiveRef } from '../../shared/linkedin-live.js';
import { registerPlatformProvider, type AuthStepProps } from './registry.js';
import { LiveUrlAccountAction } from './live-url-editor.js';
import { fmtNum } from './live-entry.js';

const LIVE_URL_PLACEHOLDER = 'https://www.linkedin.com/events/.../theater/';

function isValidLiveUrl(raw: string): boolean {
  return !raw.trim() || parseLinkedInLiveRef(raw) !== null;
}

function LinkedInAuthStep({ draft, updateDraft, channel, setChannel, setError }: AuthStepProps) {
  const liveUrl = String(draft.liveUrl ?? '');
  const [openingLogin, setOpeningLogin] = useState(false);

  async function openLogin() {
    setOpeningLogin(true);
    setError(null);
    try {
      await window.copilot.linkedinOpenLogin();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setOpeningLogin(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs uppercase text-gray-500 mb-1">Perfil ou página</label>
        <input
          type="text"
          placeholder="linkedin.com/in/voce ou linkedin.com/company/pagina"
          value={channel}
          onChange={(e) => setChannel(normalizeLinkedInChannel(e.target.value))}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
        />
        <p className="text-xs text-gray-500 mt-2">
          Identifica a conta no app. Os comentários são lidos da página da live, não do perfil.
        </p>
      </div>
      <div className="rounded border border-gray-700 bg-gray-900/50 p-3">
        <p className="text-xs text-gray-300 font-medium mb-1">Entrar no LinkedIn</p>
        <p className="text-xs text-gray-500 mb-3">
          <strong className="text-gray-300">Obrigatório.</strong> O LinkedIn só mostra lives para quem está logado.
          O app lê e envia comentários pela sua sessão; os cookies ficam guardados na sessão do app.
        </p>
        <button
          type="button"
          disabled={openingLogin}
          onClick={() => void openLogin()}
          className="px-4 py-2 rounded bg-sky-600/30 border border-sky-500/40 text-sky-100 hover:bg-sky-600/40 disabled:opacity-50 text-sm"
        >
          {openingLogin ? 'Abrindo login…' : 'Entrar no LinkedIn'}
        </button>
      </div>
      <div>
        <label className="block text-xs uppercase text-gray-500 mb-1">URL da live</label>
        <input
          type="text"
          placeholder={LIVE_URL_PLACEHOLDER}
          value={liveUrl}
          onChange={(e) => updateDraft({ liveUrl: e.target.value.trim() })}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
        />
        <p className="text-xs text-gray-500 mt-2">
          Link do evento ou do post da live. Cada live tem uma URL nova — dá pra trocar depois em
          Conexões → LinkedIn → <strong className="text-gray-300">URL da live</strong>.
        </p>
      </div>
    </div>
  );
}

function LinkedInAccountActions({ account, onChanged }: { account: PlatformAccount; onChanged: () => void }) {
  return (
    <LiveUrlAccountAction
      account={account}
      onChanged={onChanged}
      dataKey="liveUrl"
      title="URL da live do LinkedIn"
      subtitle={<>Conta <span className="text-gray-300">{account.label}</span></>}
      inputLabel="URL da live"
      placeholder={LIVE_URL_PLACEHOLDER}
      help={<>Cole o link do evento ou do post da live atual. Cada live do LinkedIn ganha uma URL nova.</>}
      invalidMessage="URL inválida. Use o link do evento (linkedin.com/events/…) ou do post da live."
      isValid={isValidLiveUrl}
    />
  );
}

registerPlatformProvider({
  id: 'linkedin',
  displayName: 'LinkedIn',
  accentClass: 'border-l-sky-600',
  supportsMultipleAccounts: true,
  // LinkedIn logo glyph (24×24).
  icon: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  badge: {
    bg: 'bg-sky-600/20',
    text: 'text-sky-200',
    rowBorder: 'border-sky-600/20',
  },
  accentBg: 'bg-sky-600',
  bannerBorderColor: 'rgba(2,132,199,0.25)',
  card: {
    classes: 'bg-sky-600/10 border-sky-600/20 text-sky-100',
    metaClass: 'text-sky-300',
  },
  liveLink: {
    color: 'text-sky-300',
    border: 'border-sky-600/30',
    btnBg: 'bg-sky-600/30 hover:bg-sky-600/50 text-sky-100',
  },
  subscriberBadge: 'subscriber',
  authorAtPrefix: false,
  hasNativeBadgeUrls: false,
  supportedRoles: ['everyone', 'broadcaster'],
  hasSubscriberTiers: false,
  canSendMessages: true,
  liveEntries: ({ liveStats, status, primaryChannel }) => {
    const keys = Object.keys(liveStats);
    const channels = keys.length > 0 ? keys : (status === 'connected' && primaryChannel ? [primaryChannel] : []);
    const multi = channels.length > 1;
    return channels.map((channel) => {
      const s = liveStats[channel] as LinkedInLiveStats | undefined;
      return {
        key: `linkedin:${channel}`,
        platformId: 'linkedin',
        isLive: s?.isLive ?? true,
        liveUrl: s?.liveUrl || linkedInProfileUrl(channel),
        linkLabel: `LinkedIn ${channel}`,
        cardLabel: multi ? `LinkedIn · ${channel}` : 'LinkedIn',
        value: s && s.viewerCount !== null ? fmtNum(s.viewerCount) : '—',
        valueLabel: 'viewers',
      };
    });
  },
  profileUrl: linkedInProfileUrl,
  AuthStep: LinkedInAuthStep,
  AccountActions: LinkedInAccountActions,
  validate(channel, providerData) {
    if (!channel) return 'LinkedIn profile or page is required';
    const liveUrl = typeof providerData.liveUrl === 'string' ? providerData.liveUrl : '';
    if (!isValidLiveUrl(liveUrl)) return 'Invalid LinkedIn Live URL — use the event or post link';
    return null;
  },
  defaultLabel(channel) { return channel.replace(/^company\//, ''); },
});
