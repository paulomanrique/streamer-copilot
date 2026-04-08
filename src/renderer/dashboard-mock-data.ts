import type {
  ChatMessage,
  PlatformConnectionStatus,
  StreamEvent,
} from '../shared/types.js';

export const DASHBOARD_CONNECTIONS: PlatformConnectionStatus[] = [
  { platform: 'twitch', label: 'Twitch', connected: true },
  { platform: 'youtube', label: 'YouTube', connected: true },
  { platform: 'kick', label: 'Kick', connected: true },
  { platform: 'tiktok', label: 'TikTok', connected: false },
];

export const DASHBOARD_MESSAGES: ChatMessage[] = [
  {
    id: 'm1',
    platform: 'twitch',
    author: 'ModPower',
    content: 'Welcome in. Today we are testing the new dashboard shell.',
    badges: ['moderator'],
    timestampLabel: '09:41',
  },
  {
    id: 'm2',
    platform: 'youtube',
    author: 'TechWatcher',
    content: 'The multi-platform setup looks much cleaner now.',
    badges: ['member'],
    timestampLabel: '09:42',
  },
  {
    id: 'm3',
    platform: 'kick',
    author: 'br_live',
    content: '!gato',
    badges: [],
    timestampLabel: '09:43',
  },
  {
    id: 'm4',
    platform: 'youtube',
    author: 'ClipHunter',
    content: 'Vertical stream stats would be great here too.',
    badges: ['subscriber'],
    timestampLabel: '09:44',
  },
];

export const DASHBOARD_EVENTS: StreamEvent[] = [
  {
    id: 'e1',
    platform: 'youtube',
    type: 'superchat',
    author: 'TechWatcher',
    amount: 10,
    message: 'Stream is looking sharp today.',
    timestampLabel: '09:42',
  },
  {
    id: 'e2',
    platform: 'twitch',
    type: 'raid',
    author: 'OtherStreamer',
    amount: 45,
    timestampLabel: '09:43',
  },
  {
    id: 'e3',
    platform: 'twitch',
    type: 'cheer',
    author: 'BitsHero',
    amount: 500,
    timestampLabel: '09:44',
  },
];
