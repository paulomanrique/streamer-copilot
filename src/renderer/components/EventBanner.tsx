import { memo } from 'react';

import type { StreamEvent } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { getPlatformProviderOrFallback } from '../platforms/registry.js';

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
  const platform = getPlatformProviderOrFallback(event.platform);

  if (variant === 'activity') {
    return (
      <div className="flex items-start gap-1.5 text-xs py-1.5 border-b border-gray-800/60 last:border-0">
        <span className="shrink-0 mt-0.5 w-4 text-center">{EVENT_ICONS[event.type]}</span>
        <span className="text-gray-600 shrink-0 font-mono whitespace-nowrap">{event.timestampLabel}</span>

        {/* Platform badge — shows the source channel label when present
         *  (multi-channel Twitch / multi-stream YouTube) so events from
         *  different channels are visually distinguishable. */}
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${platform.badge.bg} ${platform.badge.text}`}>
          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
            <path d={platform.icon} />
          </svg>
          {event.streamLabel ?? platform.displayName}
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
    : `${platform.badge.bg} border-opacity-30`;

  return (
    <div className={`mx-3 my-1 px-3 py-2 rounded-lg border ${bannerClass}`}
      style={isSuperchat ? undefined : { borderColor: platform.bannerBorderColor }}
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
