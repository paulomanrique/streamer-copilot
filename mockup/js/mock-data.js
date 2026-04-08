const MOCK_MESSAGES = [
  {
    id: '1', platform: 'twitch', author: 'xGamer99', content: 'fala galera o/o/o/',
    badges: ['subscriber'], isMod: false, isSub: true, ts: Date.now() - 60000
  },
  {
    id: '2', platform: 'youtube', author: 'TechWatcher', content: 'que jogo incrível cara',
    badges: ['member'], isMod: false, isSub: true, ts: Date.now() - 55000
  },
  {
    id: '3', platform: 'kick', author: 'br_live', content: '!gato',
    badges: [], isMod: false, isSub: false, ts: Date.now() - 50000
  },
  {
    id: '4', platform: 'twitch', author: 'ModPower', content: 'bem vindos ao stream!',
    badges: ['moderator'], isMod: true, isSub: false, ts: Date.now() - 45000
  },
  {
    id: '5', platform: 'youtube', author: 'SuperFan2024', content: '!voice boa tarde a todos',
    badges: [], isMod: false, isSub: false, ts: Date.now() - 40000
  },
  {
    id: '6', platform: 'twitch', author: 'ProStreamer', content: 'KEKW KEKW KEKW',
    badges: ['subscriber', 'moderator'], isMod: true, isSub: true, ts: Date.now() - 35000
  },
  {
    id: '7', platform: 'kick', author: 'kickfan', content: 'chegando agora, o que perdeu?',
    badges: [], isMod: false, isSub: false, ts: Date.now() - 30000
  },
  {
    id: '8', platform: 'twitch', author: 'DonorKing', content: '!cachorro',
    badges: ['subscriber'], isMod: false, isSub: true, ts: Date.now() - 25000
  },
  {
    id: '9', platform: 'youtube', author: 'Lurker123', content: 'PogChamp',
    badges: [], isMod: false, isSub: false, ts: Date.now() - 20000
  },
  {
    id: '10', platform: 'twitch', author: 'NewFollower', content: 'acabei de seguir!',
    badges: [], isMod: false, isSub: false, ts: Date.now() - 15000
  },
];

const MOCK_EVENTS = [
  { id: 'e1', platform: 'twitch', type: 'subscription', author: 'xGamer99', message: 'Mês 3!', ts: Date.now() - 120000 },
  { id: 'e2', platform: 'youtube', type: 'superchat', author: 'TechWatcher', amount: 10, message: 'Stream top!', ts: Date.now() - 90000 },
  { id: 'e3', platform: 'twitch', type: 'raid', author: 'OtherStreamer', amount: 45, ts: Date.now() - 60000 },
  { id: 'e4', platform: 'kick', type: 'follow', author: 'NewKickUser', ts: Date.now() - 30000 },
  { id: 'e5', platform: 'twitch', type: 'cheer', author: 'ProStreamer', amount: 500, ts: Date.now() - 10000 },
];

const MOCK_OBS_STATS = {
  scene: 'Gameplay',
  streaming: true,
  streamTime: '01:23:47',
  cpuUsage: 18.4,
  memoryUsage: 2340,
  // Connection quality: ratio of successfully sent frames
  outputSkippedFrames: 8,    // dropped by network/connection
  outputTotalFrames: 298800,
  // Encoding: frames dropped because encoder couldn't keep up
  encoderSkippedFrames: 4,
  encoderTotalFrames: 298800,
  // Render: frames missed by the renderer (GPU/display)
  renderSkippedFrames: 0,
  renderTotalFrames: 298800,
};

const MOCK_SOUND_COMMANDS = [
  { id: 's1', trigger: '!gato', file: 'cat.mp3', permissions: ['everyone'], cooldown: 10, enabled: true },
  { id: 's2', trigger: '!cachorro', file: 'dog.mp3', permissions: ['subscriber', 'moderator'], cooldown: 30, enabled: true },
  { id: 's3', trigger: '!aplausos', file: 'applause.mp3', permissions: ['moderator'], cooldown: 60, enabled: true },
  { id: 's4', trigger: '!corneta', file: 'horn.mp3', permissions: ['everyone'], cooldown: 15, enabled: false },
];

const MOCK_VOICE_COMMANDS = [
  { id: 'v1', trigger: '!voice', template: null, language: 'pt-BR', permissions: ['subscriber', 'moderator'], cooldown: 5, enabled: true },
  { id: 'v2', trigger: '!bom_dia', template: 'bom dia a todos!', language: 'pt-BR', permissions: ['everyone'], cooldown: 300, enabled: true },
];

const MOCK_SCHEDULED = [
  { id: 'm1', message: 'Lembre-se de seguir o canal! 💜', interval: 15, randomWindow: 5, platforms: ['twitch', 'youtube', 'kick'], enabled: true, lastSent: Date.now() - 420000 },
  { id: 'm2', message: 'Visite meu Discord: discord.gg/exemplo', interval: 30, randomWindow: 0, platforms: ['twitch'], enabled: true, lastSent: null },
  { id: 'm3', message: 'Comandos disponíveis: !gato !cachorro !voice', interval: 20, randomWindow: 10, platforms: ['twitch', 'youtube', 'kick'], enabled: false, lastSent: null },
];

const MOCK_ACTIVITY_LOG = [
  { id: 'a1',  ts: Date.now() - 10000,  type: 'cheer',        platform: 'twitch',  author: 'ProStreamer',    amount: 500 },
  { id: 'a2',  ts: Date.now() - 25000,  type: 'sound',        platform: 'kick',    author: 'br_live',       trigger: '!gato' },
  { id: 'a3',  ts: Date.now() - 40000,  type: 'follow',       platform: 'kick',    author: 'NewKickUser' },
  { id: 'a4',  ts: Date.now() - 55000,  type: 'subscription', platform: 'twitch',  author: 'xGamer99',      message: 'Mês 3!' },
  { id: 'a5',  ts: Date.now() - 90000,  type: 'superchat',    platform: 'youtube', author: 'TechWatcher',   amount: 10, message: 'Stream top!' },
  { id: 'a6',  ts: Date.now() - 120000, type: 'raid',         platform: 'twitch',  author: 'OtherStreamer', amount: 45 },
  { id: 'a7',  ts: Date.now() - 150000, type: 'scheduled',    message: 'Lembre-se de seguir o canal! 💜' },
  { id: 'a8',  ts: Date.now() - 180000, type: 'gift',         platform: 'twitch',  author: 'DonorKing',     amount: 5 },
  { id: 'a9',  ts: Date.now() - 240000, type: 'follow',       platform: 'twitch',  author: 'NewFollower' },
  { id: 'a10', ts: Date.now() - 270000, type: 'sound',        platform: 'twitch',  author: 'DonorKing',     trigger: '!cachorro' },
  { id: 'a11', ts: Date.now() - 300000, type: 'subscription', platform: 'youtube', author: 'SuperFan2024' },
  { id: 'a12', ts: Date.now() - 360000, type: 'scheduled',    message: 'Visite meu Discord: discord.gg/exemplo' },
  { id: 'a13', ts: Date.now() - 420000, type: 'cheer',        platform: 'twitch',  author: 'xGamer99',      amount: 100 },
  { id: 'a14', ts: Date.now() - 480000, type: 'follow',       platform: 'youtube', author: 'Lurker123' },
];
