import { memo } from 'react';

import type { StreamEvent } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';

const PLATFORM_META: Record<string, { bg: string; text: string; icon: string; label: string }> = {
  twitch: {
    bg: 'bg-purple-500/20',
    text: 'text-purple-300',
    icon: 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z',
    label: 'Twitch',
  },
  youtube: {
    bg: 'bg-red-500/20',
    text: 'text-red-300',
    icon: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
    label: 'YouTube',
  },
  'youtube-v': {
    bg: 'bg-rose-400/20',
    text: 'text-rose-300',
    icon: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
    label: 'YouTube Vertical',
  },
  kick: {
    bg: 'bg-green-500/20',
    text: 'text-green-300',
    icon: 'M2 2h4v8l4-4h4l-6 6 6 6h-4l-4-4v4H2V2zm14 0h4v20h-4z',
    label: 'Kick',
  },
  tiktok: {
    bg: 'bg-pink-500/20',
    text: 'text-pink-300',
    icon: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.67a8.17 8.17 0 0 0 4.79 1.53V6.75a4.85 4.85 0 0 1-1.02-.06z',
    label: 'TikTok',
  },
};

const EVENT_ICONS: Record<StreamEvent['type'], string> = {
  subscription: '⭐',
  superchat: '💸',
  raid: '⚔️',
  follow: '💜',
  cheer: '✨',
  gift: '🎁',
};

const ACTIVITY_AUTHOR_CLASS: Record<StreamEvent['type'], string> = {
  subscription: 'text-emerald-400',
  superchat: 'text-violet-300',
  raid: 'text-red-400',
  follow: 'text-sky-400',
  cheer: 'text-purple-400',
  gift: 'text-pink-400',
};

interface EventBannerProps {
  event: StreamEvent;
  variant?: 'chat' | 'activity';
}

export const EventBanner = memo(function EventBanner({ event, variant = 'chat' }: EventBannerProps) {
  const { t } = useI18n();
  const baseMeta = PLATFORM_META[event.platform] ?? PLATFORM_META.twitch;
  const platform = baseMeta;

  if (variant === 'activity') {
    return (
      <div className="flex items-start gap-1.5 text-xs py-1.5 border-b border-gray-800/60 last:border-0">
        <span className="shrink-0 mt-0.5 w-4 text-center">{EVENT_ICONS[event.type]}</span>
        <span className="text-gray-600 shrink-0 font-mono whitespace-nowrap">{event.timestampLabel}</span>

        {/* Platform badge — shows the source channel label when present
         *  (multi-channel Twitch / multi-stream YouTube) so events from
         *  different channels are visually distinguishable. */}
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${platform.bg} ${platform.text}`}>
          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
            <path d={platform.icon} />
          </svg>
          {event.streamLabel ?? platform.label}
        </span>

        <span className="leading-relaxed min-w-0">
          <span className={`font-semibold ${ACTIVITY_AUTHOR_CLASS[event.type]}`} data-no-i18n="true">{event.author}</span>
          {' '}
          <span className="text-gray-400">{buildEventAction(event, t)}</span>
          {event.message ? <span className="text-gray-500" data-no-i18n="true"> — "{event.message}"</span> : null}
        </span>
      </div>
    );
  }

  const isSuperchat = event.type === 'superchat';
  const bannerClass = isSuperchat
    ? 'bg-violet-500/10 border-violet-400/30'
    : `${platform.bg} border-opacity-30`;

  return (
    <div className={`mx-3 my-1 px-3 py-2 rounded-lg border ${bannerClass}`}
      style={isSuperchat ? undefined : { borderColor: getBorderColor(event.platform) }}
    >
      <div className="flex items-center gap-2">
        <span className={`text-lg ${isSuperchat ? 'text-violet-300' : ''}`}>{EVENT_ICONS[event.type]}</span>
        <div>
          <p className="text-sm text-gray-200">{buildEventTitle(event, t)}</p>
          {event.message ? <p className="text-xs text-gray-400 mt-0.5" data-no-i18n="true">"{event.message}"</p> : null}
        </div>
        <span className="ml-auto text-xs text-gray-500">{event.timestampLabel}</span>
      </div>
    </div>
  );
});

function getBorderColor(platform: string): string {
  const map: Record<string, string> = {
    twitch: 'rgba(168,85,247,0.2)',
    youtube: 'rgba(239,68,68,0.2)',
    'youtube-v': 'rgba(244,63,94,0.2)',
    kick: 'rgba(34,197,94,0.2)',
    tiktok: 'rgba(236,72,153,0.2)',
  };
  return map[platform] ?? 'rgba(55,65,81,0.5)';
}

function buildEventAction(event: StreamEvent, t: (text: string) => string): string {
  switch (event.type) {
    case 'subscription':
      return (event.amount ?? 1) > 1
        ? `${t('resubscribed for')} ${event.amount} ${t('months')}!`
        : t('subscribed!');
    case 'superchat': return `${t('sent')} $${(event.amount ?? 0).toFixed(2)}`;
    case 'raid': return `${t('raided with')} ${event.amount ?? 0} ${t('viewers')}`;
    case 'follow': return t('started following');
    case 'cheer': return `${t('cheered')} ${event.amount ?? 0} bits`;
    case 'gift':
      return (event.amount ?? 1) > 1
        ? `${t('gifted')} ${event.amount} ${t('subs to the community')}`
        : `${t('gifted a sub')}${event.message ? ` ${event.message}` : ''}`;
    default: return '';
  }
}

function buildEventTitle(event: StreamEvent, t: (text: string) => string): string {
  switch (event.type) {
    case 'subscription':
      return (event.amount ?? 1) > 1
        ? `${event.author} ${t('resubscribed for')} ${event.amount} ${t('months')}!`
        : `${event.author} ${t('subscribed!')}`;
    case 'superchat': return `${event.author} ${t('sent a Super Chat of')} $${(event.amount ?? 0).toFixed(2)}`;
    case 'raid': return `${event.author} ${t('raided with')} ${event.amount ?? 0} ${t('viewers')}!`;
    case 'follow': return `${event.author} ${t('started following')}`;
    case 'cheer': return `${event.author} ${t('cheered')} ${event.amount ?? 0} bits!`;
    case 'gift':
      return (event.amount ?? 1) > 1
        ? `${event.author} ${t('gifted')} ${event.amount} ${t('subs to the community')}!`
        : `${event.author} ${t('gifted a sub')}${event.message ? ` ${event.message}` : ''}`;
    default: return event.author;
  }
}
