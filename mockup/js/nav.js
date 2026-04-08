// Navigation between main sections (Dashboard / Settings)
// and settings sub-sections

function showSection(sectionId) {
  document.querySelectorAll('.main-section').forEach(el => el.classList.add('hidden'));
  const target = document.getElementById(sectionId);
  if (target) target.classList.remove('hidden');

  // Update nav active state
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.remove('bg-violet-600', 'text-white');
    el.classList.add('text-gray-400', 'hover:text-white');
  });
  const activeNav = document.querySelector(`[data-nav="${sectionId}"]`);
  if (activeNav) {
    activeNav.classList.add('bg-violet-600', 'text-white');
    activeNav.classList.remove('text-gray-400', 'hover:text-white');
  }
}

function showSettingsSection(subId) {
  document.querySelectorAll('.settings-section').forEach(el => el.classList.add('hidden'));
  const target = document.getElementById(subId);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('[data-settings-nav]').forEach(el => {
    el.classList.remove('bg-violet-600/20', 'text-violet-400', 'border-l-2', 'border-violet-500');
    el.classList.add('text-gray-400');
  });
  const activeNav = document.querySelector(`[data-settings-nav="${subId}"]`);
  if (activeNav) {
    activeNav.classList.add('bg-violet-600/20', 'text-violet-400', 'border-l-2', 'border-violet-500');
    activeNav.classList.remove('text-gray-400');
  }
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('hidden');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('hidden');
}

// ===================== CONTEXT MENU =====================

const CONTEXT_MENU_ACTIONS = {
  twitch: [
    { id: 'vip',       label: 'Adicionar VIP' },
    { id: 'unvip',     label: 'Remover VIP' },
    { id: 'sep1',      separator: true },
    { id: 'mod',       label: 'Adicionar Moderador' },
    { id: 'unmod',     label: 'Remover Moderador' },
    { id: 'sep2',      separator: true },
    { id: 'to1',       label: 'Timeout — 1 minuto' },
    { id: 'to10',      label: 'Timeout — 10 minutos' },
    { id: 'to60',      label: 'Timeout — 1 hora' },
    { id: 'to1440',    label: 'Timeout — 24 horas' },
    { id: 'sep3',      separator: true },
    { id: 'ban',       label: 'Banir usuário', danger: true },
  ],
  youtube: [
    { id: 'hide',      label: 'Ocultar usuário no canal' },
    { id: 'block',     label: 'Bloquear usuário', danger: true },
    { id: 'sep1',      separator: true },
    { id: 'report',    label: 'Reportar mensagem', danger: true },
  ],
  kick: [
    { id: 'mute',      label: 'Silenciar usuário' },
    { id: 'sep1',      separator: true },
    { id: 'to5',       label: 'Timeout — 5 minutos' },
    { id: 'to30',      label: 'Timeout — 30 minutos' },
    { id: 'sep2',      separator: true },
    { id: 'ban',       label: 'Banir usuário', danger: true },
  ],
};

function showContextMenu(x, y, platform, author) {
  let menu = document.getElementById('chat-context-menu');
  if (!menu) return;

  const platformActions = CONTEXT_MENU_ACTIONS[platform] || [];

  menu.innerHTML = `
    <div class="px-3 py-1.5 border-b border-gray-700 mb-1">
      <span class="text-xs text-gray-500">@${author}</span>
    </div>
    <button class="context-menu-item w-full text-left px-3 py-1.5 text-sm hover:bg-violet-600/30 text-gray-200 flex items-center gap-2"
      onclick="replyToUser('${platform}', '${author}'); hideContextMenu()">
      <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
      Responder
    </button>
    <div class="border-t border-gray-700 my-1"></div>
    ${platformActions.map(a => a.separator
      ? '<div class="border-t border-gray-700/60 my-1"></div>'
      : `<button class="context-menu-item w-full text-left px-3 py-1.5 text-sm hover:bg-gray-700 ${a.danger ? 'text-red-400 hover:bg-red-600/20' : 'text-gray-300'} flex items-center gap-2"
          onclick="hideContextMenu(); void 0">
          ${a.label}
        </button>`
    ).join('')}`;

  // Position
  menu.style.left = `${x}px`;
  menu.style.top  = `${y}px`;
  menu.classList.remove('hidden');

  // Clamp to viewport
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right  > window.innerWidth)  menu.style.left = `${x - rect.width}px`;
    if (rect.bottom > window.innerHeight) menu.style.top  = `${y - rect.height}px`;
  });
}

function hideContextMenu() {
  const menu = document.getElementById('chat-context-menu');
  if (menu) menu.classList.add('hidden');
}

// ===================== REPLY =====================

function replyToUser(platform, author) {
  // Switch platform dropdown
  const select = document.querySelector('select[data-chat-platform]');
  if (select) {
    const opt = Array.from(select.options).find(o => o.value === platform);
    if (opt) select.value = platform;
  }
  // Pre-fill input
  const input = document.getElementById('chat-input');
  if (input) {
    input.value = `@${author} `;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

// Close modals on backdrop click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.closest('[id]').classList.add('hidden');
  }
});

// Close activity filter panel on outside click
document.addEventListener('click', (e) => {
  const panel = document.getElementById('activity-filter-panel');
  const btn   = document.getElementById('activity-filter-btn');
  if (panel && !panel.classList.contains('hidden') && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
    panel.classList.add('hidden');
  }
});

function toggleActivityFilterPanel() {
  document.getElementById('activity-filter-panel').classList.toggle('hidden');
}

function buildActivityFilterList() {
  const list = document.getElementById('activity-filter-list');
  if (!list || typeof ACTIVITY_CONFIG === 'undefined') return;
  list.innerHTML = Object.entries(ACTIVITY_CONFIG).map(([type, cfg]) => `
    <label class="flex items-center gap-2 cursor-pointer py-0.5 group">
      <input type="checkbox" checked
        class="accent-violet-500 cursor-pointer"
        onchange="toggleActivityFilter('${type}', this.checked)"
        id="filter-${type}">
      <span class="text-sm">${cfg.icon}</span>
      <span class="text-xs text-gray-300 group-hover:text-white transition-colors">${cfg.label}</span>
    </label>`).join('');
}

function setAllActivityFilters(enabled) {
  Object.keys(ACTIVITY_CONFIG).forEach(type => {
    const cb = document.getElementById(`filter-${type}`);
    if (cb) cb.checked = enabled;
    toggleActivityFilter(type, enabled);
  });
}

// ===================== CHAT EVENTS (delegation) =====================

function initChatEvents() {
  const feed = document.getElementById('chat-feed');
  if (!feed) return;

  // Double-click → reply
  feed.addEventListener('dblclick', (e) => {
    const msg = e.target.closest('.chat-message');
    if (!msg) return;
    replyToUser(msg.dataset.platform, msg.dataset.author);
  });

  // Right-click → context menu
  feed.addEventListener('contextmenu', (e) => {
    const msg = e.target.closest('.chat-message');
    if (!msg) return;
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, msg.dataset.platform, msg.dataset.author);
  });
}

// Close context menu on outside click or Escape
document.addEventListener('click', (e) => {
  if (!e.target.closest('#chat-context-menu')) hideContextMenu();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideContextMenu();
});

// Enter to send chat message
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement?.id === 'chat-input') {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    if (input && input.value.trim()) {
      // Mock send — just clear the field
      input.value = '';
    }
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  showSection('dashboard');
  showSettingsSection('settings-platforms');
  buildActivityFilterList();
  initChatEvents();
});
