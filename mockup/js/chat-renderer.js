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

// Activity log filter state — all enabled by default
const activityFilter = {
  follow:       true,
  subscription: true,
  gift:         true,
  superchat:    true,
  cheer:        true,
  raid:         true,
  sound:        true,
  scheduled:    true,
};

const ACTIVITY_CONFIG = {
  follow:       { icon: '💜', label: 'Novo seguidor',        color: 'text-pink-400' },
  subscription: { icon: '⭐', label: 'Inscrição / Membro',   color: 'text-yellow-400' },
  gift:         { icon: '🎁', label: 'Inscrição presenteada', color: 'text-orange-400' },
  superchat:    { icon: '💰', label: 'Super Chat / Bits',     color: 'text-green-400' },
  cheer:        { icon: '✨', label: 'Bits (Twitch)',          color: 'text-purple-400' },
  raid:         { icon: '⚔️', label: 'Raid / Invasão',        color: 'text-red-400' },
  sound:        { icon: '🔊', label: 'Comando de som',        color: 'text-violet-400' },
  scheduled:    { icon: '⏰', label: 'Mensagem agendada',     color: 'text-cyan-400' },
};

const BADGE_ICONS = {
  moderator: `<span title="Moderador" class="inline-flex items-center justify-center w-4 h-4 rounded bg-green-600 text-white text-xs">⚔</span>`,
  subscriber: `<span title="Inscrito" class="inline-flex items-center justify-center w-4 h-4 rounded bg-violet-600 text-white text-xs">★</span>`,
  member: `<span title="Membro" class="inline-flex items-center justify-center w-4 h-4 rounded bg-red-600 text-white text-xs">★</span>`,
};

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Platform visibility filter state
const platformFilter = { twitch: true, youtube: true, kick: true };

function applyPlatformFilter() {
  document.querySelectorAll('#chat-feed [data-platform]').forEach(el => {
    const platform = el.dataset.platform;
    el.style.display = platformFilter[platform] === false ? 'none' : '';
  });
}

function togglePlatformFilter(platform) {
  platformFilter[platform] = !platformFilter[platform];
  applyPlatformFilter();

  // Update button appearance
  const btn = document.querySelector(`[data-platform-filter="${platform}"]`);
  if (!btn) return;
  const p = PLATFORM_COLORS[platform];
  if (platformFilter[platform]) {
    btn.className = btn.className.replace('grayscale opacity-40', '');
    btn.classList.add(...p.badge.split(' '), 'hover:opacity-90');
  } else {
    btn.classList.remove(...p.badge.split(' '), 'hover:opacity-90');
    btn.classList.add('grayscale', 'opacity-40');
  }
}

