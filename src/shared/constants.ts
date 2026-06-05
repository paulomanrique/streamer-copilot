import type { AppLanguage, LanguageOption, PermissionLevel } from './types.js';

export const APP_NAME = 'Streamer Copilot';

export const PROFILE_CONFIG_FILES = {
  settings: 'settings.json',
  soundCommands: 'commands.sound.json',
  textCommands: 'commands.text.json',
  voiceCommands: 'commands.voice.json',
  scheduled: 'scheduled.json',
  raffles: 'raffles.json',
  polls: 'polls.json',
  suggestions: 'suggestions.json',
  obsSettings: 'obs-settings.json',
} as const;

export const DEFAULT_APP_LANGUAGE: AppLanguage = 'pt-BR';

export const APP_LANGUAGE_OPTIONS: Array<{ code: AppLanguage; label: string; nativeLabel: string }> = [
  { code: 'pt-BR', label: 'Portuguese', nativeLabel: 'Portugues' },
  { code: 'en-US', label: 'English', nativeLabel: 'English' },
];

export const PERMISSION_LEVELS: PermissionLevel[] = [
  'everyone',
  'follower',
  'subscriber',
  'vip',
  'moderator',
  'broadcaster',
];

/**
 * Curated font choices for overlay styling.
 *
 * `stack` is plugged into the CSS `font-family` of every overlay; `google`
 * is the family-spec fragment for `https://fonts.googleapis.com/css2?family=…`
 * (null = system font, no network fetch). Renderer, overlay HTML pages,
 * and the CSS-var setter all consume this same list — adding a font here
 * lights it up everywhere.
 */
export interface OverlayFontOption {
  key: string;
  label: string;
  stack: string;
  google: string | null;
}

export const OVERLAY_FONTS: OverlayFontOption[] = [
  { key: 'system', label: 'System', stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', google: null },
  { key: 'inter', label: 'Inter', stack: '"Inter", sans-serif', google: 'Inter:wght@400;600;800' },
  { key: 'roboto', label: 'Roboto', stack: '"Roboto", sans-serif', google: 'Roboto:wght@400;500;700' },
  { key: 'poppins', label: 'Poppins', stack: '"Poppins", sans-serif', google: 'Poppins:wght@400;600;800' },
  { key: 'open-sans', label: 'Open Sans', stack: '"Open Sans", sans-serif', google: 'Open+Sans:wght@400;600;800' },
  { key: 'lato', label: 'Lato', stack: '"Lato", sans-serif', google: 'Lato:wght@400;700;900' },
  { key: 'montserrat', label: 'Montserrat', stack: '"Montserrat", sans-serif', google: 'Montserrat:wght@400;600;800' },
  { key: 'nunito', label: 'Nunito', stack: '"Nunito", sans-serif', google: 'Nunito:wght@400;700;900' },
  { key: 'oswald', label: 'Oswald', stack: '"Oswald", sans-serif', google: 'Oswald:wght@400;600;700' },
  { key: 'bebas-neue', label: 'Bebas Neue', stack: '"Bebas Neue", sans-serif', google: 'Bebas+Neue' },
  { key: 'jetbrains-mono', label: 'JetBrains Mono', stack: '"JetBrains Mono", monospace', google: 'JetBrains+Mono:wght@400;600;800' },
];

export const DEFAULT_OVERLAY_FONT_KEY = 'system';

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
