import { useState } from 'react';

import type { PlatformLiveEntry } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { getPlatformProviderOrFallback } from '../platforms/registry.js';

/** Build a single live-link row using the platform registry — every
 *  consumer of this helper just supplies the per-row label / URL pair. */
function makeLiveLink(
  platformId: string,
  id: string,
  label: string,
  full: string,
): {
  id: string;
  label: string;
  url: string;
  full: string;
  icon: string;
  color: string;
  border: string;
  btnBg: string;
} {
  const meta = getPlatformProviderOrFallback(platformId);
  return {
    id,
    label,
    url: full.replace(/^https?:\/\//, ''),
    full,
    icon: meta.icon,
    color: meta.liveLink.color,
    border: meta.liveLink.border,
    btnBg: meta.liveLink.btnBg,
  };
}

/** LIVE / OFFLINE pill for the status bar. Clicking it while live opens the
 *  live-links modal to copy each output's public URL. */
export function LiveIndicator({ liveEntries }: { liveEntries: PlatformLiveEntry[] }) {
  const { messages, t } = useI18n();
  const [liveOpen, setLiveOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Live links come straight from the registry-produced entries — no
  // per-platform branches or hardcoded URLs here (see AGENTS.md). The modal
  // shows only entries currently live.
  const liveLinks = liveEntries
    .filter((entry) => entry.isLive)
    .map((entry) => makeLiveLink(entry.platformId, entry.key, entry.linkLabel, entry.liveUrl));
  const isAnyLive = liveLinks.length > 0;

  const copyLink = (id: string, url: string) => {
    navigator.clipboard.writeText(url).catch(() => null);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const copyAll = () => {
    const text = liveLinks.map((l) => `${l.label}: ${l.full}`).join('\n');
    navigator.clipboard.writeText(text).catch(() => null);
    setCopiedId('all');
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setLiveOpen(true)}
        disabled={!isAnyLive}
        title={isAnyLive ? t('Live Links') : undefined}
        className={isAnyLive
          ? 'flex items-center gap-1.5 h-5 px-2 rounded bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold uppercase tracking-wide transition-colors'
          : 'flex items-center gap-1.5 h-5 px-2 rounded bg-gray-800 text-gray-500 text-[11px] font-bold uppercase tracking-wide cursor-not-allowed'}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${isAnyLive ? 'pulse-dot bg-white' : 'bg-gray-500'}`} />
        {isAnyLive ? messages.common.status.live : messages.common.status.offline}
      </button>

      {liveOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 whitespace-normal text-base text-gray-200">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setLiveOpen(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            {/* header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <span className="pulse-dot w-2 h-2 rounded-full bg-red-500" />
                <h3 className="font-semibold text-gray-100">{t('Live Links')}</h3>
              </div>
              <button type="button" onClick={() => setLiveOpen(false)}
                className="text-gray-400 hover:text-white transition-colors text-lg leading-none">✕</button>
            </div>

            {/* body */}
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500 mb-4">{t('Copy links to share each live output on social media.')}</p>

              {liveLinks.length === 0 ? (
                <div className="text-sm text-gray-500 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5">
                  {t('No live outputs detected.')}
                </div>
              ) : null}

              {liveLinks.map(({ id, label, url, full, icon, color, border, btnBg }) => (
                <div key={id} className={`flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-2.5 border ${border}`}>
                  <span className={`${color} shrink-0`}>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d={icon} /></svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide leading-none mb-0.5">{label}</p>
                    <p className="text-sm text-gray-300 font-mono truncate">{url}</p>
                  </div>
                  <button type="button" onClick={() => copyLink(id, full)}
                    className={`shrink-0 text-xs px-2 py-1 rounded transition-colors ${btnBg}`}>
                    {copiedId === id ? '✓' : t('Copy')}
                  </button>
                </div>
              ))}

              <button type="button" onClick={copyAll} disabled={liveLinks.length === 0}
                className="w-full py-2 rounded bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 text-sm border border-violet-600/30 transition-colors mt-1 disabled:opacity-40 disabled:cursor-not-allowed">
                {copiedId === 'all' ? `✓ ${t('Copied!')}` : t('Copy all links')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
