import type { ObsStatsSnapshot } from '../../shared/types.js';
import { styles } from './app-styles.js';

interface ObsStatsPanelProps {
  stats: ObsStatsSnapshot;
}

export function ObsStatsPanel({ stats }: ObsStatsPanelProps) {
  return (
    <section style={styles.previewCard}>
      <div style={styles.previewHeader}>
        <div>
          <h3 style={styles.sectionTitle}>OBS Stats</h3>
          <p style={styles.helper}>Renderer-side stat cards ready to receive streamed OBS state.</p>
        </div>
        <span style={styles.selectionPill}>{stats.connected ? 'Live' : 'Offline'}</span>
      </div>

      <div style={styles.statsGrid}>
        <StatCard label="Scene" value={stats.sceneName} tone={stats.connected ? 'good' : 'warn'} />
        <StatCard label="Uptime" value={stats.uptimeLabel} tone={stats.connected ? 'good' : 'warn'} />
        <StatCard
          label="Bitrate"
          value={`${stats.bitrateKbps} kbps`}
          tone={stats.connected && stats.bitrateKbps >= 5500 ? 'good' : 'warn'}
        />
        <StatCard label="FPS" value={`${stats.fps}`} tone={stats.connected && stats.fps >= 60 ? 'good' : 'warn'} />
        <StatCard
          label="CPU"
          value={`${stats.cpuPercent}%`}
          tone={stats.connected && stats.cpuPercent < 70 ? 'good' : 'warn'}
        />
        <StatCard
          label="RAM"
          value={`${stats.ramMb} MB`}
          tone={stats.connected && stats.ramMb < 3500 ? 'good' : 'warn'}
        />
        <StatCard label="Dropped" value={`${stats.droppedFrames}`} tone={stats.droppedFrames === 0 ? 'good' : 'bad'} />
      </div>
    </section>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  tone: 'good' | 'warn' | 'bad';
}

function StatCard({ label, value, tone }: StatCardProps) {
  const toneStyle =
    tone === 'good' ? styles.statValueGood : tone === 'warn' ? styles.statValueWarn : styles.statValueBad;

  return (
    <article style={styles.statCard}>
      <span style={styles.statLabel}>{label}</span>
      <span style={toneStyle}>{value}</span>
    </article>
  );
}
