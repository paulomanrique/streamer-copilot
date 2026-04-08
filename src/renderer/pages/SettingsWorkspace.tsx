import { useState } from 'react';

import type { ObsStatsSnapshot, PermissionLevel, ProfileSummary } from '../../shared/types.js';
import type { GeneralSettings } from '../../shared/types.js';
import { PlatformSettingsPreview } from '../components/PlatformSettingsPreview.js';
import { SettingsProfilesPanel } from '../components/SettingsProfilesPanel.js';
import { styles } from '../components/app-styles.js';
import { GeneralSettingsPage } from './GeneralSettings.js';
import { ObsSettingsPage } from './ObsSettings.js';
import { ScheduledMessagesPage } from './ScheduledMessages.js';
import { SoundCommandsPage } from './SoundCommands.js';
import { VoiceCommandsPage } from './VoiceCommands.js';

type SettingsView = 'general' | 'profiles' | 'platforms' | 'obs' | 'sound' | 'voice' | 'scheduled';

interface SettingsWorkspaceProps {
  activeProfileId: string;
  activeProfileName: string;
  profiles: ProfileSummary[];
  onCreateProfile: () => void;
  onRenameProfile: () => void;
  onCloneProfile: () => void;
  onDeleteProfile: () => void;
  onSelectProfile: (profileId: string) => void;
  generalSettings: GeneralSettings;
  onSaveGeneralSettings: (settings: GeneralSettings) => Promise<void>;
  languageCode: string;
  permissionLevels: PermissionLevel[];
  onChangeLanguageCode: (code: string) => void;
  onChangePermissionLevels: (levels: PermissionLevel[]) => void;
  voiceRate: number;
  voiceVolume: number;
  onChangeVoiceRate: (value: number) => void;
  onChangeVoiceVolume: (value: number) => void;
  obsStats: ObsStatsSnapshot;
}

const SETTINGS_GROUPS: Array<{ label: string; items: Array<{ id: SettingsView; label: string }> }> = [
  { label: 'Platforms', items: [{ id: 'platforms', label: 'Connections' }] },
  {
    label: 'Commands',
    items: [
      { id: 'sound', label: 'Sound Commands' },
      { id: 'voice', label: 'Voice (TTS)' },
    ],
  },
  { label: 'Automations', items: [{ id: 'scheduled', label: 'Scheduled Messages' }] },
  { label: 'Integrations', items: [{ id: 'obs', label: 'OBS Studio' }] },
  {
    label: 'App',
    items: [
      { id: 'general', label: 'General' },
      { id: 'profiles', label: 'Profiles' },
    ],
  },
];

export function SettingsWorkspace(props: SettingsWorkspaceProps) {
  const [currentView, setCurrentView] = useState<SettingsView>('general');

  return (
    <section style={styles.settingsWorkspaceShell}>
      <aside style={styles.settingsSidebar}>
        <div style={styles.settingsSidebarHeader}>
          <h2 style={styles.settingsSidebarTitle}>Settings</h2>
        </div>

        <nav style={styles.settingsSidebarNav}>
          {SETTINGS_GROUPS.map((group) => (
            <section key={group.label} style={styles.settingsSidebarGroup}>
              <p style={styles.settingsSidebarGroupLabel}>{group.label}</p>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  style={currentView === item.id ? styles.settingsSidebarButtonActive : styles.settingsSidebarButton}
                  onClick={() => setCurrentView(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </section>
          ))}
        </nav>
      </aside>

      <div style={styles.settingsContentArea}>
        {currentView === 'general' ? (
          <GeneralSettingsPage settings={props.generalSettings} onSave={props.onSaveGeneralSettings} />
        ) : null}

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
        {currentView === 'obs' ? <ObsSettingsPage obsStats={props.obsStats} /> : null}
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
