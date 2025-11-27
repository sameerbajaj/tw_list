// Settings presets
const PRESETS = {
  conservative: {
    name: 'Conservative',
    requestDelay: 500,
    maxLookupsPerPeriod: 10,
    lookupPeriod: 10 * 60 * 1000 // 10 minutes
  },
  balanced: {
    name: 'Balanced',
    requestDelay: 300,
    maxLookupsPerPeriod: 20,
    lookupPeriod: 5 * 60 * 1000 // 5 minutes
  },
  aggressive: {
    name: 'Aggressive',
    requestDelay: 200,
    maxLookupsPerPeriod: 30,
    lookupPeriod: 5 * 60 * 1000 // 5 minutes
  }
};

const DEFAULT_PRESET = 'balanced';

// Load current settings
function loadSettings() {
  const settings = localStorage.getItem('tw_list_settings');
  if (settings) {
    return JSON.parse(settings);
  }
  return {
    preset: DEFAULT_PRESET,
    ...PRESETS[DEFAULT_PRESET],
    skipMembershipCheck: false // Default: always check memberships
  };
}

// Save settings
function saveSettings(preset, skipMembershipCheck) {
  const settings = {
    preset,
    ...PRESETS[preset],
    skipMembershipCheck
  };
  localStorage.setItem('tw_list_settings', JSON.stringify(settings));
  return settings;
}

// Update UI
function updateUI() {
  const settings = loadSettings();

  // Update selected preset
  document.querySelectorAll('.preset').forEach(el => {
    el.classList.remove('selected');
    if (el.dataset.preset === settings.preset) {
      el.classList.add('selected');
    }
  });

  // Update skip membership checkbox
  document.getElementById('skip-membership-check').checked = settings.skipMembershipCheck || false;

  // Update status
  const cache = localStorage.getItem('tw_list_memberships');
  const cachedUsers = cache ? Object.keys(JSON.parse(cache).data || {}).length : 0;

  const statusEl = document.getElementById('current-status');
  statusEl.innerHTML = `
    <strong>Active:</strong> ${PRESETS[settings.preset].name}<br>
    <strong>Cached users:</strong> ${cachedUsers}<br>
    <strong>Request delay:</strong> ${settings.requestDelay}ms<br>
    <strong>Rate limit:</strong> ${settings.maxLookupsPerPeriod} users per ${settings.lookupPeriod / 60000} min<br>
    <strong>Check memberships:</strong> ${settings.skipMembershipCheck ? 'No (quick mode)' : 'Yes'}
  `;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  updateUI();

  // Preset selection
  document.querySelectorAll('.preset').forEach(preset => {
    preset.addEventListener('click', () => {
      const presetName = preset.dataset.preset;
      document.querySelectorAll('.preset').forEach(p => p.classList.remove('selected'));
      preset.classList.add('selected');
    });
  });

  // Save button
  document.getElementById('save').addEventListener('click', () => {
    const selected = document.querySelector('.preset.selected');
    if (selected) {
      const preset = selected.dataset.preset;
      const skipMembershipCheck = document.getElementById('skip-membership-check').checked;
      saveSettings(preset, skipMembershipCheck);

      // Show feedback
      const btn = document.getElementById('save');
      const originalText = btn.textContent;
      btn.textContent = '✓ Saved!';
      setTimeout(() => {
        btn.textContent = originalText;
        window.close();
      }, 1000);
    }
  });

  // Clear cache button
  document.getElementById('clear-cache').addEventListener('click', () => {
    if (confirm('Clear all cached list memberships? This will not affect your lists on Twitter.')) {
      localStorage.removeItem('tw_list_memberships');
      localStorage.removeItem('tw_list_activity');

      const btn = document.getElementById('clear-cache');
      const originalText = btn.textContent;
      btn.textContent = '✓ Cleared!';
      setTimeout(() => {
        btn.textContent = originalText;
        updateUI();
      }, 1000);
    }
  });
});
