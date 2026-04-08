import type { StreamEvent } from '../../shared/types.js';

const PLATFORM_CLASSES: Record<string, { border: string; badge: string; label: string }> = {
  twitch: { border: 'border-purple-500/20', badge: 'bg-purple-500/20 text-purple-300', label: 'Twitch' },
  youtube: { border: 'border-red-500/20', badge: 'bg-red-500/20 text-red-300', label: 'YT Horizontal' },
  kick: { border: 'border-green-500/20', badge: 'bg-green-500/20 text-green-300', label: 'Kick' },
  tiktok: { border: 'border-pink-500/20', badge: 'bg-pink-500/20 text-pink-300', label: 'TikTok' },
};

const EVENT_ICONS: Record<StreamEvent['type'], string> = {
  subscription: '⭐',
  superchat: '💸',
  raid: '⚔️',
  follow: '👋',
  cheer: '✨',
  gift: '🎁',
};

const ACTIVITY_CLASSES: Record<StreamEvent['type'], string> = {
  subscription: 'text-emerald-400',
  superchat: 'text-yellow-400',
  raid: 'text-red-400',
  follow: 'text-sky-400',
  cheer: 'text-purple-400',
  gift: 'text-pink-400',
};

interface EventBannerProps {
  event: StreamEvent;
  variant?: 'chat' | 'activity';
}

export function EventBanner({ event, variant = 'chat' }: EventBannerProps) {
  if (variant === 'activity') {
    return (
      <div className="flex items-start gap-2 text-xs py-1.5 border-b border-gray-800/60 last:border-0">
        <span className="shrink-0 mt-0.5">{EVENT_ICONS[event.type]}</span>
        <span className="text-gray-600 shrink-0 font-mono">{event.timestampLabel}</span>
        <span className={`${ACTIVITY_CLASSES[event.type]} leading-relaxed min-w-0`}>
          {buildEventTitle(event)}
          {event.message ? ` - "${event.message}"` : ''}
        </span>
      </div>
    );
  }

  const platform = PLATFORM_CLASSES[event.platform] ?? PLATFORM_CLASSES.twitch;
  return (
    <div className={`mx-3 my-1 px-3 py-2 rounded-lg border ${platform.border} bg-gradient-to-r from-gray-800 to-gray-800/50`}>
      <div className="flex items-center gap-2">
        <span className="text-lg">{EVENT_ICONS[event.type]}</span>
        <div>
          <p className="text-sm text-gray-200">{buildEventTitle(event)}</p>
          {event.message ? <p className="text-xs text-gray-400 mt-0.5">"{event.message}"</p> : null}
        </div>
        <span className="ml-auto text-xs text-gray-500">{event.timestampLabel}</span>
      </div>
    </div>
  );
}

function buildEventTitle(event: StreamEvent) {
  switch (event.type) {
    case 'subscription':
      return `${event.author} subscribed!`;
    case 'superchat':
      return `${event.author} sent a Super Chat of $${(event.amount ?? 0).toFixed(2)}`;
    case 'raid':
      return `${event.author} raided with ${event.amount ?? 0} viewers!`;
    case 'follow':
      return `${event.author} started following`;
    case 'cheer':
      return `${event.author} cheered ${event.amount ?? 0} bits!`;
    case 'gift':
      return `${event.author} gifted a subscription`;
    default:
      return event.author;
  }
}
