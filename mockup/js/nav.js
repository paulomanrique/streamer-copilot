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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  showSection('dashboard');
  showSettingsSection('settings-platforms');
  buildActivityFilterList();
});
