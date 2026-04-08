const PLATFORM_COLORS = {
  twitch: { border: 'border-l-purple-500', bg: 'hover:bg-purple-500/5', badge: 'bg-purple-500/20 text-purple-300', dot: 'bg-purple-500', label: 'Twitch' },
  youtube: { border: 'border-l-red-500', bg: 'hover:bg-red-500/5', badge: 'bg-red-500/20 text-red-300', dot: 'bg-red-500', label: 'YouTube' },
  kick: { border: 'border-l-green-500', bg: 'hover:bg-green-500/5', badge: 'bg-green-500/20 text-green-300', dot: 'bg-green-500', label: 'Kick' },
};

const PLATFORM_ICONS = {
  twitch: `<svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>`,
  youtube: `<svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>`,
  kick: `<svg class="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M2 2h4v8l4-4h4l-6 6 6 6h-4l-4-4v4H2V2zm14 0h4v20h-4z"/></svg>`,
};

const EVENT_ICONS = {
  subscription: '⭐', superchat: '💰', raid: '⚔️', follow: '💜', cheer: '✨', gift: '🎁',
};

const BADGE_ICONS = {
  moderator: `<span title="Moderador" class="inline-flex items-center justify-center w-4 h-4 rounded bg-green-600 text-white text-xs">⚔</span>`,
  subscriber: `<span title="Inscrito" class="inline-flex items-center justify-center w-4 h-4 rounded bg-violet-600 text-white text-xs">★</span>`,
  member: `<span title="Membro" class="inline-flex items-center justify-center w-4 h-4 rounded bg-red-600 text-white text-xs">★</span>`,
};

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function renderMessage(msg) {
  const p = PLATFORM_COLORS[msg.platform];
  const badges = (msg.badges || []).map(b => BADGE_ICONS[b] || '').join('');
  const isCommand = msg.content.startsWith('!');

  return `
    <div class="flex gap-2 px-3 py-1.5 border-l-2 ${p.border} ${p.bg} transition-colors group ${isCommand ? 'bg-violet-500/5' : ''}">
      <span class="text-gray-600 text-xs mt-0.5 shrink-0 font-mono">${formatTime(msg.ts)}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1 flex-wrap">
          <span class="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${p.badge}">
            ${PLATFORM_ICONS[msg.platform]} ${p.label}
          </span>
          ${badges}
          <span class="font-semibold text-sm ${msg.isMod ? 'text-green-400' : 'text-gray-200'}">${msg.author}</span>
          ${msg.isMod ? '<span class="text-xs text-green-500">MOD</span>' : ''}
        </div>
        <p class="text-sm text-gray-300 mt-0.5 break-words ${isCommand ? 'text-violet-300 font-mono' : ''}">${msg.content}</p>
      </div>
    </div>`;
}

function renderEvent(evt) {
  const p = PLATFORM_COLORS[evt.platform];
  const icon = EVENT_ICONS[evt.type] || '📢';
  const labels = {
    subscription: `<strong>${evt.author}</strong> se inscreveu!`,
    superchat: `<strong>${evt.author}</strong> enviou Super Chat de R$${(evt.amount || 0).toFixed(2)}`,
    raid: `<strong>${evt.author}</strong> fez raid com ${evt.amount || 0} viewers!`,
    follow: `<strong>${evt.author}</strong> começou a seguir`,
    cheer: `<strong>${evt.author}</strong> deu ${evt.amount || 0} bits!`,
    gift: `<strong>${evt.author}</strong> presenteou uma inscrição`,
  };

  return `
    <div class="mx-3 my-1 px-3 py-2 rounded-lg border ${p.border.replace('border-l-', 'border-')} bg-gradient-to-r from-gray-800 to-gray-800/50">
      <div class="flex items-center gap-2">
        <span class="text-lg">${icon}</span>
        <div>
          <p class="text-sm text-gray-200">${labels[evt.type] || evt.type}</p>
          ${evt.message ? `<p class="text-xs text-gray-400 mt-0.5">"${evt.message}"</p>` : ''}
        </div>
        <span class="ml-auto text-xs text-gray-500">${formatTime(evt.ts)}</span>
      </div>
    </div>`;
}

function renderActivityLog(log) {
  const icons = { sound: '🔊', voice: '🗣️', scheduled: '⏰', event: '📢' };
  return `
    <div class="flex items-start gap-2 text-xs py-1 border-b border-gray-800">
      <span>${icons[log.type] || '•'}</span>
      <span class="text-gray-400 shrink-0">${formatTime(log.ts)}</span>
      <span class="text-gray-300">${log.text}</span>
    </div>`;
}

function initChatFeed() {
  const feed = document.getElementById('chat-feed');
  if (!feed) return;

  // Interleave messages and events sorted by timestamp
  const items = [
    ...MOCK_MESSAGES.map(m => ({ ...m, _type: 'msg' })),
    ...MOCK_EVENTS.map(e => ({ ...e, _type: 'evt' })),
  ].sort((a, b) => a.ts - b.ts);

  feed.innerHTML = items.map(item =>
    item._type === 'msg' ? renderMessage(item) : renderEvent(item)
  ).join('');

  feed.scrollTop = feed.scrollHeight;
}

