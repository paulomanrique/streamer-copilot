import type { StreamEvent } from '../../shared/types.js';
import { styles } from './app-styles.js';

const EVENT_LABELS: Record<StreamEvent['type'], string> = {
  subscription: 'Subscription',
  superchat: 'Super Chat',
  raid: 'Raid',
  cheer: 'Cheer',
};

interface EventBannerProps {
  event: StreamEvent;
}

export function EventBanner({ event }: EventBannerProps) {
  return (
    <article style={styles.eventBanner}>
      <div style={styles.eventHeader}>
        <span style={styles.selectionPill}>{EVENT_LABELS[event.type]}</span>
        <span style={styles.listboxMeta}>
          {event.platform} · {event.timestampLabel}
        </span>
      </div>
      <p style={styles.eventTitle}>{buildEventTitle(event)}</p>
      {event.message ? <p style={styles.eventText}>{event.message}</p> : null}
    </article>
  );
}

function buildEventTitle(event: StreamEvent) {
  switch (event.type) {
    case 'subscription':
      return `${event.author} subscribed`;
    case 'superchat':
      return `${event.author} sent $${event.amount ?? 0}`;
    case 'raid':
      return `${event.author} raided with ${event.amount ?? 0} viewers`;
    case 'cheer':
      return `${event.author} cheered ${event.amount ?? 0} bits`;
    default:
      return event.author;
  }
}
