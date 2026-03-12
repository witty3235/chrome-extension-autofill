// Popup script for handling settings save/load
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('settingsForm');
  const status = document.getElementById('status');
  const clearBtn = document.getElementById('clearBtn');

  // Load saved settings on page load
  loadSettings();

  // Handle form submission
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveSettings();
  });

  // Handle clear button
  clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all saved settings?')) {
      clearSettings();
    }
  });

  // Save settings to chrome storage
  async function saveSettings() {
    const formData = new FormData(form);
    const settings = {};

    for (const [key, value] of formData.entries()) {
      settings[key] = value;
    }

    // Get unchecked checkboxes (if any added in future)
    const checkboxes = form.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      settings[checkbox.name] = checkbox.checked;
    });

    try {
      await chrome.storage.local.set({ autofillSettings: settings });
      showStatus('Settings saved successfully!', 'success');
    } catch (error) {
      showStatus('Error saving settings: ' + error.message, 'error');
    }
  }

  // Load settings from chrome storage
  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get('autofillSettings');
      const settings = result.autofillSettings;

      if (settings) {
        for (const [key, value] of Object.entries(settings)) {
          const field = form.querySelector(`[name="${key}"]`);
          if (field) {
            if (field.type === 'checkbox') {
              field.checked = value;
            } else {
              field.value = value || '';
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  // Clear all settings
  async function clearSettings() {
    try {
      await chrome.storage.local.remove('autofillSettings');
      form.reset();
      showStatus('Settings cleared!', 'success');
    } catch (error) {
      showStatus('Error clearing settings: ' + error.message, 'error');
    }
  }

  // Show status message
  function showStatus(message, type) {
    status.textContent = message;
    status.className = 'status ' + type;

    setTimeout(() => {
      status.className = 'status';
    }, 3000);
  }
});