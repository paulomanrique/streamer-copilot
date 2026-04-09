import { useState } from 'react';

import logoUrl from '../assets/logo.svg';
import type { AppInfo } from '../../shared/types.js';
import type { AppSection } from './SectionTabs.js';

interface AppHeaderProps {
  appInfo: AppInfo | null;
  currentSection: AppSection;
  onChangeSection: (section: AppSection) => void;
  onOpenProfileSelector?: () => void;
}

const LIVE_LINKS = [
  {
    id: 'twitch',
    label: 'Twitch',
    url: 'twitch.tv/mychannel',
    full: 'https://twitch.tv/mychannel',
    icon: 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z',
    color: 'text-purple-400',
    border: 'border-purple-500/30',
    btnBg: 'bg-purple-600/30 hover:bg-purple-600/50 text-purple-300',
  },
  {
    id: 'youtube',
    label: 'YouTube (Horizontal)',
    url: 'youtube.com/live/... (horizontal)',
    full: 'https://youtube.com/live/dQw4w9WgXcQ',
    icon: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
    color: 'text-red-400',
    border: 'border-red-500/30',
    btnBg: 'bg-red-600/30 hover:bg-red-600/50 text-red-300',
  },
  {
    id: 'youtube-v',
    label: 'YouTube (Vertical)',
    url: 'youtube.com/live/... (vertical)',
    full: 'https://youtube.com/live/AbC123Shorts',
    icon: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
    color: 'text-rose-400',
    border: 'border-rose-500/30',
    btnBg: 'bg-rose-600/30 hover:bg-rose-600/50 text-rose-300',
  },
  {
    id: 'kick',
    label: 'Kick',
    url: 'kick.com/mychannel',
    full: 'https://kick.com/mychannel',
    icon: 'M2 2h4v8l4-4h4l-6 6 6 6h-4l-4-4v4H2V2zm14 0h4v20h-4z',
    color: 'text-green-400',
    border: 'border-green-500/30',
    btnBg: 'bg-green-600/30 hover:bg-green-600/50 text-green-300',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    url: 'tiktok.com/@mychannel',
    full: 'https://tiktok.com/@mychannel',
    icon: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.67a8.17 8.17 0 0 0 4.79 1.53V6.75a4.85 4.85 0 0 1-1.02-.06z',
    color: 'text-pink-400',
    border: 'border-pink-500/30',
    btnBg: 'bg-pink-600/30 hover:bg-pink-600/50 text-pink-300',
  },
] as const;

export function AppHeader({ appInfo, currentSection, onChangeSection, onOpenProfileSelector }: AppHeaderProps) {
  const [liveOpen, setLiveOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const appName = appInfo?.appName ?? 'Streamer Copilot';

  const copyLink = (id: string, url: string) => {
    navigator.clipboard.writeText(url).catch(() => null);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const copyAll = () => {
    const text = LIVE_LINKS.map((l) => `${l.label}: ${l.full}`).join('\n');
    navigator.clipboard.writeText(text).catch(() => null);
    setCopiedId('all');
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <>
      <header className="flex items-center gap-4 px-4 h-12 bg-gray-900 border-b border-gray-800 shrink-0 z-10">
        {/* Brand */}
        <div className="flex items-center gap-2 mr-2">
          <img src={logoUrl} alt="Streamer Copilot" className="w-7 h-7 rounded-lg" />
          <span className="font-semibold text-sm hidden sm:block">{appName}</span>
        </div>

        {/* Nav */}
        <nav className="flex gap-1">
          <button type="button" onClick={() => onChangeSection('dashboard')}
            className={currentSection === 'dashboard'
              ? 'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium bg-violet-600 text-white'
              : 'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium text-gray-400 hover:text-white transition-colors'}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7"/>
            </svg>
            Dashboard
          </button>
          <button type="button" onClick={() => onChangeSection('settings')}
            className={currentSection === 'settings'
              ? 'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium bg-violet-600 text-white'
              : 'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium text-gray-400 hover:text-white transition-colors'}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Settings
          </button>
        </nav>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-3">
          {onOpenProfileSelector ? (
            <button type="button" onClick={onOpenProfileSelector}
              className="px-3 py-1.5 rounded text-sm font-medium text-gray-400 hover:text-white transition-colors">
              Profiles
            </button>
          ) : null}
          <button type="button" onClick={() => setLiveOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-sm font-medium transition-colors">
            <span className="pulse-dot w-2 h-2 rounded-full bg-white" />
            Go Live
          </button>
        </div>
      </header>

      {/* ── Go Live modal ────────────────────────────────────────── */}
      {liveOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setLiveOpen(false)} />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            {/* header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <div className="flex items-center gap-2">
                <span className="pulse-dot w-2 h-2 rounded-full bg-red-500" />
                <h3 className="font-semibold text-gray-100">Live Links</h3>
              </div>
              <button type="button" onClick={() => setLiveOpen(false)}
                className="text-gray-400 hover:text-white transition-colors text-lg leading-none">✕</button>
            </div>

            {/* body */}
            <div className="p-5 space-y-3">
              <p className="text-xs text-gray-500 mb-4">Copy links to share each live output on social media.</p>

              {LIVE_LINKS.map(({ id, label, url, full, icon, color, border, btnBg }) => (
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
                    {copiedId === id ? '✓' : 'Copy'}
                  </button>
                </div>
              ))}

              <button type="button" onClick={copyAll}
                className="w-full py-2 rounded bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 text-sm border border-violet-600/30 transition-colors mt-1">
                {copiedId === 'all' ? '✓ Copied!' : 'Copy all links'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
