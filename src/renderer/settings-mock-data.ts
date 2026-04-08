import type { PermissionLevel } from '../shared/types.js';

export interface SoundCommandRow {
  id: string;
  trigger: string;
  fileName: string;
  allowedLevels: PermissionLevel[];
  cooldownSeconds: number;
  enabled: boolean;
}

export interface VoiceCommandRow {
  id: string;
  trigger: string;
  template: string | null;
  languageCode: string;
  allowedLevels: PermissionLevel[];
  cooldownSeconds: number;
  enabled: boolean;
}

export interface ScheduledMessageRow {
  id: string;
  message: string;
  intervalMinutes: number;
  randomWindowMinutes: number;
  platforms: string[];
  lastSentLabel: string;
  enabled: boolean;
}

export const SOUND_COMMAND_ROWS: SoundCommandRow[] = [
  {
    id: 'sound-1',
    trigger: '!gato',
    fileName: 'cat.mp3',
    allowedLevels: ['everyone'],
    cooldownSeconds: 10,
    enabled: true,
  },
  {
    id: 'sound-2',
    trigger: '!airhorn',
    fileName: 'airhorn.wav',
    allowedLevels: ['subscriber', 'moderator'],
    cooldownSeconds: 30,
    enabled: true,
  },
];

export const VOICE_COMMAND_ROWS: VoiceCommandRow[] = [
  {
    id: 'voice-1',
    trigger: '!voice',
    template: null,
    languageCode: 'en-US',
    allowedLevels: ['subscriber', 'moderator'],
    cooldownSeconds: 5,
    enabled: true,
  },
  {
    id: 'voice-2',
    trigger: '!good_morning',
    template: 'Good morning everyone.',
    languageCode: 'en-US',
    allowedLevels: ['everyone'],
    cooldownSeconds: 300,
    enabled: true,
  },
];

export const SCHEDULED_MESSAGE_ROWS: ScheduledMessageRow[] = [
  {
    id: 'scheduled-1',
    message: 'Remember to follow the channel.',
    intervalMinutes: 15,
    randomWindowMinutes: 5,
    platforms: ['twitch', 'youtube', 'kick'],
    lastSentLabel: '09:30',
    enabled: true,
  },
  {
    id: 'scheduled-2',
    message: 'Discord link is in the panel below the stream.',
    intervalMinutes: 30,
    randomWindowMinutes: 0,
    platforms: ['twitch'],
    lastSentLabel: '08:55',
    enabled: false,
  },
];
