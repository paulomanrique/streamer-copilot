import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_APP_LANGUAGE } from '../shared/constants.js';
import type { AppLanguage, GeneralSettings, PlatformId, ProfileSettings, ProfilesSnapshot, TwitchLiveStats, WindowSyncEvent } from '../shared/types.js';
import { useAppStore } from './store.js';
import { listPlatformProviders } from './platforms/registry.js';
import { I18nProvider } from './i18n/I18nProvider.js';
import { messages } from './i18n/messages.js';
import { AppHeader } from './components/AppHeader.js';
import { DashboardSummary } from './components/DashboardSummary.js';
import { ProfileFormModal } from './components/ProfileFormModal.js';
import { ProfileSelectorModal } from './components/ProfileSelectorModal.js';
import { SectionErrorBoundary } from './components/AppErrorBoundary.js';
import { StatusMessages } from './components/StatusMessages.js';
import { ToastStack } from './components/ToastStack.js';
import { SettingsWorkspace } from './pages/SettingsWorkspace.js';
import { useAudioQueue } from './hooks/useAudioQueue.js';
import { useMusicPlayer } from './hooks/useMusicPlayer.js';
import { useIpcListeners } from './hooks/useIpcListeners.js';
import { useToasts } from './hooks/useToasts.js';
import { WINDOW_ROLE } from './window-role.js';

const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  startOnLogin: false,
  minimizeToTray: true,
  eventNotifications: true,
  recommendationTemplate: 'Pessoal, visitem o {username}',
  diagnosticLogLevel: 'info',
  overlayServerPort: 7842,
};

type ProfileFormMode = 'create' | 'rename' | 'clone';

/** Tells the other app windows what changed. Fire-and-forget: a missing peer
 *  window is the normal case, not an error. */
function notifyWindows(event: WindowSyncEvent): void {
  void window.copilot.broadcastWindowSync(event).catch(() => null);
}

/** Media playback (sound commands, TTS, music) runs in the main window only;
 *  main never routes playback pushes to the settings window either. */
function PlaybackHost(props: { voiceRate: number; voiceVolume: number; languageCode: string; onError: (message: string) => void }) {
  useAudioQueue(props);
  useMusicPlayer();
  return null;
}

