import { useState } from 'react';
import type { ReactElement } from 'react';

import type { AppLanguage, GeneralSettings, PermissionLevel, ProfileSettings, ProfileSummary } from '../../shared/types.js';
import { useI18n } from '../i18n/I18nProvider.js';
import { PlatformsSettingsPage } from './PlatformsSettings.js';
import { SettingsProfilesPanel } from '../components/SettingsProfilesPanel.js';
import { GeneralSettingsPage } from './GeneralSettings.js';
import { ChatLogsPage } from './ChatLogs.js';
import { EventLogPage } from './EventLog.js';
import { VoiceCommandsPage } from './VoiceCommands.js';
// Side-effect import: every module's registry entry registers itself here.
import '../modules/register-all.js';
import { listRendererModules, type RendererSettingsGroup } from '../modules/registry.js';

// Route ids that are hardcoded in this file (App + Platforms groups + the
// Voice page, which still takes props). Every other view comes from the
// module registry.
type SettingsView = 'general' | 'profiles' | 'platforms' | 'voice' | 'chat-logs' | 'event-log' | string;

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
}

// Group labels that show up in the sidebar. Modules / Integrations items
// come from the registry below.
type SettingsGroupLabel = 'App' | 'Platforms' | 'Modules' | 'Integrations';

type SidebarItem = { id: SettingsView; label: string; icon: ReactElement };
type SettingsGroup = { label: SettingsGroupLabel; items: SidebarItem[] };

// Static items: App + Platforms + Voice. Modules / Integrations items get
// merged in below from the renderer module registry.
const STATIC_SETTINGS_GROUPS: SettingsGroup[] = [
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
    // Voice still takes props from App.tsx (rate/volume + callbacks), so it
    // stays in the static list. Every other module entry comes from the
    // registry below.
    label: 'Modules',
    items: [
      {
        id: 'voice',
        label: 'Voice (TTS)',
        icon: (
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        ),
      },
    ],
  },
];

/** Build the full sidebar by folding registry-provided items into the
 *  static groups. Each registered module declares which group it lives in. */
function buildSettingsGroups(): SettingsGroup[] {
  const merged: SettingsGroup[] = STATIC_SETTINGS_GROUPS.map((g) => ({
    label: g.label,
    items: [...g.items],
  }));

  // Ensure every registered group exists even if no static item lives there.
  const groupsByLabel = new Map<SettingsGroupLabel, SettingsGroup>();
  for (const g of merged) groupsByLabel.set(g.label, g);
  const ensureGroup = (label: RendererSettingsGroup): SettingsGroup => {
    let group = groupsByLabel.get(label);
    if (!group) {
      group = { label, items: [] };
      groupsByLabel.set(label, group);
      merged.push(group);
    }
    return group;
  };

  for (const m of listRendererModules()) {
    ensureGroup(m.group).items.push({ id: m.id, label: m.fallbackLabel, icon: m.icon });
  }

  return merged;
}

export function SettingsWorkspace(props: SettingsWorkspaceProps) {
  const { messages } = useI18n();
  const [currentView, setCurrentView] = useState<SettingsView>('general');

  const SETTINGS_GROUPS = buildSettingsGroups();

  // Lookup table from view id to its `messages.settings.X` key. Items not
  // covered here (registry-supplied modules without a labelKey, the
  // moderation/obs/overlays placeholders) fall back to the static label
  // passed in the SidebarItem.
  const I18N_KEY_BY_ID: Record<string, keyof typeof messages.settings> = {
    general: 'general',
    'chat-logs': 'chatLogs',
    'event-log': 'eventLog',
    platforms: 'connections',
    voice: 'voiceTts',
  };
  for (const m of listRendererModules()) {
    if (m.labelKey) I18N_KEY_BY_ID[m.id] = m.labelKey;
  }

  const labelForGroup = (label: string) => ({
    App: messages.settings.app,
    Platforms: messages.settings.platforms,
    Modules: messages.settings.modules,
    Integrations: messages.settings.integrations,
  }[label] ?? label);

  const labelForItem = (id: SettingsView, label: string) => {
    if (id === 'profiles') return messages.profile.profiles;
    const key = I18N_KEY_BY_ID[id];
    if (key) return messages.settings[key] ?? label;
    return label;
  };

  return (
    <section className="flex-1 min-h-0 flex">
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-300">{messages.settings.title}</h2>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {SETTINGS_GROUPS.map((group) => {
            // Sort each group by the *rendered* (i18n-resolved) label so the
            // alphabetical order tracks the active locale instead of the
            // English source labels in the SETTINGS_GROUPS array.
            const sortedItems = [...group.items].sort((a, b) =>
              labelForItem(a.id, a.label).localeCompare(
                labelForItem(b.id, b.label),
                undefined,
                { sensitivity: 'base' },
              ),
            );
            return (
              <div key={group.label} className="px-3 pb-1">
                <p className="text-xs text-gray-600 uppercase tracking-wider px-2 py-1">{labelForGroup(group.label)}</p>
                {sortedItems.map((item) => (
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
            );
          })}
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
        {currentView === 'voice' ? (
          <VoiceCommandsPage
            voiceRate={props.voiceRate}
            voiceVolume={props.voiceVolume}
            onChangeVoiceRate={props.onChangeVoiceRate}
            onChangeVoiceVolume={props.onChangeVoiceVolume}
          />
        ) : null}
        {currentView === 'chat-logs' ? <ChatLogsPage /> : null}
        {currentView === 'event-log' ? <EventLogPage /> : null}
        {/* Registry-driven module pages. Each module declares its own
            view id and component — adding one doesn't touch this file. */}
        {listRendererModules().map((m) =>
          currentView === m.id ? <m.SettingsPage key={m.id} /> : null,
        )}
      </div>
    </section>
  );
}
