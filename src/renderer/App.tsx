import { useCallback, useEffect, useMemo, useState } from 'react';

import { DEFAULT_APP_LANGUAGE } from '../shared/constants.js';
import type { AppInfo, AppLanguage, GeneralSettings, PermissionLevel, ProfileSettings, ProfilesSnapshot } from '../shared/types.js';
import { useAppStore } from './store.js';
import { I18nProvider } from './i18n/I18nProvider.js';
import { messages } from './i18n/messages.js';
import { AppHeader } from './components/AppHeader.js';
import { DashboardSummary } from './components/DashboardSummary.js';
import { ProfileFormModal } from './components/ProfileFormModal.js';
import { ProfileSelectorModal } from './components/ProfileSelectorModal.js';
import type { AppSection } from './components/SectionTabs.js';
import { SectionErrorBoundary } from './components/AppErrorBoundary.js';
import { StatusMessages } from './components/StatusMessages.js';
import { ToastStack } from './components/ToastStack.js';
import { SettingsWorkspace } from './pages/SettingsWorkspace.js';
import { useAudioQueue } from './hooks/useAudioQueue.js';
import { useMusicPlayer } from './hooks/useMusicPlayer.js';
import { useIpcListeners } from './hooks/useIpcListeners.js';
import { useToasts } from './hooks/useToasts.js';

const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  startOnLogin: false,
  minimizeToTray: true,
  eventNotifications: true,
  recommendationTemplate: 'Pessoal, visitem o {username}',
  diagnosticLogLevel: 'info',
};

type ProfileFormMode = 'create' | 'rename' | 'clone';

