import type { ObsStatsSnapshot } from '../../shared/types.js';
import {
  DASHBOARD_CONNECTIONS,
  DASHBOARD_EVENTS,
  DASHBOARD_MESSAGES,
} from '../dashboard-mock-data.js';
import { ChatFeed } from './ChatFeed.js';
import { EventBanner } from './EventBanner.js';
import { ObsStatsPanel } from './ObsStatsPanel.js';
import { StatusBar } from './StatusBar.js';
import { styles } from './app-styles.js';

interface DashboardSummaryProps {
  activeProfileName: string;
  chatEvents: typeof DASHBOARD_EVENTS;
  chatMessages: typeof DASHBOARD_MESSAGES;
  obsStats: ObsStatsSnapshot;
}

export function DashboardSummary({ activeProfileName, chatEvents, chatMessages, obsStats }: DashboardSummaryProps) {
  const visibleMessages = chatMessages.length > 0 ? chatMessages : DASHBOARD_MESSAGES;
  const visibleEvents = chatEvents.length > 0 ? chatEvents : DASHBOARD_EVENTS;

  return (
    <section style={styles.dashboardShell}>
      <div>
        <h2 style={styles.subtitle}>Summary</h2>
        <p style={styles.message}>Active profile: {activeProfileName}</p>
      </div>

      <StatusBar connections={DASHBOARD_CONNECTIONS} obsStatus={obsStats} />

      <div style={styles.dashboardGrid}>
        <ChatFeed messages={visibleMessages} events={visibleEvents} />

        <aside style={styles.sideStack}>
          <ObsStatsPanel stats={obsStats} />

          <section style={styles.previewCard}>
            <div style={styles.previewHeader}>
              <div>
                <h3 style={styles.sectionTitle}>Priority Events</h3>
                <p style={styles.helper}>Shared event card component for raids, cheers, and paid highlights.</p>
              </div>
              <span style={styles.selectionPill}>Live</span>
            </div>

            <div style={styles.settingsGrid}>
              {visibleEvents.map((event) => (
                <EventBanner key={event.id} event={event} />
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
