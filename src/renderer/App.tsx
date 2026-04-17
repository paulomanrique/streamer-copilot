import { useEffect, useMemo, useRef, useState } from 'react';

import type { AppInfo, GeneralSettings, PermissionLevel, ProfilesSnapshot, VoiceSpeakPayload } from '../shared/types.js';
import { useAppStore } from './store.js';
import { AppHeader } from './components/AppHeader.js';
import { DashboardSummary } from './components/DashboardSummary.js';
import { ProfileFormModal } from './components/ProfileFormModal.js';
import { ProfileSelectorModal } from './components/ProfileSelectorModal.js';
import type { AppSection } from './components/SectionTabs.js';
import { StatusMessages } from './components/StatusMessages.js';
import { ToastStack, type ToastItem } from './components/ToastStack.js';
import { SettingsWorkspace } from './pages/SettingsWorkspace.js';

const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  startOnLogin: false,
  minimizeToTray: true,
  eventNotifications: true,
};

type ProfileFormMode = 'create' | 'rename' | 'clone';

export default function App() {
  const {
    profiles,
    activeProfileId,
    chatMessages,
    chatEvents,
    obsStats,
    twitchStatus,
    twitchChannel,
    tiktokStatus,
    tiktokUsername,
    setProfiles,
    setObsStats,
    setChatSnapshot,
    appendChatMessage,
    appendChatEvent,
    twitchLiveStats,
    youtubeStreams,
    setTwitchStatus,
    setTwitchChannel,
    setTwitchLiveStats,
    setYoutubeStreams,
    setTiktokStatus,
    setTiktokUsername,
  } = useAppStore();
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProfileSelectorOpen, setIsProfileSelectorOpen] = useState(false);
  const [isProfileFormOpen, setIsProfileFormOpen] = useState(false);
  const [profileFormMode, setProfileFormMode] = useState<ProfileFormMode>('create');
  const [profileFormName, setProfileFormName] = useState('');
  const [profileFormDirectory, setProfileFormDirectory] = useState('');
  const [selectorProfileId, setSelectorProfileId] = useState('');
  const [currentSection, setCurrentSection] = useState<AppSection>('dashboard');
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(DEFAULT_GENERAL_SETTINGS);
  const [languageCode, setLanguageCode] = useState('en-US');
  const [permissionLevels, setPermissionLevels] = useState<PermissionLevel[]>(['everyone', 'moderator']);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [voiceRate, setVoiceRate] = useState(1);
  const [voiceVolume, setVoiceVolume] = useState(0.8);
  const activeSoundsRef = useRef<HTMLAudioElement[]>([]);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

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
        const [info, snapshot, recentChat, nextGeneralSettings, twitchInitialStatus, ytInitialStatus, tiktokInitialStatus] = await Promise.all([
          window.copilot.getAppInfo(),
          window.copilot.listProfiles(),
          window.copilot.getRecentChat(),
          window.copilot.getGeneralSettings(),
          window.copilot.twitchGetStatus(),
          window.copilot.youtubeGetStatus(),
          window.copilot.tiktokGetStatus(),
        ]);
        setAppInfo(info);
        setProfiles(snapshot);
        setChatSnapshot(recentChat);
        setGeneralSettings(nextGeneralSettings);
        setTwitchStatus(twitchInitialStatus);
        setTwitchChannel(null);
        setYoutubeStreams(ytInitialStatus);
        setTiktokStatus(tiktokInitialStatus);
        setSelectorProfileId(snapshot.activeProfileId);
        setIsProfileSelectorOpen(true);
      } catch (cause) {
        pushError(cause instanceof Error ? cause.message : 'Failed to load initial data');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [setChatSnapshot, setProfiles, setTwitchStatus, setTwitchChannel]);

  useEffect(() => {
    if (!isLoading && !activeProfileId) {
      setIsProfileSelectorOpen(true);
    }
  }, [activeProfileId, isLoading]);

  useEffect(() => {
    if (toasts.length === 0) return undefined;

    const timerId = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, 4000);

    return () => window.clearTimeout(timerId);
  }, [toasts]);

  useEffect(() => {
    void window.copilot.setRendererVoiceCapabilities({
      speechSynthesisAvailable:
        'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function',
    });
  }, []);

  // Keep a ref to the loaded voices list so the speak handler always has it,
  // even if it fires before voices are cached in state.
  useEffect(() => {
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length > 0) voicesRef.current = list;
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  useEffect(() => {
    const speak = (payload: VoiceSpeakPayload) => {
      if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
        pushError('Speech synthesis is not available in this renderer');
        return;
      }

      const utterance = new window.SpeechSynthesisUtterance(payload.text);
      const allVoices = voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices();
      const matchedVoice = allVoices.find((v) => v.name === payload.lang);
      if (matchedVoice) {
        utterance.lang = matchedVoice.lang;  // must be set before .voice
        utterance.voice = matchedVoice;
      } else {
        utterance.lang = languageCode;
      }
      utterance.rate = voiceRate;
      utterance.volume = voiceVolume;
      window.speechSynthesis.speak(utterance);
    };

    return window.copilot.onVoiceSpeak(speak);
  }, [languageCode, voiceRate, voiceVolume]);

  useEffect(() => {
    const play = async (payload: { filePath: string }) => {
      let objectUrl: string | null = null;
      try {
        const base64 = await window.copilot.readSoundFile(payload.filePath);
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const ext = payload.filePath.split('.').pop()?.toLowerCase() ?? 'mp3';
        const mime = ext === 'ogg' ? 'audio/ogg' : ext === 'wav' ? 'audio/wav' : 'audio/mpeg';
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));

        const audio = new Audio(objectUrl);
        audio.volume = 1;
        activeSoundsRef.current = [...activeSoundsRef.current, audio];

        const cleanup = () => {
          activeSoundsRef.current = activeSoundsRef.current.filter((item) => item !== audio);
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        };

        audio.addEventListener('ended', cleanup, { once: true });
        audio.addEventListener('error', () => { cleanup(); pushError(`Failed to play sound file: ${payload.filePath}`); }, { once: true });

        await audio.play();
      } catch {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        pushError(`Failed to play sound file: ${payload.filePath}`);
      }
    };

    return window.copilot.onSoundPlay((payload) => { void play(payload); });
  }, []);

  useEffect(() => {
    const disconnectStats = window.copilot.onObsStats((stats) => {
      setObsStats(stats);
    });
    const disconnectConnected = window.copilot.onObsConnected(() => {
      setObsStats((current) => ({ ...current, connected: true }));
    });
    const disconnectDisconnected = window.copilot.onObsDisconnected(() => {
      setObsStats((current) => ({ ...current, connected: false }));
    });

    return () => {
      disconnectStats();
      disconnectConnected();
      disconnectDisconnected();
    };
  }, [setObsStats]);

  useEffect(() => {
    const unsubStatus = window.copilot.onTwitchStatus((status, channel) => {
      setTwitchStatus(status);
      setTwitchChannel(channel);
    });
    const unsubStats = window.copilot.onTwitchLiveStats(setTwitchLiveStats);
    const unsubYt = window.copilot.onYoutubeStatus(setYoutubeStreams);
    const unsubTiktok = window.copilot.onTiktokStatus((status, username) => {
      setTiktokStatus(status);
      setTiktokUsername(username);
    });
    return () => { unsubStatus(); unsubStats(); unsubYt(); unsubTiktok(); };
  }, [setTwitchStatus, setTwitchChannel, setTwitchLiveStats, setYoutubeStreams, setTiktokStatus, setTiktokUsername]);

  useEffect(() => {
    const disconnectMessage = window.copilot.onChatMessage((message) => {
      appendChatMessage(message);
    });
    const disconnectEvent = window.copilot.onChatEvent((event) => {
      appendChatEvent(event);
    });

    return () => {
      disconnectMessage();
      disconnectEvent();
    };
  }, [appendChatEvent, appendChatMessage]);

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

  const createProfile = async (name: string, directory: string) => {
    try {
      const snapshot = await window.copilot.createProfile({ name: name.trim(), directory });
      applyProfilesSnapshot(snapshot);
      setSelectorProfileId(snapshot.activeProfileId);
      setIsProfileFormOpen(false);
      setProfileFormDirectory('');
      setProfileFormName('');
      setError(null);
    } catch (cause) {
      pushError(cause instanceof Error ? cause.message : 'Failed to create profile');
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
      pushError(cause instanceof Error ? cause.message : 'Failed to rename profile');
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
      pushError(cause instanceof Error ? cause.message : 'Failed to clone profile');
      throw cause;
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

  const openCreateProfileModal = () => {
    setProfileFormMode('create');
    setProfileFormName('');
    setProfileFormDirectory('');
    setIsProfileFormOpen(true);
  };

  const openRenameProfileModal = () => {
    if (!activeProfile) return;
    setProfileFormMode('rename');
    setProfileFormName(activeProfile.name);
    setProfileFormDirectory('');
    setIsProfileFormOpen(true);
  };

  const openCloneProfileModal = () => {
    if (!activeProfile) return;
    setProfileFormMode('clone');
    setProfileFormName(`${activeProfile.name} copy`);
    setProfileFormDirectory('');
    setIsProfileFormOpen(true);
  };

  const pickProfileDirectory = async () => {
    const directory = await window.copilot.pickProfileDirectory();
    if (!directory) return;
    setProfileFormDirectory(directory);
  };

  const submitProfileForm = async (name: string) => {
    if (profileFormMode === 'create') {
      await createProfile(name, profileFormDirectory);
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
      pushError(cause instanceof Error ? cause.message : 'Failed to save general settings');
      throw cause;
    }
  };

  return (
    <main className="h-screen overflow-hidden bg-gray-950 text-gray-200 flex flex-col">
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
          />
        ) : null}

        <StatusMessages isLoading={isLoading} error={error} />

        {hasActiveProfile && currentSection === 'dashboard' ? (
          <DashboardSummary
            activeProfileName={activeProfileName}
            chatEvents={chatEvents}
            chatMessages={chatMessages}
            obsStats={obsStats}
            twitchStatus={twitchStatus}
            twitchChannel={twitchChannel}
            twitchLiveStats={twitchLiveStats}
            youtubeStreams={youtubeStreams}
            tiktokStatus={tiktokStatus}
            tiktokUsername={tiktokUsername}
          />
        ) : null}

        {hasActiveProfile && currentSection === 'settings' ? (
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
        onChangeSelectedDirectory={setProfileFormDirectory}
        onPickDirectory={pickProfileDirectory}
        onClose={() => setIsProfileFormOpen(false)}
        onSubmit={submitProfileForm}
      />

      <ToastStack toasts={toasts} />
    </main>
  );
}
