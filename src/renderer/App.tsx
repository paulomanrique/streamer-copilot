import { useEffect, useMemo, useState } from 'react';

import type { AppInfo, ProfilesSnapshot } from '../shared/types.js';
import { readSkipPromptPreference, shouldPromptProfileSelector } from './profile-startup.js';
import { useAppStore } from './store.js';

const SKIP_PROFILE_SELECTOR_KEY = 'streamerCopilot.skipProfileSelector';

export default function App() {
  const { profiles, activeProfileId, setProfiles } = useAppStore();
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProfileSelectorOpen, setIsProfileSelectorOpen] = useState(false);
  const [selectorProfileId, setSelectorProfileId] = useState('');
  const [skipPromptAgain, setSkipPromptAgain] = useState(false);

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
        setSelectorProfileId(snapshot.activeProfileId);
        const skipPreference = readSkipPromptPreference(localStorage.getItem(SKIP_PROFILE_SELECTOR_KEY));
        setSkipPromptAgain(skipPreference);
        setIsProfileSelectorOpen(
          shouldPromptProfileSelector({
            forceOpen: false,
            skipPromptPreference: skipPreference,
          }),
        );
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
      setSelectorProfileId(snapshot.activeProfileId);
      setError(null);
      return snapshot;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao selecionar perfil');
      return null;
    }
  };

  const applyProfilesSnapshot = (snapshot: ProfilesSnapshot) => {
    setProfiles(snapshot);
    setSelectorProfileId(snapshot.activeProfileId);
  };

  const createProfile = async () => {
    const name = prompt('Nome do novo perfil:');
    if (!name?.trim()) return;
    const directory = await window.copilot.pickProfileDirectory();
    if (!directory) return;

    try {
      const snapshot = await window.copilot.createProfile({ name: name.trim(), directory });
      applyProfilesSnapshot(snapshot);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao criar perfil');
    }
  };

  const renameActiveProfile = async () => {
    if (!activeProfileId) return;
    const current = profiles.find((profile) => profile.id === activeProfileId);
    const name = prompt('Novo nome do perfil:', current?.name ?? '');
    if (!name?.trim()) return;

    try {
      const snapshot = await window.copilot.renameProfile({ profileId: activeProfileId, name: name.trim() });
      applyProfilesSnapshot(snapshot);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao renomear perfil');
    }
  };

  const cloneActiveProfile = async () => {
    if (!activeProfileId) return;
    const current = profiles.find((profile) => profile.id === activeProfileId);
    const name = prompt('Nome do perfil clonado:', `${current?.name ?? 'Perfil'} (cópia)`);
    if (!name?.trim()) return;
    const directory = await window.copilot.pickProfileDirectory();
    if (!directory) return;

    try {
      const snapshot = await window.copilot.cloneProfile({
        profileId: activeProfileId,
        name: name.trim(),
        directory,
      });
      applyProfilesSnapshot(snapshot);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao clonar perfil');
    }
  };

  const deleteActiveProfile = async () => {
    if (!activeProfileId) return;
    const current = profiles.find((profile) => profile.id === activeProfileId);
    const confirmed = confirm(`Apagar perfil "${current?.name ?? activeProfileId}"?`);
    if (!confirmed) return;

    try {
      const snapshot = await window.copilot.deleteProfile({ profileId: activeProfileId });
      applyProfilesSnapshot(snapshot);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao apagar perfil');
    }
  };

  const openProfileSelector = () => {
    setSelectorProfileId(activeProfileId);
    setSkipPromptAgain(readSkipPromptPreference(localStorage.getItem(SKIP_PROFILE_SELECTOR_KEY)));
    setIsProfileSelectorOpen(true);
  };

  const confirmProfileSelector = async () => {
    const targetProfileId = selectorProfileId || activeProfileId;
    if (!targetProfileId) return;

    const selected = await onSelectProfile(targetProfileId);
    if (!selected) return;

    if (skipPromptAgain) localStorage.setItem(SKIP_PROFILE_SELECTOR_KEY, '1');
    else localStorage.removeItem(SKIP_PROFILE_SELECTOR_KEY);

    setIsProfileSelectorOpen(false);
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
          <div style={styles.subtitleRow}>
            <h2 style={styles.subtitle}>Perfis</h2>
            <button type="button" style={styles.secondaryButton} onClick={openProfileSelector}>
              Trocar Perfil
            </button>
          </div>
          <div style={styles.actionsRow}>
            <button type="button" style={styles.secondaryButton} onClick={() => void createProfile()}>
              Novo
            </button>
            <button type="button" style={styles.secondaryButton} onClick={() => void renameActiveProfile()}>
              Renomear
            </button>
            <button type="button" style={styles.secondaryButton} onClick={() => void cloneActiveProfile()}>
              Clonar
            </button>
            <button type="button" style={styles.dangerButton} onClick={() => void deleteActiveProfile()}>
              Apagar
            </button>
          </div>
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

      {isProfileSelectorOpen ? (
        <div style={styles.modalOverlay}>
          <section style={styles.modalCard}>
            <h2 style={styles.modalTitle}>Selecionar Perfil</h2>

            <label style={styles.label}>
              Perfil
              <select
                value={selectorProfileId}
                style={styles.select}
                onChange={(event) => setSelectorProfileId(event.target.value)}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={skipPromptAgain}
                onChange={(event) => setSkipPromptAgain(event.target.checked)}
              />
              Não me pergunte novamente
            </label>

            <div style={styles.modalActions}>
              <button type="button" style={styles.primaryButton} onClick={() => void confirmProfileSelector()}>
                Entrar com perfil
              </button>
            </div>
          </section>
        </div>
      ) : null}
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
  subtitleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
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
  secondaryButton: {
    background: '#1f2937',
    border: '1px solid #374151',
    color: '#e5e7eb',
    borderRadius: '8px',
    padding: '8px 10px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  },
  actionsRow: {
    marginTop: '12px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  dangerButton: {
    background: '#3f1d2e',
    border: '1px solid #7f1d1d',
    color: '#fecaca',
    borderRadius: '8px',
    padding: '8px 10px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'grid',
    placeItems: 'center',
    padding: '24px',
  },
  modalCard: {
    width: 'min(520px, 100%)',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '12px',
    padding: '20px',
  },
  modalTitle: {
    margin: 0,
    fontSize: '22px',
    fontWeight: 700,
  },
  label: {
    marginTop: '16px',
    display: 'grid',
    gap: '8px',
    color: '#d1d5db',
    fontSize: '14px',
  },
  select: {
    background: '#1f2937',
    border: '1px solid #4b5563',
    color: '#e5e7eb',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '14px',
  },
  checkboxLabel: {
    marginTop: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#d1d5db',
    fontSize: '14px',
  },
  modalActions: {
    marginTop: '20px',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  primaryButton: {
    background: '#7c3aed',
    border: '1px solid #8b5cf6',
    color: '#ffffff',
    borderRadius: '8px',
    padding: '10px 14px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
  },
};