function renderMessage(msg) {
  const p = PLATFORM_COLORS[msg.platform];
  const badges = (msg.badges || []).map(b => BADGE_ICONS[b] || '').join('');
  const isCommand = msg.content.startsWith('!');

  return `
    <div class="chat-message flex gap-2 px-3 py-1.5 border-l-2 ${p.border} ${p.bg} transition-colors group cursor-default select-text ${isCommand ? 'bg-violet-500/5' : ''}"
      data-platform="${msg.platform}" data-author="${msg.author}">
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

function buildActivityText(log) {
  const p = log.platform ? PLATFORM_COLORS[log.platform] : null;
  const pLabel = p ? `<span class="inline-flex items-center gap-0.5 ${p.badge} px-1 rounded text-[10px]">${PLATFORM_ICONS[log.platform]}${p.label}</span> ` : '';

  switch (log.type) {
    case 'follow':       return `${pLabel}<strong class="text-gray-200">${log.author}</strong> começou a seguir`;
    case 'subscription': return `${pLabel}<strong class="text-gray-200">${log.author}</strong> se inscreveu${log.message ? ` — "${log.message}"` : ''}`;
    case 'gift':         return `${pLabel}<strong class="text-gray-200">${log.author}</strong> presenteou ${log.amount || 1} inscrição(ões)`;
    case 'superchat':    return `${pLabel}<strong class="text-gray-200">${log.author}</strong> enviou R$${(log.amount||0).toFixed(2)}${log.message ? ` — "${log.message}"` : ''}`;
    case 'cheer':        return `${pLabel}<strong class="text-gray-200">${log.author}</strong> deu ${log.amount || 0} bits`;
    case 'raid':         return `${pLabel}<strong class="text-gray-200">${log.author}</strong> fez raid com ${log.amount || 0} viewers`;
    case 'sound':        return `${pLabel}Comando <span class="font-mono text-violet-300">${log.trigger}</span> por <strong class="text-gray-200">${log.author}</strong>`;
    case 'scheduled':    return `<span class="text-gray-400 italic truncate">"${log.message}"</span>`;
    default:             return log.text || log.type;
  }
}

function renderActivityLog(log) {
  const cfg = ACTIVITY_CONFIG[log.type] || { icon: '•', color: 'text-gray-400' };
  return `
    <div class="flex items-start gap-2 text-xs py-1.5 border-b border-gray-800/60 last:border-0">
      <span class="shrink-0 mt-0.5">${cfg.icon}</span>
      <span class="text-gray-600 shrink-0 font-mono">${formatTime(log.ts)}</span>
      <span class="${cfg.color} leading-relaxed min-w-0">${buildActivityText(log)}</span>
    </div>`;
}

function applyActivityFilter() {
  const log = document.getElementById('activity-log');
  if (!log) return;
  const filtered = MOCK_ACTIVITY_LOG.filter(item => activityFilter[item.type] !== false);
  log.innerHTML = filtered.length
    ? filtered.map(renderActivityLog).join('')
    : '<p class="text-gray-600 text-xs text-center py-4">Nenhum tipo de evento habilitado.</p>';
}

function toggleActivityFilter(type, enabled) {
  activityFilter[type] = enabled;
  applyActivityFilter();
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
  applyActivityFilter();
}

function initObsStats() {
  const s = MOCK_OBS_STATS;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setStyle = (id, prop, val) => { const el = document.getElementById(id); if (el) el.style[prop] = val; };
  const setClass = (id, cls) => { const el = document.getElementById(id); if (el) { el.className = el.className.replace(/text-\w+-400/g, ''); el.classList.add(cls); } };

  set('obs-scene', s.scene);
  set('obs-time', s.streamTime);
  set('obs-cpu', `${s.cpuUsage.toFixed(1)}%`);
  set('obs-memory', `${(s.memoryUsage / 1024).toFixed(1)} GB`);
  set('obs-status', s.streaming ? '🔴 AO VIVO' : '⚫ Offline');

  // Connection quality (based on network-dropped frames)
  const connPct = s.outputTotalFrames > 0
    ? ((1 - s.outputSkippedFrames / s.outputTotalFrames) * 100)
    : 100;
  const connColor = connPct >= 95 ? 'green' : connPct >= 80 ? 'yellow' : 'red';
  const connLabel = connPct >= 95 ? '● Boa' : connPct >= 80 ? '● Regular' : '● Ruim';
  set('obs-conn-pct', `${connPct.toFixed(1)}%`);
  set('obs-conn-quality', connLabel);
  setStyle('obs-conn-bar', 'width', `${connPct.toFixed(1)}%`);
  setStyle('obs-conn-bar', 'background', connColor === 'green' ? '#22c55e' : connColor === 'yellow' ? '#eab308' : '#ef4444');
  const qualityEl = document.getElementById('obs-conn-quality');
  if (qualityEl) qualityEl.className = `text-xs font-semibold text-${connColor}-400`;

  // Dropped frames by category
  const fmtDropped = (skipped, total) => {
    if (total === 0) return '0';
    const pct = ((skipped / total) * 100).toFixed(2);
    return `${skipped} <span class="text-gray-600 text-[10px]">(${pct}%)</span>`;
  };
  const droppedNetEl  = document.getElementById('obs-dropped-net');
  const droppedEncEl  = document.getElementById('obs-dropped-enc');
  const droppedRendEl = document.getElementById('obs-dropped-render');
  if (droppedNetEl)  droppedNetEl.innerHTML  = fmtDropped(s.outputSkippedFrames,  s.outputTotalFrames);
  if (droppedEncEl)  droppedEncEl.innerHTML  = fmtDropped(s.encoderSkippedFrames, s.encoderTotalFrames);
  if (droppedRendEl) droppedRendEl.innerHTML = fmtDropped(s.renderSkippedFrames,  s.renderTotalFrames);
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