export default function App() {
  const {
    profiles,
    activeProfileId,
    obsStats,
    platformStatus,
    platformPrimaryChannel,
    platformLiveStats,
    setProfiles,
    setChatSnapshot,
    hydratePlatformStatuses,
    setSubscriberTiers,
    setUserLists,
  } = useAppStore();

  // Twitch hype-train data flows as a raw slice — it's a Twitch-only feature
  // with no cross-platform analog (see ObsStatsPanel's hype indicator).
  const twitchLiveStatsByChannel = (platformLiveStats.twitch ?? {}) as Record<string, TwitchLiveStats>;
  // Uniform live entries for the header live-links drawer and the dashboard
  // viewer cards, produced by each provider's liveEntries() — the consumers
  // hold no per-platform branches (see the platform-agnostic rules in AGENTS.md).
  const liveEntries = useMemo(
    () => listPlatformProviders().flatMap((p) => p.liveEntries({
      liveStats: platformLiveStats[p.id as PlatformId] ?? {},
      status: platformStatus[p.id as PlatformId] ?? 'disconnected',
      primaryChannel: platformPrimaryChannel[p.id as PlatformId] ?? null,
    })),
    [platformLiveStats, platformStatus, platformPrimaryChannel],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProfileSelectorOpen, setIsProfileSelectorOpen] = useState(false);
  const [isProfileFormOpen, setIsProfileFormOpen] = useState(false);
  const [profileFormMode, setProfileFormMode] = useState<ProfileFormMode>('create');
  const [profileFormName, setProfileFormName] = useState('');
  const [profileFormDirectory, setProfileFormDirectory] = useState('');
  const [profileFormLanguage, setProfileFormLanguage] = useState<AppLanguage>(DEFAULT_APP_LANGUAGE);
  const [selectorProfileId, setSelectorProfileId] = useState('');
  /** Profile whose session main is running. Stays null until a profile is
   *  confirmed (picker, remembered auto-select, or the only profile) — the
   *  workspace only mounts after that, so nothing reads the previous
   *  profile's accounts, lives or lists in the meantime. */
  const [sessionProfileId, setSessionProfileId] = useState<string | null>(null);
  const [rememberProfileSelection, setRememberProfileSelection] = useState(false);
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [appLanguage, setAppLanguage] = useState<AppLanguage>(DEFAULT_APP_LANGUAGE);
  const [languageCode, setLanguageCode] = useState('en-US');
  const [voiceRate, setVoiceRate] = useState(1);
  const [voiceVolume, setVoiceVolume] = useState(0.8);

  const { toasts, pushToast } = useToasts();

  const pushError = useCallback((message: string) => {
    setError(message);
    pushToast(messages[appLanguage].errors.rendererError, message);
  }, [appLanguage, pushToast]);

  useIpcListeners();

  // Latest voice prefs for answering a settings window's request without
  // re-subscribing the sync listener on every slider move.
  const voicePrefsRef = useRef({ languageCode, voiceRate, voiceVolume });
  voicePrefsRef.current = { languageCode, voiceRate, voiceVolume };

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
        // Profile-scoped data (chat, platform statuses, tiers, lists) loads in
        // onSelectProfile, once main has started the chosen profile's session.
        const [snapshot, nextGeneralSettings] = await Promise.all([
          window.copilot.listProfiles(),
          window.copilot.getGeneralSettings(),
        ]);
        setProfiles(snapshot);
        applyAppLanguageFromSnapshot(snapshot);
        setGeneralSettings(nextGeneralSettings);
        setSelectorProfileId(snapshot.activeProfileId);
        setRememberProfileSelection(snapshot.autoSelectActiveProfile);
        // The settings window only opens from a running session — attach to
        // it instead of selecting (which would restart the profile session).
        if (WINDOW_ROLE === 'settings') {
          await hydrateSession(snapshot);
          notifyWindows({ kind: 'voice-prefs-request' });
          return;
        }
        // Smart skip: don't bother prompting when there's only one profile,
        // or when the user already opted in to auto-select via the picker's
        // "don't ask again" checkbox. Falls through to the picker otherwise.
        const onlyOne = snapshot.profiles.length === 1;
        const autoSelectId = onlyOne
          ? snapshot.profiles[0].id
          : (snapshot.autoSelectActiveProfile && snapshot.activeProfileId)
            ? snapshot.activeProfileId
            : null;
        if (autoSelectId) {
          await onSelectProfile(autoSelectId);
        } else {
          setIsProfileSelectorOpen(true);
        }
      } catch (cause) {
        pushError(cause instanceof Error ? cause.message : messages[appLanguage].errors.failedToLoadInitialData);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [setChatSnapshot, setProfiles, hydratePlatformStatuses, setSubscriberTiers, setUserLists]);

  useEffect(() => {
    if (WINDOW_ROLE === 'main' && !isLoading && !activeProfileId) {
      setIsProfileSelectorOpen(true);
    }
  }, [activeProfileId, isLoading]);

  useEffect(() => {
    if (WINDOW_ROLE !== 'settings') return;
    document.title = `${messages[appLanguage].settings.title} — Streamer Copilot`;
  }, [appLanguage]);

  /** Loads the profile-scoped data of the session main is running. */
  const hydrateSession = async (snapshot: ProfilesSnapshot) => {
    const [recentChat, platformStatuses, tiers, lists] = await Promise.all([
      window.copilot.getRecentChat(),
      window.copilot.getPlatformStatuses(),
      window.copilot.getSubscriberTiers(),
      window.copilot.listUserLists(),
    ]);
    setProfiles(snapshot);
    applyAppLanguageFromSnapshot(snapshot);
    setChatSnapshot(recentChat);
    hydratePlatformStatuses(platformStatuses);
    setSubscriberTiers(tiers);
    setUserLists(lists);
    setSelectorProfileId(snapshot.activeProfileId);
    setSessionProfileId(snapshot.activeProfileId);
  };

  const onSelectProfile = async (profileId: string) => {
    try {
      const snapshot = await window.copilot.selectProfile({ profileId });
      await hydrateSession(snapshot);
      setError(null);
      return snapshot;
    } catch (cause) {
      pushError(cause instanceof Error ? cause.message : messages[appLanguage].errors.failedToSelectProfile);
      return null;
    }
  };

  /** Used from the settings list, where the user is already running a
   *  profile. Persists the new active profile and asks the main process to
   *  relaunch — the renderer is about to be replaced, so we don't bother
   *  syncing local state. */
  const onSwitchProfile = async (profileId: string) => {
    try {
      await window.copilot.switchProfileAndRelaunch({ profileId });
    } catch (cause) {
      pushError(cause instanceof Error ? cause.message : messages[appLanguage].errors.failedToSelectProfile);
    }
  };

  const applyProfilesSnapshot = (snapshot: ProfilesSnapshot) => {
    setProfiles(snapshot);
    setSelectorProfileId(snapshot.activeProfileId);
    setRememberProfileSelection(snapshot.autoSelectActiveProfile);
    applyAppLanguageFromSnapshot(snapshot);
  };

  /** Applies a snapshot this window produced and tells the other windows. */
  const commitProfilesSnapshot = (snapshot: ProfilesSnapshot) => {
    applyProfilesSnapshot(snapshot);
    notifyWindows({ kind: 'profiles' });
  };

  // Changes saved in another window (settings ↔ main) — refetch or apply.
  // Applying never re-broadcasts, so the windows can't ping-pong.
  useEffect(() => {
    return window.copilot.onWindowSync((event) => {
      if (event.kind === 'general-settings') {
        void window.copilot.getGeneralSettings().then(setGeneralSettings).catch(() => null);
      } else if (event.kind === 'profiles') {
        void window.copilot.listProfiles().then(applyProfilesSnapshot).catch(() => null);
      } else if (event.kind === 'voice-prefs') {
        setLanguageCode(event.languageCode);
        setVoiceRate(event.voiceRate);
        setVoiceVolume(event.voiceVolume);
      } else if (event.kind === 'voice-prefs-request' && WINDOW_ROLE === 'main') {
        notifyWindows({ kind: 'voice-prefs', ...voicePrefsRef.current });
      }
    });
    // applyProfilesSnapshot only calls state setters, so the mount-time
    // closure stays correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeVoicePrefs = (next: Partial<{ languageCode: string; voiceRate: number; voiceVolume: number }>) => {
    const prefs = { ...voicePrefsRef.current, ...next };
    voicePrefsRef.current = prefs;
    setLanguageCode(prefs.languageCode);
    setVoiceRate(prefs.voiceRate);
    setVoiceVolume(prefs.voiceVolume);
    notifyWindows({ kind: 'voice-prefs', ...prefs });
  };

  /** With a session running, main only registers a new profile (the active
   *  one can't move under a live session) — relaunch into it instead. */
  const enterNewProfile = async (snapshot: ProfilesSnapshot) => {
    if (!sessionProfileId) return false;
    const created = snapshot.profiles.find((profile) => !profiles.some((known) => known.id === profile.id));
    if (!created) return false;
    await onSwitchProfile(created.id);
    return true;
  };

  const createProfile = async (name: string, directory: string, appLanguage: AppLanguage) => {
    try {
      const snapshot = await window.copilot.createProfile({ name: name.trim(), directory, appLanguage });
      if (await enterNewProfile(snapshot)) return;
      commitProfilesSnapshot(snapshot);
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
      commitProfilesSnapshot(snapshot);
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
      if (await enterNewProfile(snapshot)) return;
      commitProfilesSnapshot(snapshot);
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
      commitProfilesSnapshot(snapshot);
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

    // Persist (or clear) the "don't ask again" preference. The user might have
    // unchecked it after a previous run had it on — both directions matter.
    try {
      const updated = await window.copilot.setAutoSelectActiveProfile({ autoSelect: rememberProfileSelection });
      commitProfilesSnapshot(updated);
    } catch (cause) {
      pushError(cause instanceof Error ? cause.message : messages[appLanguage].errors.failedToSelectProfile);
    }

    setIsProfileSelectorOpen(false);
  };

  const activeProfileName = activeProfile?.name ?? '-';
  const hasActiveProfile = Boolean(sessionProfileId);

  const saveGeneralSettings = async (settings: GeneralSettings) => {
    try {
      const saved = await window.copilot.saveGeneralSettings(settings);
      setGeneralSettings(saved);
      notifyWindows({ kind: 'general-settings' });
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
        autoSelectActiveProfile: rememberProfileSelection,
        profiles: profiles.map((profile) =>
          profile.id === activeProfileId ? { ...profile, appLanguage: saved.appLanguage } : profile,
        ),
      });
      notifyWindows({ kind: 'profiles' });
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
        {hasActiveProfile && WINDOW_ROLE === 'main' ? (
          <AppHeader
            obsStats={obsStats}
            liveEntries={liveEntries}
            twitchLiveStatsByChannel={twitchLiveStatsByChannel}
            onOpenSettings={() => void window.copilot.openSettingsWindow().catch((cause) => pushError(cause instanceof Error ? cause.message : String(cause)))}
          />
        ) : null}

        <StatusMessages isLoading={isLoading} error={error} />

        {hasActiveProfile && WINDOW_ROLE === 'main' ? (
          <SectionErrorBoundary sectionName="Dashboard">
          <ConnectedDashboardSummary
            activeProfileName={activeProfileName}
            obsConnected={obsStats.connected}
            liveEntries={liveEntries}
            recommendationTemplate={generalSettings.recommendationTemplate}
          />
          </SectionErrorBoundary>
        ) : null}

        {hasActiveProfile && WINDOW_ROLE === 'settings' ? (
          <SectionErrorBoundary sectionName="Settings">
          <SettingsWorkspace
            activeProfileId={activeProfileId}
            activeProfileName={activeProfileName}
            profiles={profiles}
            onCreateProfile={openCreateProfileModal}
            onRenameProfile={openRenameProfileModal}
            onCloneProfile={openCloneProfileModal}
            onDeleteProfile={() => void deleteActiveProfile()}
            onSelectProfile={(profileId) => void onSwitchProfile(profileId)}
            generalSettings={generalSettings}
            onSaveGeneralSettings={saveGeneralSettings}
            appLanguage={appLanguage}
            onSaveProfileSettings={saveProfileSettings}
            languageCode={languageCode}
            onChangeLanguageCode={(code) => changeVoicePrefs({ languageCode: code })}
            voiceRate={voiceRate}
            voiceVolume={voiceVolume}
            onChangeVoiceRate={(rate) => changeVoicePrefs({ voiceRate: rate })}
            onChangeVoiceVolume={(volume) => changeVoicePrefs({ voiceVolume: volume })}
          />
          </SectionErrorBoundary>
        ) : null}
      </section>

      <ProfileSelectorModal
        open={WINDOW_ROLE === 'main' && (isProfileSelectorOpen || (!isLoading && !hasActiveProfile))}
        profiles={profiles}
        selectorProfileId={selectorProfileId}
        rememberSelection={rememberProfileSelection}
        onChangeProfileId={setSelectorProfileId}
        onChangeRememberSelection={setRememberProfileSelection}
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
    {/* Outside the language-keyed <main>: a language change must not remount
        the audio queue (the old one would keep draining in parallel). */}
    {WINDOW_ROLE === 'main' ? (
      <PlaybackHost voiceRate={voiceRate} voiceVolume={voiceVolume} languageCode={languageCode} onError={pushError} />
    ) : null}
    </I18nProvider>
  );
}

function ConnectedDashboardSummary(props: Omit<Parameters<typeof DashboardSummary>[0], 'chatEvents' | 'chatMessages'>) {
  const chatEvents = useAppStore((state) => state.chatEvents);
  const chatMessages = useAppStore((state) => state.chatMessages);

  return <DashboardSummary {...props} chatEvents={chatEvents} chatMessages={chatMessages} />;
}
