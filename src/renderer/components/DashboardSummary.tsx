import {
  DASHBOARD_CONNECTIONS,
  DASHBOARD_EVENTS,
  DASHBOARD_MESSAGES,
  DASHBOARD_OBS_STATUS,
} from '../dashboard-mock-data.js';
import { ChatFeed } from './ChatFeed.js';
import { EventBanner } from './EventBanner.js';
import { ObsStatsPanel } from './ObsStatsPanel.js';
import { StatusBar } from './StatusBar.js';
import { styles } from './app-styles.js';

interface DashboardSummaryProps {
  activeProfileName: string;
}

export function DashboardSummary({ activeProfileName }: DashboardSummaryProps) {
  return (
    <section style={styles.dashboardShell}>
      <div>
        <h2 style={styles.subtitle}>Summary</h2>
        <p style={styles.message}>Active profile: {activeProfileName}</p>
      </div>

      <StatusBar connections={DASHBOARD_CONNECTIONS} obsStatus={DASHBOARD_OBS_STATUS} />

      <div style={styles.dashboardGrid}>
        <ChatFeed messages={DASHBOARD_MESSAGES} events={DASHBOARD_EVENTS} />

        <aside style={styles.sideStack}>
          <ObsStatsPanel
            sceneName={DASHBOARD_OBS_STATUS.sceneName}
            uptimeLabel={DASHBOARD_OBS_STATUS.uptimeLabel}
            bitrateKbps={6120}
            fps={60}
            cpuPercent={32}
            ramMb={2480}
            droppedFrames={0}
          />

          <section style={styles.previewCard}>
            <div style={styles.previewHeader}>
              <div>
                <h3 style={styles.sectionTitle}>Priority Events</h3>
                <p style={styles.helper}>Shared event card component for raids, cheers, and paid highlights.</p>
              </div>
              <span style={styles.selectionPill}>Live</span>
            </div>

            <div style={styles.settingsGrid}>
              {DASHBOARD_EVENTS.map((event) => (
                <EventBanner key={event.id} event={event} />
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
