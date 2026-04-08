import type {
  ChatMessage,
  PlatformConnectionStatus,
  StreamEvent,
} from '../shared/types.js';

export const DASHBOARD_CONNECTIONS: PlatformConnectionStatus[] = [
  { platform: 'twitch', label: 'Twitch', connected: true },
  { platform: 'youtube', label: 'YT Horizontal', connected: true },
  { platform: 'kick', label: 'Kick', connected: true },
  { platform: 'tiktok', label: 'TikTok', connected: false },
];

export const DASHBOARD_MESSAGES: ChatMessage[] = [
  { id: 'm1',  platform: 'twitch',  author: 'ModPower',     content: 'welcome to the stream!',                   badges: ['moderator', 'subscriber'], timestampLabel: '10:40' },
  { id: 'm2',  platform: 'youtube', author: 'VertFan',      content: 'watching on mobile, this is great',         badges: [],                          timestampLabel: '10:40' },
  { id: 'm3',  platform: 'youtube', author: 'SuperFan2024', content: '!voice good afternoon everyone',            badges: ['subscriber'],              timestampLabel: '10:41' },
  { id: 'm4',  platform: 'twitch',  author: 'ProStreamer',  content: 'KEKW KEKW KEKW',                           badges: ['moderator'],               timestampLabel: '10:41' },
  { id: 'm5',  platform: 'tiktok',  author: 'tiktok_br',   content: '!cat',                                      badges: [],                          timestampLabel: '10:42' },
  { id: 'm6',  platform: 'kick',    author: 'kickfan',     content: 'just got here, what did I miss?',           badges: [],                          timestampLabel: '10:42' },
  { id: 'm7',  platform: 'youtube', author: 'MobileViewer', content: 'watching on shorts!',                      badges: [],                          timestampLabel: '10:43' },
  { id: 'm8',  platform: 'twitch',  author: 'DonorKing',   content: '!dog',                                      badges: ['subscriber'],              timestampLabel: '10:43' },
  { id: 'm9',  platform: 'youtube', author: 'Lurker123',   content: 'PogChamp',                                  badges: [],                          timestampLabel: '10:44' },
  { id: 'm10', platform: 'twitch',  author: 'NewFollower', content: 'just followed!',                            badges: [],                          timestampLabel: '10:44' },
  { id: 'm11', platform: 'tiktok',  author: 'tiktoker99',  content: 'say hi to TikTok 👋',                      badges: [],                          timestampLabel: '10:44' },
  { id: 'm12', platform: 'kick',    author: 'br_live',     content: '!gato',                                     badges: [],                          timestampLabel: '10:45' },
  { id: 'm13', platform: 'twitch',  author: 'xGamer99',    content: 'month 3 lets gooo',                         badges: ['subscriber'],              timestampLabel: '10:45' },
  { id: 'm14', platform: 'youtube', author: 'TechWatcher', content: 'the OBS panel looks great btw',             badges: ['member'],                  timestampLabel: '10:45' },
  { id: 'm15', platform: 'twitch',  author: 'OtherStreamer', content: 'raiding in, get ready!',                  badges: ['moderator'],               timestampLabel: '10:45' },
];

export const DASHBOARD_EVENTS: StreamEvent[] = [
  { id: 'e1',  platform: 'twitch',  type: 'subscription', author: 'xGamer99',     message: 'Month 3!',              timestampLabel: '10:44' },
  { id: 'e2',  platform: 'youtube', type: 'superchat',    author: 'TechWatcher',  amount: 10.00, message: 'Stream top!', timestampLabel: '10:43' },
  { id: 'e3',  platform: 'twitch',  type: 'raid',         author: 'OtherStreamer', amount: 45,                       timestampLabel: '10:43' },
  { id: 'e4',  platform: 'twitch',  type: 'cheer',        author: 'ProStreamer',  amount: 500,                      timestampLabel: '10:45' },
  { id: 'e5',  platform: 'kick',    type: 'follow',       author: 'NewKickUser',                                    timestampLabel: '10:44' },
  { id: 'e6',  platform: 'twitch',  type: 'gift',         author: 'DonorKing',   amount: 5,                        timestampLabel: '10:42' },
  { id: 'e7',  platform: 'twitch',  type: 'follow',       author: 'NewFollower',                                    timestampLabel: '10:41' },
  { id: 'e8',  platform: 'youtube', type: 'subscription', author: 'SuperFan2024',                                   timestampLabel: '10:40' },
];
