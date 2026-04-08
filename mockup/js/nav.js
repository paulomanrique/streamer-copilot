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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  showSection('dashboard');
  showSettingsSection('settings-platforms');
});
