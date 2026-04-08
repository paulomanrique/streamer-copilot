import { styles } from './app-styles.js';

interface ObsStatsPanelProps {
  sceneName: string;
  uptimeLabel: string;
  bitrateKbps: number;
  fps: number;
  cpuPercent: number;
  ramMb: number;
  droppedFrames: number;
}

export function ObsStatsPanel({
  sceneName,
  uptimeLabel,
  bitrateKbps,
  fps,
  cpuPercent,
  ramMb,
  droppedFrames,
}: ObsStatsPanelProps) {
  return (
    <section style={styles.previewCard}>
      <div style={styles.previewHeader}>
        <div>
          <h3 style={styles.sectionTitle}>OBS Stats</h3>
          <p style={styles.helper}>Renderer-side stat cards ready to receive streamed OBS state.</p>
        </div>
        <span style={styles.selectionPill}>Live</span>
      </div>

      <div style={styles.statsGrid}>
        <StatCard label="Scene" value={sceneName} tone="good" />
        <StatCard label="Uptime" value={uptimeLabel} tone="good" />
        <StatCard label="Bitrate" value={`${bitrateKbps} kbps`} tone={bitrateKbps >= 5500 ? 'good' : 'warn'} />
        <StatCard label="FPS" value={`${fps}`} tone={fps >= 60 ? 'good' : 'warn'} />
        <StatCard label="CPU" value={`${cpuPercent}%`} tone={cpuPercent < 70 ? 'good' : 'warn'} />
        <StatCard label="RAM" value={`${ramMb} MB`} tone={ramMb < 3500 ? 'good' : 'warn'} />
        <StatCard label="Dropped" value={`${droppedFrames}`} tone={droppedFrames === 0 ? 'good' : 'bad'} />
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
