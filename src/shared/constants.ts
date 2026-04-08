import type { LanguageOption, PermissionLevel } from './types.js';

export const APP_NAME = 'Streamer Copilot';

export const PROFILE_CONFIG_FILES = {
  settings: 'settings.json',
  soundCommands: 'commands.sound.json',
  voiceCommands: 'commands.voice.json',
  scheduled: 'scheduled.json',
} as const;

export const PERMISSION_LEVELS: PermissionLevel[] = [
  'everyone',
  'follower',
  'subscriber',
  'moderator',
  'broadcaster',
];

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'pt-BR', label: 'Portuguese', nativeLabel: 'Portugues' },
  { code: 'en-US', label: 'English', nativeLabel: 'English' },
  { code: 'es-ES', label: 'Spanish', nativeLabel: 'Espanol' },
  { code: 'fr-FR', label: 'French', nativeLabel: 'Francais' },
  { code: 'de-DE', label: 'German', nativeLabel: 'Deutsch' },
  { code: 'nl-NL', label: 'Dutch', nativeLabel: 'Nederlands' },
  { code: 'ru-RU', label: 'Russian', nativeLabel: 'Russkiy' },
  { code: 'ko-KR', label: 'Korean', nativeLabel: 'Hangug-eo' },
  { code: 'ja-JP', label: 'Japanese', nativeLabel: 'Nihongo' },
  { code: 'zh-CN', label: 'Chinese', nativeLabel: 'Zhongwen' },
  { code: 'ar-SA', label: 'Arabic', nativeLabel: 'Al-Arabiyya' },
];
