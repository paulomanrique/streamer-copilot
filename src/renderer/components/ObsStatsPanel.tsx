import type { ObsStatsSnapshot } from '../../shared/types.js';
import { styles } from './app-styles.js';

interface ObsStatsPanelProps {
  stats: ObsStatsSnapshot;
}

export function ObsStatsPanel({ stats }: ObsStatsPanelProps) {
  return (
    <section style={styles.obsPanel}>
      <div style={styles.obsPanelHeader}>
        <div>
          <h3 style={styles.sectionTitle}>OBS Studio</h3>
          <p style={styles.helper}>Scene: {stats.sceneName}</p>
        </div>
        <span style={stats.connected ? styles.obsLiveBadge : styles.obsOfflineBadge}>{stats.connected ? 'LIVE' : 'OFFLINE'}</span>
      </div>

      <div style={styles.obsStatsGrid}>
        <StatCard label="Time" value={stats.uptimeLabel} tone="primary" />
        <StatCard label="Dropped Frames" value={`${stats.droppedFrames}`} tone={stats.droppedFrames === 0 ? 'good' : 'bad'} />
        <StatCard label="Bitrate" value={`${stats.bitrateKbps}`} tone="warn" suffix="kbps" />
        <StatCard label="FPS" value={`${stats.fps}`} tone="warn" />
      </div>

      <div style={styles.obsConnectionRow}>
        <span style={styles.obsConnectionLabel}>Connection</span>
        <div style={styles.obsConnectionTrack}>
          <div
            style={{
              ...styles.obsConnectionFill,
              width: `${Math.max(12, Math.min(100, 100 - stats.droppedFrames * 4))}%`,
            }}
          />
        </div>
        <span style={styles.obsConnectionPercent}>{Math.max(12, Math.min(100, 100 - stats.droppedFrames * 4))}%</span>
      </div>

      <div style={styles.viewerCardGrid}>
        <ViewerCard label="Twitch" value="1.2k" accent="#a855f7" />
        <ViewerCard label="YT Horizontal" value="834" accent="#ef4444" subvalue="2.1k likes" />
        <ViewerCard label="YT Vertical" value="291" accent="#fb7185" subvalue="876 likes" />
        <ViewerCard label="Kick" value="392" accent="#22c55e" />
        <ViewerCard label="TikTok" value="1.8k" accent="#ec4899" subvalue="5.3k likes" />
      </div>
    </section>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  tone: 'primary' | 'good' | 'warn' | 'bad';
  suffix?: string;
}

function StatCard({ label, value, tone, suffix }: StatCardProps) {
  const toneStyle =
    tone === 'primary'
      ? styles.obsStatValuePrimary
      : tone === 'good'
        ? styles.statValueGood
        : tone === 'warn'
          ? styles.statValueWarn
          : styles.statValueBad;

  return (
    <article style={styles.obsStatCard}>
      <span style={styles.obsStatValueLabel}>{label}</span>
      <span style={toneStyle}>
        {value}
        {suffix ? <span style={styles.obsStatSuffix}> {suffix}</span> : null}
      </span>
    </article>
  );
}

interface ViewerCardProps {
  label: string;
  value: string;
  accent: string;
  subvalue?: string;
}

function ViewerCard({ label, value, accent, subvalue }: ViewerCardProps) {
  return (
    <article
      style={{
        ...styles.viewerCard,
        background: `${accent}12`,
        borderColor: `${accent}33`,
      }}
    >
      <span style={{ ...styles.viewerCardLabel, color: accent }}>{label}</span>
      <span style={{ ...styles.viewerCardValue, color: accent }}>{value}</span>
      <span style={styles.viewerCardMeta}>{subvalue ?? 'viewers'}</span>
    </article>
  );
}
