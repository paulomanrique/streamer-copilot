import type { ReactNode } from 'react';

import type { ObsStatsSnapshot } from '../../shared/types.js';
import { styles } from './app-styles.js';

interface ObsStatsPanelProps {
  stats: ObsStatsSnapshot;
}

const PLATFORM_ICONS: Record<string, string> = {
  twitch: 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z',
  youtube: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
  kick: 'M2 2h4v8l4-4h4l-6 6 6 6h-4l-4-4v4H2V2zm14 0h4v20h-4z',
  tiktok: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.67a8.17 8.17 0 0 0 4.79 1.53V6.75a4.85 4.85 0 0 1-1.02-.06z',
};

export function ObsStatsPanel({ stats }: ObsStatsPanelProps) {
  const totalDropped = stats.droppedFrames + stats.droppedFramesRender;
  const connectionPct = Math.max(12, Math.min(100, 100 - totalDropped * 2));
  const connectionQuality = connectionPct >= 95 ? 'Good' : connectionPct >= 80 ? 'Fair' : 'Poor';
  const connectionColor = connectionPct >= 95 ? '#22c55e' : connectionPct >= 80 ? '#facc15' : '#ef4444';

  return (
    <section style={styles.obsPanel}>
      <div style={styles.obsPanelHeader}>
        <div>
          <h3 style={styles.sectionTitle}>OBS Studio</h3>
          <p style={styles.helper}>Scene: {stats.sceneName}</p>
        </div>
        <span style={stats.connected ? styles.obsLiveBadge : styles.obsOfflineBadge}>
          {stats.connected ? '🔴 LIVE' : 'OFFLINE'}
        </span>
      </div>

      {/* Row 1: Time + 3 dropped frame types */}
      <div style={styles.obsStatsGrid}>
        <StatCard label="Time" value={stats.uptimeLabel} tone="primary" mono />
        <StatCard
          label={<>Dropped Frames<br />(output)</>}
          value={`${stats.droppedFrames}`}
          tone={stats.droppedFrames === 0 ? 'good' : 'bad'}
          mono
        />
        <StatCard
          label={<>Dropped Frames<br />(render)</>}
          value={`${stats.droppedFramesRender}`}
          tone={stats.droppedFramesRender === 0 ? 'good' : 'warn'}
          mono
        />
        <StatCard label="FPS" value={`${stats.fps}`} tone={stats.fps >= 58 ? 'good' : stats.fps >= 30 ? 'warn' : 'bad'} mono />
      </div>

      {/* Row 2: Connection quality bar */}
      <div style={styles.obsConnectionRow}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '100px' }}>
          <span style={styles.obsConnectionLabel}>Connection</span>
          <span style={{ color: connectionColor, fontSize: '12px', fontWeight: 700 }}>● {connectionQuality}</span>
        </div>
        <div style={styles.obsConnectionTrack}>
          <div style={{ ...styles.obsConnectionFill, width: `${connectionPct}%`, background: connectionColor }} />
        </div>
        <span style={styles.obsConnectionPercent}>{connectionPct}%</span>
      </div>

      {/* Row 3: Viewers per platform */}
      <div style={styles.viewerCardGrid}>
        <ViewerCard label="Twitch" icon={PLATFORM_ICONS.twitch} value="1.2k" accent="#a855f7" />
        <ViewerCard label="YT Horiz" icon={PLATFORM_ICONS.youtube} value="834" accent="#ef4444" subvalue="2.1k likes" />
        <ViewerCard label="YT Vert" icon={PLATFORM_ICONS.youtube} value="291" accent="#fb7185" subvalue="876 likes" />
        <ViewerCard label="Kick" icon={PLATFORM_ICONS.kick} value="392" accent="#22c55e" />
        <ViewerCard label="TikTok" icon={PLATFORM_ICONS.tiktok} value="1.8k" accent="#ec4899" subvalue="5.3k likes" />
      </div>
    </section>
  );
}

interface StatCardProps {
  label: ReactNode;
  value: string;
  tone: 'primary' | 'good' | 'warn' | 'bad';
  suffix?: string;
  mono?: boolean;
}

function StatCard({ label, value, tone, suffix, mono }: StatCardProps) {
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
      <span style={{ ...toneStyle, fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined }}>
        {value}
        {suffix ? <span style={styles.obsStatSuffix}> {suffix}</span> : null}
      </span>
      <span style={styles.obsStatValueLabel}>{label}</span>
    </article>
  );
}

interface ViewerCardProps {
  label: string;
  icon: string;
  value: string;
  accent: string;
  subvalue?: string;
}

function ViewerCard({ label, icon, value, accent, subvalue }: ViewerCardProps) {
  return (
    <article
      style={{
        ...styles.viewerCard,
        background: `${accent}12`,
        borderColor: `${accent}33`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '2px' }}>
        <svg style={{ width: '10px', height: '10px', color: accent, fill: accent, flexShrink: 0 }} viewBox="0 0 24 24">
          <path d={icon} />
        </svg>
        <span style={{ ...styles.viewerCardLabel, color: accent }}>{label}</span>
      </div>
      <span style={{ ...styles.viewerCardValue, color: accent, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{value}</span>
      {subvalue ? (
        <span style={{ color: '#f472b6', fontSize: '11px' }}>{subvalue}</span>
      ) : (
        <span style={styles.viewerCardMeta}>viewers</span>
      )}
    </article>
  );
}
