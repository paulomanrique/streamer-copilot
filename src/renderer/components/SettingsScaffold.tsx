import type { CSSProperties, ReactNode } from 'react';

import { styles } from './app-styles.js';

interface SettingsPageShellProps {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
  maxWidth?: CSSProperties['maxWidth'];
}

export function SettingsPageShell({ title, description, action, children, maxWidth = '960px' }: SettingsPageShellProps) {
  return (
    <section style={{ ...styles.settingsPage, maxWidth }}>
      <header style={styles.settingsPageHeader}>
        <div>
          <h2 style={styles.settingsPageTitle}>{title}</h2>
          <p style={styles.settingsPageDescription}>{description}</p>
        </div>
        {action ? <div style={styles.settingsPageAction}>{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

interface SettingsSurfaceProps {
  children: ReactNode;
  style?: CSSProperties;
}

export function SettingsSurface({ children, style }: SettingsSurfaceProps) {
  return <section style={{ ...styles.settingsSurface, ...style }}>{children}</section>;
}

interface SettingsInfoTileProps {
  label: string;
  text: string;
}

export function SettingsInfoTile({ label, text }: SettingsInfoTileProps) {
  return (
    <article style={styles.settingsInfoTile}>
      <p style={styles.settingsInfoLabel}>{label}</p>
      <p style={styles.settingsInfoText}>{text}</p>
    </article>
  );
}

interface SettingsToggleRowProps {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  bordered?: boolean;
}

export function SettingsToggleRow({
  title,
  description,
  checked,
  onChange,
  bordered = true,
}: SettingsToggleRowProps) {
  return (
    <div
      style={{
        ...styles.settingsToggleRow,
        borderTop: bordered ? styles.settingsToggleRow.borderTop : 'none',
        paddingTop: bordered ? styles.settingsToggleRow.paddingTop : 0,
      }}
    >
      <div>
        <p style={styles.settingsToggleTitle}>{title}</p>
        <p style={styles.settingsToggleDescription}>{description}</p>
      </div>
      <label style={styles.toggleSwitch}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          style={styles.toggleInput}
        />
        <span
          style={{
            ...styles.toggleSlider,
            background: checked ? '#7c3aed' : '#374151',
          }}
        >
          <span
            style={{
              ...styles.toggleKnob,
              transform: checked ? 'translateX(16px)' : 'translateX(0)',
            }}
          />
        </span>
      </label>
    </div>
  );
}

export function formatLastUsedLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