function initActivityLog() {
  const log = document.getElementById('activity-log');
  if (!log) return;
  log.innerHTML = MOCK_ACTIVITY_LOG.map(renderActivityLog).join('');
}

function initObsStats() {
  const s = MOCK_OBS_STATS;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  set('obs-scene', s.scene);
  set('obs-time', s.streamTime);
  set('obs-bitrate', `${(s.bitrate / 1000).toFixed(1)} Mbps`);
  set('obs-fps', `${s.fps} FPS`);
  set('obs-cpu', `${s.cpuUsage.toFixed(1)}%`);
  set('obs-memory', `${(s.memoryUsage / 1024).toFixed(1)} GB`);
  set('obs-dropped', `${s.droppedFrames} (${((s.droppedFrames / s.totalFrames) * 100).toFixed(2)}%)`);
  set('obs-status', s.streaming ? '🔴 AO VIVO' : '⚫ Offline');
}

function initSoundCommands() {
  const tbody = document.getElementById('sounds-table-body');
  if (!tbody) return;
  tbody.innerHTML = MOCK_SOUND_COMMANDS.map(cmd => `
    <tr class="border-b border-gray-800 hover:bg-gray-800/50">
      <td class="px-4 py-3 font-mono text-violet-300">${cmd.trigger}</td>
      <td class="px-4 py-3 text-gray-300 text-sm">${cmd.file}</td>
      <td class="px-4 py-3">
        <div class="flex gap-1 flex-wrap">
          ${cmd.permissions.map(p => `<span class="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">${p}</span>`).join('')}
        </div>
      </td>
      <td class="px-4 py-3 text-gray-400 text-sm">${cmd.cooldown}s</td>
      <td class="px-4 py-3">
        <label class="toggle-switch">
          <input type="checkbox" ${cmd.enabled ? 'checked' : ''} onchange="void 0">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td class="px-4 py-3">
        <div class="flex gap-2">
          <button class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-violet-600 text-gray-300 hover:text-white transition-colors" onclick="void 0">▶ Testar</button>
          <button class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors" onclick="openModal('modal-sound')">✏️</button>
          <button class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white transition-colors">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
}

function initVoiceCommands() {
  const tbody = document.getElementById('voice-table-body');
  if (!tbody) return;
  tbody.innerHTML = MOCK_VOICE_COMMANDS.map(cmd => `
    <tr class="border-b border-gray-800 hover:bg-gray-800/50">
      <td class="px-4 py-3 font-mono text-violet-300">${cmd.trigger}</td>
      <td class="px-4 py-3 text-gray-300 text-sm">${cmd.template || '<span class="text-gray-500 italic">texto livre do chat</span>'}</td>
      <td class="px-4 py-3 text-gray-300 text-sm">${cmd.language}</td>
      <td class="px-4 py-3">
        <div class="flex gap-1 flex-wrap">
          ${cmd.permissions.map(p => `<span class="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">${p}</span>`).join('')}
        </div>
      </td>
      <td class="px-4 py-3 text-gray-400 text-sm">${cmd.cooldown}s</td>
      <td class="px-4 py-3">
        <label class="toggle-switch">
          <input type="checkbox" ${cmd.enabled ? 'checked' : ''} onchange="void 0">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td class="px-4 py-3">
        <div class="flex gap-2">
          <button class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors" onclick="openModal('modal-voice')">✏️</button>
          <button class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white transition-colors">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
}

function initScheduled() {
  const tbody = document.getElementById('scheduled-table-body');
  if (!tbody) return;
  tbody.innerHTML = MOCK_SCHEDULED.map(msg => `
    <tr class="border-b border-gray-800 hover:bg-gray-800/50">
      <td class="px-4 py-3 text-gray-300 text-sm max-w-xs truncate">${msg.message}</td>
      <td class="px-4 py-3 text-gray-400 text-sm">
        ${msg.interval}min ${msg.randomWindow > 0 ? `<span class="text-gray-500 text-xs">(±${msg.randomWindow}min)</span>` : ''}
      </td>
      <td class="px-4 py-3">
        <div class="flex gap-1 flex-wrap">
          ${msg.platforms.map(p => `<span class="text-xs px-2 py-0.5 rounded-full ${PLATFORM_COLORS[p].badge}">${p}</span>`).join('')}
        </div>
      </td>
      <td class="px-4 py-3 text-gray-500 text-xs">${msg.lastSent ? formatTime(msg.lastSent) : '—'}</td>
      <td class="px-4 py-3">
        <label class="toggle-switch">
          <input type="checkbox" ${msg.enabled ? 'checked' : ''} onchange="void 0">
          <span class="toggle-slider"></span>
        </label>
      </td>
      <td class="px-4 py-3">
        <div class="flex gap-2">
          <button class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors" onclick="openModal('modal-scheduled')">✏️</button>
          <button class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white transition-colors">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  initChatFeed();
  initActivityLog();
  initObsStats();
  initSoundCommands();
  initVoiceCommands();
  initScheduled();
});