export default function App() {
  const {
    profiles,
    activeProfileId,
    obsStats,
    twitchStatus,
    twitchChannel,
    tiktokStatus,
    tiktokUsername,
    tiktokLiveStats,
    kickStatus,
    kickSlug,
    kickLiveStats,
    setProfiles,
    setChatSnapshot,
    twitchLiveStats,
    youtubeStreams,
    setTwitchStatus,
    setTwitchChannel,
    setYoutubeStreams,
    setTiktokStatus,
    setKickStatus,
    setKickLiveStats,
  } = useAppStore();
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProfileSelectorOpen, setIsProfileSelectorOpen] = useState(false);
  const [isProfileFormOpen, setIsProfileFormOpen] = useState(false);
  const [profileFormMode, setProfileFormMode] = useState<ProfileFormMode>('create');
  const [profileFormName, setProfileFormName] = useState('');
  const [profileFormDirectory, setProfileFormDirectory] = useState('');
  const [profileFormLanguage, setProfileFormLanguage] = useState<AppLanguage>(DEFAULT_APP_LANGUAGE);
  const [selectorProfileId, setSelectorProfileId] = useState('');
  const [currentSection, setCurrentSection] = useState<AppSection>('dashboard');
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [appLanguage, setAppLanguage] = useState<AppLanguage>(DEFAULT_APP_LANGUAGE);
  const [languageCode, setLanguageCode] = useState('en-US');
  const [permissionLevels, setPermissionLevels] = useState<PermissionLevel[]>(['everyone', 'moderator']);
  const [voiceRate, setVoiceRate] = useState(1);
  const [voiceVolume, setVoiceVolume] = useState(0.8);

  const { toasts, pushToast } = useToasts();

  const pushError = useCallback((message: string) => {
    setError(message);
    pushToast(messages[appLanguage].errors.rendererError, message);
  }, [appLanguage, pushToast]);

  // Extracted hooks for audio, TTS, and IPC listeners
  useAudioQueue({ voiceRate, voiceVolume, languageCode, onError: pushError });
  useMusicPlayer();
  useIpcListeners();

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [profiles, activeProfileId],
  );

  const getActiveProfileFromSnapshot = (snapshot: ProfilesSnapshot) =>
    snapshot.profiles.find((profile) => profile.id === snapshot.activeProfileId) ?? null;

  const applyAppLanguageFromSnapshot = (snapshot: ProfilesSnapshot) => {
    setAppLanguage(getActiveProfileFromSnapshot(snapshot)?.appLanguage ?? DEFAULT_APP_LANGUAGE);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [info, snapshot, recentChat, nextGeneralSettings, twitchInitialStatus, ytInitialStatus, tiktokInitialStatus, kickInitialStatus] = await Promise.all([
          window.copilot.getAppInfo(),
          window.copilot.listProfiles(),
          window.copilot.getRecentChat(),
          window.copilot.getGeneralSettings(),
          window.copilot.twitchGetStatus(),
          window.copilot.youtubeGetStatus(),
          window.copilot.tiktokGetStatus(),
          window.copilot.kickGetStatus(),
        ]);
        setAppInfo(info);
        setProfiles(snapshot);
        applyAppLanguageFromSnapshot(snapshot);
        setChatSnapshot(recentChat);
        setGeneralSettings(nextGeneralSettings);
        setTwitchStatus(twitchInitialStatus);
        setTwitchChannel(null);
        setYoutubeStreams(ytInitialStatus);
        setTiktokStatus(tiktokInitialStatus);
        setKickStatus(kickInitialStatus);
        if (kickInitialStatus !== 'connected') setKickLiveStats(null);
        setSelectorProfileId(snapshot.activeProfileId);
        setIsProfileSelectorOpen(true);
      } catch (cause) {
        pushError(cause instanceof Error ? cause.message : messages[appLanguage].errors.failedToLoadInitialData);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [setChatSnapshot, setProfiles, setTwitchStatus, setTwitchChannel, setKickStatus, setKickLiveStats]);

  useEffect(() => {
    if (!isLoading && !activeProfileId) {
      setIsProfileSelectorOpen(true);
    }
  }, [activeProfileId, isLoading]);

  const onSelectProfile = async (profileId: string) => {
    try {
      const snapshot = await window.copilot.selectProfile({ profileId });
      const recentChat = await window.copilot.getRecentChat();
      setProfiles(snapshot);
      applyAppLanguageFromSnapshot(snapshot);
      setChatSnapshot(recentChat);
      setSelectorProfileId(snapshot.activeProfileId);
      setError(null);
      return snapshot;
    } catch (cause) {
      pushError(cause instanceof Error ? cause.message : messages[appLanguage].errors.failedToSelectProfile);
      return null;
    }
  };

  const applyProfilesSnapshot = (snapshot: ProfilesSnapshot) => {
    setProfiles(snapshot);
    setSelectorProfileId(snapshot.activeProfileId);
    applyAppLanguageFromSnapshot(snapshot);
  };

  const createProfile = async (name: string, directory: string, appLanguage: AppLanguage) => {
    try {
      const snapshot = await window.copilot.createProfile({ name: name.trim(), directory, appLanguage });
      applyProfilesSnapshot(snapshot);
      setSelectorProfileId(snapshot.activeProfileId);
      setIsProfileFormOpen(false);
      setProfileFormDirectory('');
      setProfileFormName('');
      setError(null);
    } catch (cause) {
      pushError(cause instanceof Error ? cause.message : messages[appLanguage].errors.failedToCreateProfile);
      throw cause;
    }
  };

  const renameActiveProfile = async (name: string) => {
    if (!activeProfileId) return;

    try {
      const snapshot = await window.copilot.renameProfile({ profileId: activeProfileId, name: name.trim() });
      applyProfilesSnapshot(snapshot);
      setIsProfileFormOpen(false);
      setProfileFormName('');
      setError(null);
    } catch (cause) {
      pushError(cause instanceof Error ? cause.message : messages[appLanguage].errors.failedToRenameProfile);
      throw cause;
    }
  };

  const cloneActiveProfile = async (name: string, directory: string) => {
    if (!activeProfileId) return;

    try {
      const snapshot = await window.copilot.cloneProfile({
        profileId: activeProfileId,
        name: name.trim(),
        directory,
      });
      applyProfilesSnapshot(snapshot);
      setIsProfileFormOpen(false);
      setProfileFormDirectory('');
      setProfileFormName('');
      setError(null);
    } catch (cause) {
      pushError(cause instanceof Error ? cause.message : messages[appLanguage].errors.failedToCloneProfile);
      throw cause;
    }
  };

  const deleteActiveProfile = async () => {
    if (!activeProfileId) return;
    const current = profiles.find((profile) => profile.id === activeProfileId);
    const confirmed = confirm(messages[appLanguage].profile.deleteConfirm(current?.name ?? activeProfileId));
    if (!confirmed) return;

    try {
      const snapshot = await window.copilot.deleteProfile({ profileId: activeProfileId });
      applyProfilesSnapshot(snapshot);
      setError(null);
    } catch (cause) {
      pushError(cause instanceof Error ? cause.message : messages[appLanguage].errors.failedToDeleteProfile);
    }
  };

  const openCreateProfileModal = () => {
    setProfileFormMode('create');
    setProfileFormName('');
    setProfileFormDirectory('');
    setProfileFormLanguage(DEFAULT_APP_LANGUAGE);
    setIsProfileFormOpen(true);
  };

  const openRenameProfileModal = () => {
    if (!activeProfile) return;
    setProfileFormMode('rename');
    setProfileFormName(activeProfile.name);
    setProfileFormDirectory('');
    setProfileFormLanguage(appLanguage);
    setIsProfileFormOpen(true);
  };

  const openCloneProfileModal = () => {
    if (!activeProfile) return;
    setProfileFormMode('clone');
    setProfileFormName(`${activeProfile.name} copy`);
    setProfileFormDirectory('');
    setProfileFormLanguage(appLanguage);
    setIsProfileFormOpen(true);
  };

  const pickProfileDirectory = async () => {
    const directory = await window.copilot.pickProfileDirectory();
    if (!directory) return;
    setProfileFormDirectory(directory);
  };

  const submitProfileForm = async (name: string) => {
    if (profileFormMode === 'create') {
      await createProfile(name, profileFormDirectory, profileFormLanguage);
      return;
    }

    if (profileFormMode === 'rename') {
      await renameActiveProfile(name);
      return;
    }

    await cloneActiveProfile(name, profileFormDirectory);
  };

  const confirmProfileSelector = async () => {
    const targetProfileId = selectorProfileId || activeProfileId;
    if (!targetProfileId) return;

    const selected = await onSelectProfile(targetProfileId);
    if (!selected) return;

    setIsProfileSelectorOpen(false);
  };

  const activeProfileName = activeProfile?.name ?? '-';
  const hasActiveProfile = Boolean(activeProfileId);

  const saveGeneralSettings = async (settings: GeneralSettings) => {
    try {
      const saved = await window.copilot.saveGeneralSettings(settings);
      setGeneralSettings(saved);
      setError(null);
    } catch (cause) {
      pushError(cause instanceof Error ? cause.message : messages[appLanguage].errors.failedToSaveGeneralSettings);
      throw cause;
    }
  };

  const saveProfileSettings = async (settings: ProfileSettings) => {
    try {
      const saved = await window.copilot.saveProfileSettings(settings);
      setAppLanguage(saved.appLanguage);
      setProfiles({
        activeProfileId,
        profiles: profiles.map((profile) =>
          profile.id === activeProfileId ? { ...profile, appLanguage: saved.appLanguage } : profile,
        ),
      });
      setError(null);
      return saved;
    } catch (cause) {
      pushError(cause instanceof Error ? cause.message : messages[appLanguage].errors.failedToSaveProfileSettings);
      throw cause;
    }
  };

  return (
    <I18nProvider language={appLanguage} setLanguage={setAppLanguage}>
    <main key={appLanguage} className="h-screen overflow-hidden bg-gray-950 text-gray-200 flex flex-col">
      <section className="w-screen flex-1 min-h-0 bg-gray-950 flex flex-col">
        {hasActiveProfile ? (
          <AppHeader
            appInfo={appInfo}
            currentSection={currentSection}
            onChangeSection={setCurrentSection}
            twitchChannel={twitchChannel}
            twitchLiveStats={twitchLiveStats}
            youtubeStreams={youtubeStreams}
            tiktokStatus={tiktokStatus}
            tiktokUsername={tiktokUsername}
            kickStatus={kickStatus}
            kickSlug={kickSlug}
            kickLiveStats={kickLiveStats}
          />
        ) : null}

        <StatusMessages isLoading={isLoading} error={error} />

        {hasActiveProfile && currentSection === 'dashboard' ? (
          <SectionErrorBoundary sectionName="Dashboard">
          <ConnectedDashboardSummary
            activeProfileName={activeProfileName}
            obsStats={obsStats}
            twitchStatus={twitchStatus}
            twitchChannel={twitchChannel}
            twitchLiveStats={twitchLiveStats}
            youtubeStreams={youtubeStreams}
            tiktokStatus={tiktokStatus}
            tiktokUsername={tiktokUsername}
            tiktokLiveStats={tiktokLiveStats}
            kickStatus={kickStatus}
            kickSlug={kickSlug}
            kickLiveStats={kickLiveStats}
            recommendationTemplate={generalSettings.recommendationTemplate}
          />
          </SectionErrorBoundary>
        ) : null}

        {hasActiveProfile && currentSection === 'settings' ? (
          <SectionErrorBoundary sectionName="Settings">
          <SettingsWorkspace
            activeProfileId={activeProfileId}
            activeProfileName={activeProfileName}
            profiles={profiles}
            onCreateProfile={openCreateProfileModal}
            onRenameProfile={openRenameProfileModal}
            onCloneProfile={openCloneProfileModal}
            onDeleteProfile={() => void deleteActiveProfile()}
            onSelectProfile={(profileId) => void onSelectProfile(profileId)}
            generalSettings={generalSettings}
            onSaveGeneralSettings={saveGeneralSettings}
            appLanguage={appLanguage}
            onSaveProfileSettings={saveProfileSettings}
            languageCode={languageCode}
            permissionLevels={permissionLevels}
            onChangeLanguageCode={setLanguageCode}
            onChangePermissionLevels={setPermissionLevels}
            voiceRate={voiceRate}
            voiceVolume={voiceVolume}
            onChangeVoiceRate={setVoiceRate}
            onChangeVoiceVolume={setVoiceVolume}
            obsStats={obsStats}
          />
          </SectionErrorBoundary>
        ) : null}
      </section>

      <ProfileSelectorModal
        open={isProfileSelectorOpen || (!isLoading && !hasActiveProfile)}
        profiles={profiles}
        selectorProfileId={selectorProfileId}
        onChangeProfileId={setSelectorProfileId}
        onCreateProfile={openCreateProfileModal}
        onConfirm={() => void confirmProfileSelector()}
      />

      <ProfileFormModal
        open={isProfileFormOpen}
        mode={profileFormMode}
        initialName={profileFormName}
        requireDirectory={profileFormMode !== 'rename'}
        selectedDirectory={profileFormDirectory}
        selectedLanguage={profileFormLanguage}
        onChangeSelectedDirectory={setProfileFormDirectory}
        onChangeSelectedLanguage={setProfileFormLanguage}
        onPickDirectory={pickProfileDirectory}
        onClose={() => setIsProfileFormOpen(false)}
        onSubmit={submitProfileForm}
      />

      <ToastStack toasts={toasts} />
    </main>
    </I18nProvider>
  );
}

function ConnectedDashboardSummary(props: Omit<Parameters<typeof DashboardSummary>[0], 'chatEvents' | 'chatMessages'>) {
  const chatEvents = useAppStore((state) => state.chatEvents);
  const chatMessages = useAppStore((state) => state.chatMessages);

  return <DashboardSummary {...props} chatEvents={chatEvents} chatMessages={chatMessages} />;
}
