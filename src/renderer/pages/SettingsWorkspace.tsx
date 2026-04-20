import { useState } from 'react';
import type { ReactElement } from 'react';

import type { AppLanguage, GeneralSettings, ObsStatsSnapshot, PermissionLevel, ProfileSettings, ProfileSummary } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { PlatformsSettingsPage } from './PlatformsSettings.js';
import { SettingsProfilesPanel } from '../components/SettingsProfilesPanel.js';
import { GeneralSettingsPage } from './GeneralSettings.js';
import { ObsSettingsPage } from './ObsSettings.js';
import { ChatLogsPage } from './ChatLogs.js';
import { RafflesPage } from './Raffles.js';
import { SoundCommandsPage } from './SoundCommands.js';
import { SuggestionsPage } from './Suggestions.js';
import { TextCommandsPage } from './TextCommands.js';
import { EventLogPage } from './EventLog.js';
import { VoiceCommandsPage } from './VoiceCommands.js';

type SettingsView = 'general' | 'profiles' | 'platforms' | 'obs' | 'sound' | 'text' | 'voice' | 'raffles' | 'suggestions' | 'chat-logs' | 'event-log';

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
  appLanguage: AppLanguage;
  onSaveProfileSettings: (settings: ProfileSettings) => Promise<ProfileSettings>;
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

type SettingsGroup = {
  label: string;
  items: Array<{ id: SettingsView; label: string; icon: ReactElement }>;
};

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: 'App',
    items: [
      {
        id: 'general',
        label: 'General',
        icon: (
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ),
      },
      {
        id: 'chat-logs',
        label: 'Chat Logs',
        icon: (
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        ),
      },
      {
        id: 'event-log',
        label: 'Event Log',
        icon: (
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
      },
      {
        id: 'profiles',
        label: 'Profiles',
        icon: (
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5V4H2v16h5m10 0v-2a4 4 0 00-8 0v2m8 0H9m8-10a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Platforms',
    items: [
      {
        id: 'platforms',
        label: 'Connections',
        icon: (
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Commands',
    items: [
      {
        id: 'sound',
        label: 'Sound Commands',
        icon: (
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536a5 5 0 000 7.072M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        id: 'voice',
        label: 'Voice (TTS)',
        icon: (
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        ),
      },
      {
        id: 'text',
        label: 'Text Commands',
        icon: (
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h8m-8 4h6M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Automations',
    items: [
      {
        id: 'raffles',
        label: 'Raffles',
        icon: (
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3l7 4v5c0 5-3 8-7 9-4-1-7-4-7-9V7l7-4z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 11l2 2 4-4" />
          </svg>
        ),
      },
      {
        id: 'suggestions',
        label: 'Suggestions',
        icon: (
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'Integrations',
    items: [
      {
        id: 'obs',
        label: 'OBS Studio',
        icon: (
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth="2" />
            <circle cx="12" cy="12" r="4" strokeWidth="2" />
          </svg>
        ),
      },
    ],
  },
];

export function SettingsWorkspace(props: SettingsWorkspaceProps) {
  const { messages } = useI18n();
  const [currentView, setCurrentView] = useState<SettingsView>('general');

  const labelForGroup = (label: string) => ({
    App: messages.settings.app,
    Platforms: messages.settings.platforms,
    Commands: messages.settings.commands,
    Automations: messages.settings.automations,
    Integrations: messages.settings.integrations,
  }[label] ?? label);

  const labelForItem = (id: SettingsView, label: string) => ({
    general: messages.settings.general,
    'chat-logs': messages.settings.chatLogs,
    'event-log': messages.settings.eventLog,
    profiles: messages.profile.profiles,
    platforms: messages.settings.connections,
    sound: messages.settings.soundCommands,
    voice: messages.settings.voiceTts,
    text: messages.settings.textCommands,
    raffles: messages.settings.raffles,
    suggestions: messages.settings.suggestions,
    obs: 'OBS Studio',
  }[id] ?? label);

  return (
    <section className="flex-1 min-h-0 flex">
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300">{messages.settings.title}</h2>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {SETTINGS_GROUPS.map((group) => (
            <div key={group.label} className="px-3 pb-1">
              <p className="text-xs text-gray-600 uppercase tracking-wider px-2 py-1">{labelForGroup(group.label)}</p>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCurrentView(item.id)}
                  className={
                    currentView === item.id
                      ? 'w-full text-left flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors bg-gray-800 text-white'
                      : 'w-full text-left flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors text-gray-400 hover:text-white'
                  }
                >
                  {item.icon}
                  {labelForItem(item.id, item.label)}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {currentView === 'general' ? (
          <GeneralSettingsPage
            settings={props.generalSettings}
            onSave={props.onSaveGeneralSettings}
            appLanguage={props.appLanguage}
            onSaveProfileSettings={props.onSaveProfileSettings}
            onNavigateToEventLog={() => setCurrentView('event-log')}
          />
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
          />
        ) : null}
        {currentView === 'platforms' ? <PlatformsSettingsPage /> : null}
        {currentView === 'obs' ? <ObsSettingsPage obsStats={props.obsStats} /> : null}
        {currentView === 'sound' ? <SoundCommandsPage /> : null}
        {currentView === 'text' ? <TextCommandsPage /> : null}
        {currentView === 'voice' ? (
          <VoiceCommandsPage
            voiceRate={props.voiceRate}
            voiceVolume={props.voiceVolume}
            onChangeVoiceRate={props.onChangeVoiceRate}
            onChangeVoiceVolume={props.onChangeVoiceVolume}
          />
        ) : null}
        {currentView === 'raffles' ? <RafflesPage /> : null}
        {currentView === 'suggestions' ? <SuggestionsPage /> : null}
        {currentView === 'chat-logs' ? <ChatLogsPage /> : null}
        {currentView === 'event-log' ? <EventLogPage /> : null}
      </div>
    </section>
  );
}
