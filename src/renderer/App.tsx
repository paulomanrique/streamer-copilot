import { useEffect, useMemo, useState } from 'react';

import type { AppInfo, PermissionLevel, ProfilesSnapshot } from '../shared/types.js';
import { readSkipPromptPreference, shouldPromptProfileSelector } from './profile-startup.js';
import { useAppStore } from './store.js';
import { AppHeader } from './components/AppHeader.js';
import { DashboardSummary } from './components/DashboardSummary.js';
import { ProfileSelectorModal } from './components/ProfileSelectorModal.js';
import { SectionTabs } from './components/SectionTabs.js';
import type { AppSection } from './components/SectionTabs.js';
import { StatusMessages } from './components/StatusMessages.js';
import { ToastStack, type ToastItem } from './components/ToastStack.js';
import { SettingsWorkspace } from './pages/SettingsWorkspace.js';
import { styles } from './components/app-styles.js';

const SKIP_PROFILE_SELECTOR_KEY = 'streamerCopilot.skipProfileSelector';

export default function App() {
  const { profiles, activeProfileId, setProfiles } = useAppStore();
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProfileSelectorOpen, setIsProfileSelectorOpen] = useState(false);
  const [selectorProfileId, setSelectorProfileId] = useState('');
  const [skipPromptAgain, setSkipPromptAgain] = useState(false);
  const [currentSection, setCurrentSection] = useState<AppSection>('dashboard');
  const [languageCode, setLanguageCode] = useState('en-US');
  const [permissionLevels, setPermissionLevels] = useState<PermissionLevel[]>(['everyone', 'moderator']);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [profiles, activeProfileId],
  );

  const pushError = (message: string) => {
    const toastId = Date.now() + Math.floor(Math.random() * 1000);
    setError(message);
    setToasts((current) => [...current, { id: toastId, title: 'Renderer error', message }]);
  };

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
        pushError(cause instanceof Error ? cause.message : 'Failed to load initial data');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [setProfiles]);

  useEffect(() => {
    if (toasts.length === 0) return undefined;

    const timerId = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, 4000);

    return () => window.clearTimeout(timerId);
  }, [toasts]);

  const onSelectProfile = async (profileId: string) => {
    try {
      const snapshot = await window.copilot.selectProfile({ profileId });
      setProfiles(snapshot);
      setSelectorProfileId(snapshot.activeProfileId);
      setError(null);
      return snapshot;
    } catch (cause) {
      pushError(cause instanceof Error ? cause.message : 'Failed to select profile');
      return null;
    }
  };

  const applyProfilesSnapshot = (snapshot: ProfilesSnapshot) => {
    setProfiles(snapshot);
    setSelectorProfileId(snapshot.activeProfileId);
  };

  const createProfile = async () => {
    const name = prompt('New profile name:');
    if (!name?.trim()) return;
    const directory = await window.copilot.pickProfileDirectory();
    if (!directory) return;

    try {
      const snapshot = await window.copilot.createProfile({ name: name.trim(), directory });
      applyProfilesSnapshot(snapshot);
      setError(null);
    } catch (cause) {
      pushError(cause instanceof Error ? cause.message : 'Failed to create profile');
    }
  };

  const renameActiveProfile = async () => {
    if (!activeProfileId) return;
    const current = profiles.find((profile) => profile.id === activeProfileId);
    const name = prompt('New profile name:', current?.name ?? '');
    if (!name?.trim()) return;

    try {
      const snapshot = await window.copilot.renameProfile({ profileId: activeProfileId, name: name.trim() });
      applyProfilesSnapshot(snapshot);
      setError(null);
    } catch (cause) {
      pushError(cause instanceof Error ? cause.message : 'Failed to rename profile');
    }
  };

  const cloneActiveProfile = async () => {
    if (!activeProfileId) return;
    const current = profiles.find((profile) => profile.id === activeProfileId);
    const name = prompt('Cloned profile name:', `${current?.name ?? 'Profile'} (copy)`);
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
      pushError(cause instanceof Error ? cause.message : 'Failed to clone profile');
    }
  };

  const deleteActiveProfile = async () => {
    if (!activeProfileId) return;
    const current = profiles.find((profile) => profile.id === activeProfileId);
    const confirmed = confirm(`Delete profile "${current?.name ?? activeProfileId}"?`);
    if (!confirmed) return;

    try {
      const snapshot = await window.copilot.deleteProfile({ profileId: activeProfileId });
      applyProfilesSnapshot(snapshot);
      setError(null);
    } catch (cause) {
      pushError(cause instanceof Error ? cause.message : 'Failed to delete profile');
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

  const activeProfileName = activeProfile?.name ?? '—';

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <AppHeader appInfo={appInfo} onOpenProfileSelector={openProfileSelector} />

        <StatusMessages isLoading={isLoading} error={error} />

        <SectionTabs currentSection={currentSection} onChangeSection={setCurrentSection} />

        {currentSection === 'dashboard' ? <DashboardSummary activeProfileName={activeProfileName} /> : null}

        {currentSection === 'settings' ? (
          <SettingsWorkspace
            activeProfileId={activeProfileId}
            activeProfileName={activeProfileName}
            profiles={profiles}
            onCreateProfile={() => void createProfile()}
            onRenameProfile={() => void renameActiveProfile()}
            onCloneProfile={() => void cloneActiveProfile()}
            onDeleteProfile={() => void deleteActiveProfile()}
            onSelectProfile={(profileId) => void onSelectProfile(profileId)}
            languageCode={languageCode}
            permissionLevels={permissionLevels}
            onChangeLanguageCode={setLanguageCode}
            onChangePermissionLevels={setPermissionLevels}
          />
        ) : null}
      </section>

      <ProfileSelectorModal
        open={isProfileSelectorOpen}
        profiles={profiles}
        selectorProfileId={selectorProfileId}
        skipPromptAgain={skipPromptAgain}
        onChangeProfileId={setSelectorProfileId}
        onChangeSkipPromptAgain={setSkipPromptAgain}
        onConfirm={() => void confirmProfileSelector()}
      />

      <ToastStack toasts={toasts} />
    </main>
  );
}
