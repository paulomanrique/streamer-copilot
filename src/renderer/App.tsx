import { useEffect, useMemo, useState } from 'react';

import type { AppInfo } from '../shared/types.js';
import { useAppStore } from './store.js';

export default function App() {
  const { profiles, activeProfileId, setProfiles } = useAppStore();
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [profiles, activeProfileId],
  );

  useEffect(() => {
    const load = async () => {
      try {
        const [info, snapshot] = await Promise.all([window.copilot.getAppInfo(), window.copilot.listProfiles()]);
        setAppInfo(info);
        setProfiles(snapshot);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Falha ao carregar dados iniciais');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [setProfiles]);

  const onSelectProfile = async (profileId: string) => {
    try {
      const snapshot = await window.copilot.selectProfile({ profileId });
      setProfiles(snapshot);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao selecionar perfil');
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1 style={styles.title}>Streamer Copilot - M0 Foundations</h1>

        {appInfo && (
          <p style={styles.meta}>
            {appInfo.appName} v{appInfo.appVersion} • Electron {appInfo.electronVersion} • Node {appInfo.nodeVersion}
          </p>
        )}

        {isLoading ? <p style={styles.message}>Carregando...</p> : null}
        {error ? <p style={styles.error}>{error}</p> : null}

        <div style={styles.block}>
          <h2 style={styles.subtitle}>Perfis</h2>
          <p style={styles.message}>Perfil ativo: {activeProfile?.name ?? '—'}</p>

          <div style={styles.list}>
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                style={profile.id === activeProfileId ? styles.profileButtonActive : styles.profileButton}
                onClick={() => void onSelectProfile(profile.id)}
              >
                <span>{profile.name}</span>
                <span style={styles.path}>{profile.directory}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    margin: 0,
    background: '#0b1020',
    color: '#e5e7eb',
    display: 'grid',
    placeItems: 'center',
    fontFamily: 'Inter, Segoe UI, sans-serif',
    padding: '24px',
  },
  card: {
    width: 'min(860px, 100%)',
    background: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '12px',
    padding: '24px',
  },
  title: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 700,
  },
  meta: {
    margin: '8px 0 0',
    color: '#9ca3af',
    fontSize: '14px',
  },
  block: {
    marginTop: '24px',
    borderTop: '1px solid #1f2937',
    paddingTop: '16px',
  },
  subtitle: {
    margin: 0,
    fontSize: '18px',
  },
  message: {
    margin: '8px 0 0',
    color: '#9ca3af',
    fontSize: '14px',
  },
  error: {
    margin: '12px 0 0',
    color: '#fca5a5',
    fontSize: '14px',
  },
  list: {
    marginTop: '12px',
    display: 'grid',
    gap: '8px',
  },
  profileButton: {
    background: '#111827',
    border: '1px solid #374151',
    color: '#e5e7eb',
    padding: '12px',
    borderRadius: '10px',
    textAlign: 'left',
    display: 'grid',
    gap: '4px',
    cursor: 'pointer',
  },
  profileButtonActive: {
    background: '#1e1b4b',
    border: '1px solid #8b5cf6',
    color: '#e5e7eb',
    padding: '12px',
    borderRadius: '10px',
    textAlign: 'left',
    display: 'grid',
    gap: '4px',
    cursor: 'pointer',
  },
  path: {
    color: '#9ca3af',
    fontSize: '12px',
    wordBreak: 'break-all',
  },
};
