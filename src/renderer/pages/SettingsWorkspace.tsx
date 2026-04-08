import { useState } from 'react';

import type { PermissionLevel, ProfileSummary } from '../../shared/types.js';
import { PlatformSettingsPreview } from '../components/PlatformSettingsPreview.js';
import { SettingsProfilesPanel } from '../components/SettingsProfilesPanel.js';
import { styles } from '../components/app-styles.js';
import { ScheduledMessagesPage } from './ScheduledMessages.js';
import { SoundCommandsPage } from './SoundCommands.js';
import { VoiceCommandsPage } from './VoiceCommands.js';

type SettingsView = 'profiles' | 'platforms' | 'sound' | 'voice' | 'scheduled';

interface SettingsWorkspaceProps {
  activeProfileId: string;
  activeProfileName: string;
  profiles: ProfileSummary[];
  onCreateProfile: () => void;
  onRenameProfile: () => void;
  onCloneProfile: () => void;
  onDeleteProfile: () => void;
  onSelectProfile: (profileId: string) => void;
  languageCode: string;
  permissionLevels: PermissionLevel[];
  onChangeLanguageCode: (code: string) => void;
  onChangePermissionLevels: (levels: PermissionLevel[]) => void;
  voiceRate: number;
  voiceVolume: number;
  onChangeVoiceRate: (value: number) => void;
  onChangeVoiceVolume: (value: number) => void;
}

const SETTINGS_VIEWS: Array<{ id: SettingsView; label: string }> = [
  { id: 'profiles', label: 'Profiles' },
  { id: 'platforms', label: 'Platforms' },
  { id: 'sound', label: 'Sound Commands' },
  { id: 'voice', label: 'Voice Commands' },
  { id: 'scheduled', label: 'Scheduled Messages' },
];

export function SettingsWorkspace(props: SettingsWorkspaceProps) {
  const [currentView, setCurrentView] = useState<SettingsView>('profiles');

  return (
    <section style={styles.settingsLayout}>
      <aside style={styles.settingsNav}>
        {SETTINGS_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            style={currentView === view.id ? styles.settingsNavButtonActive : styles.settingsNavButton}
            onClick={() => setCurrentView(view.id)}
          >
            {view.label}
          </button>
        ))}
      </aside>

      <div>
        {currentView === 'profiles' ? (
          <SettingsProfilesPanel
            activeProfileId={props.activeProfileId}
            activeProfileName={props.activeProfileName}
            profiles={props.profiles}
            onCreateProfile={props.onCreateProfile}
            onRenameProfile={props.onRenameProfile}
            onCloneProfile={props.onCloneProfile}
            onDeleteProfile={props.onDeleteProfile}
            onSelectProfile={props.onSelectProfile}
            languageCode={props.languageCode}
            permissionLevels={props.permissionLevels}
            onChangeLanguageCode={props.onChangeLanguageCode}
            onChangePermissionLevels={props.onChangePermissionLevels}
          />
        ) : null}

        {currentView === 'platforms' ? <PlatformSettingsPreview activeProfileName={props.activeProfileName} /> : null}
        {currentView === 'sound' ? <SoundCommandsPage /> : null}
        {currentView === 'voice' ? (
          <VoiceCommandsPage
            voiceRate={props.voiceRate}
            voiceVolume={props.voiceVolume}
            onChangeVoiceRate={props.onChangeVoiceRate}
            onChangeVoiceVolume={props.onChangeVoiceVolume}
          />
        ) : null}
        {currentView === 'scheduled' ? <ScheduledMessagesPage /> : null}
      </div>
    </section>
  );
}
