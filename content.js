// Content script for lever.co EEO auto-fill
// This script runs on lever.co job posting pages and detects EEO form sections

(function() {
  'use strict';

  // Configuration for EEO field mappings
  // Lever uses various selectors, so we need to handle multiple patterns
  const EEO_FIELD_MAPPINGS = {
    // Gender field selectors
    gender: [
      'input[name="gender"][value=""]',
      'select[name="gender"]',
      'select[data-eeo="gender"]',
      'select[id*="gender"]',
      '[data-test="gender"] select',
      '.eeo-gender select',
      'select.eeo-field[name*="gender"]'
    ],
    // Race/Ethnicity field selectors
    race: [
      'input[name="ethnicity"][value=""]',
      'select[name="ethnicity"]',
      'select[data-eeo="ethnicity"]',
      'select[id*="ethnicity"]',
      'select[id*="race"]',
      '[data-test="ethnicity"] select',
      '.eeo-ethnicity select',
      'select.eeo-field[name*="ethnicity"]'
    ],
    // Veteran status field selectors
    veteran: [
      'input[name="veteran"][value=""]',
      'select[name="veteran"]',
      'select[data-eeo="veteran"]',
      'select[id*="veteran"]',
      '[data-test="veteran"] select',
      '.eeo-veteran select',
      'select.eeo-field[name*="veteran"]'
    ],
    // Disability status field selectors
    disability: [
      'input[name="disability"][value=""]',
      'select[name="disability"]',
      'select[data-eeo="disability"]',
      'select[id*="disability"]',
      '[data-test="disability"] select',
      '.eeo-disability select',
      'select.eeo-field[name*="disability"]'
    ]
  };

  // Value mappings for EEO fields
  const EEO_VALUES = {
    gender: {
      'male': ['male', 'man', 'm'],
      'female': ['female', 'woman', 'f'],
      'non-binary': ['non-binary', 'nonbinary', 'non binary', 'other'],
      '': ['prefer not to say', 'declined', '']
    },
    race: {
      'white': ['white', 'caucasian'],
      'black': ['black', 'african american', 'african-american'],
      'hispanic': ['hispanic', 'latino', 'latina', 'latin'],
      'asian': ['asian', 'asian american'],
      'native': ['american indian', 'alaska native', 'native american'],
      'pacific': ['pacific islander', 'hawaiian', 'native hawaiian'],
      'multiracial': ['multiracial', 'two or more', 'multiple'],
      '': ['prefer not to say', 'declined', '']
    },
    veteran: {
      'not-protected': ['not a protected veteran', 'not protected', 'no', 'none'],
      'protected': ['protected veteran', 'protected'],
      'disabled': ['disabled veteran', 'disabled', 'i identify as disabled']
    },
    disability: {
      'no': ['no', 'no i do not', 'no, i dont'],
      'yes': ['yes', 'yes i have', 'yes, i have'],
      'maybe': ['maybe', 'not sure', 'uncertain']
    }
  };

  let settings = null;
  let isFilled = false;

  // Initialize the content script
  async function init() {
    console.log('Job Autofill: Checking for EEO form on lever.co...');
    
    // Load settings from storage
    await loadSettings();
    
    if (!settings) {
      console.log('Job Autofill: No settings found');
      return;
    }

    // Wait for the page to be fully loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onPageReady);
    } else {
      onPageReady();
    }
  }

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get('autofillSettings');
      settings = result.autofillSettings;
    } catch (error) {
      console.error('Job Autofill: Error loading settings:', error);
    }
  }

  function onPageReady() {
    // Give extra time for dynamic content to load
    setTimeout(() => {
      detectAndFillEEOForm();
    }, 1500);
  }

  // Main function to detect and fill EEO form
  function detectAndFillEEOForm() {
    if (isFilled) return;

    // Look for EEO form sections
    const eeoForm = findEEOForm();
    
    if (eeoForm) {
      console.log('Job Autofill: Found EEO form, attempting to fill...');
      fillEEOForm(eeoForm);
    } else {
      console.log('Job Autofill: No EEO form detected on this page');
      // Check if we're on an application page
      checkForApplicationForm();
    }
  }

  // Find the EEO form on the page
  function findEEOForm() {
    // Look for common EEO section indicators
    const eeoIndicators = [
      'section[data-eeo]',
      '.eeo-section',
      '[class*="eeo"]',
      '[id*="eeo"]',
      'fieldset:contains("EEO")',
      'legend:contains("EEO")',
      'h2:contains("EEO")',
      'h3:contains("EEO")'
    ];

    // Try to find form elements within EEO sections
    const forms = document.querySelectorAll('form');
    
    for (const form of forms) {
      const formText = form.textContent.toLowerCase();
      
      // Check if this form contains EEO-related content
      if (formText.includes('equal employment opportunity') ||
          formText.includes('eeo') ||
          formText.includes('gender') ||
          formText.includes('ethnicity') ||
          formText.includes('veteran') ||
          formText.includes('disability')) {
        return form;
      }
    }

    // Try to find by input names commonly used in EEO forms
    const eeoInputs = document.querySelectorAll('select[name="gender"], select[name="ethnicity"], select[name="veteran"], select[name="disability"]');
    
    if (eeoInputs.length > 0) {
      // Find the parent form
      return eeoInputs[0].closest('form');
    }

    return null;
  }

  // Check if we're on an application form page
  function checkForApplicationForm() {
    // Look for the application form which might have EEO as a later step
    const applicationContainer = document.querySelector('[data-apply]') || 
                                  document.querySelector('.application-form') ||
                                  document.querySelector('#application-form');
    
    if (applicationContainer) {
      // Set up a mutation observer to detect when EEO form appears
      observeForEEOForm();
    }
  }

  // Observe for EEO form appearing dynamically
  function observeForEEOForm() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const text = node.textContent?.toLowerCase() || '';
              if (text.includes('eeo') || text.includes('equal employment')) {
                setTimeout(() => detectAndFillEEOForm(), 500);
                observer.disconnect();
                return;
              }
            }
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Stop observing after 30 seconds
    setTimeout(() => observer.disconnect(), 30000);
  }

  // Fill the EEO form with saved settings
  function fillEEOForm(form) {
    if (!settings || isFilled) return;

    let filledCount = 0;

    // Try to fill gender
    if (settings.gender) {
      if (fillField(form, 'gender', settings.gender)) filledCount++;
    }

    // Try to fill race/ethnicity
    if (settings.race) {
      if (fillField(form, 'ethnicity', settings.race)) filledCount++;
    }

    // Try to fill veteran status
    if (settings.veteran) {
      if (fillField(form, 'veteran', settings.veteran)) filledCount++;
    }

    // Try to fill disability status
    if (settings.disability) {
      if (fillField(form, 'disability', settings.disability)) filledCount++;
    }

    if (filledCount > 0) {
      console.log(`Job Autofill: Filled ${filledCount} EEO fields`);
      isFilled = true;
      
      // Show a notification that EEO was filled
      showNotification();
    }
  }

  // Fill a specific field type
  function fillField(form, fieldType, value) {
    const selectors = EEO_FIELD_MAPPINGS[fieldType] || [];
    
    for (const selector of selectors) {
      const field = form.querySelector(selector);
      
      if (field) {
        console.log(`Job Autofill: Found ${fieldType} field:`, field);
        
        // Try to find matching option
        if (fillSelectField(field, value)) {
          return true;
        }
      }
    }

    // If specific selectors didn't work, try to find by name
    const fieldsByName = form.querySelectorAll(`select[name="${fieldType}"], select[name*="${fieldType}"]`);
    for (const field of fieldsByName) {
      if (fillSelectField(field, value)) {
        return true;
      }
    }

    return false;
  }

  // Fill a select field by finding the matching option
  function fillSelectField(selectElement, value) {
    if (!selectElement) return false;

    const options = selectElement.querySelectorAll('option');
    const valueMap = EEO_VALUES[getFieldKey(value)] || {};
    
    // First try exact match
    for (const option of options) {
      const optionValue = option.value.toLowerCase().trim();
      const optionText = option.textContent.toLowerCase().trim();
      
      // Check if this option matches our value
      if (optionValue === value || optionText.includes(value.toLowerCase())) {
        selectElement.value = option.value;
        triggerChangeEvent(selectElement);
        console.log(`Job Autofill: Filled with value: ${option.value}`);
        return true;
      }
      
      // Check if value matches the option text (for "prefer not to say" cases)
      const mapping = valueMap[value];
      if (mapping) {
        for (const mapValue of mapping) {
          if (optionText.includes(mapValue) || optionValue.includes(mapValue)) {
            selectElement.value = option.value;
            triggerChangeEvent(selectElement);
            console.log(`Job Autofill: Filled with mapped value: ${option.value}`);
            return true;
          }
        }
      }
    }

    // Try to find a "prefer not to say" option if no specific value
    if (!value || value === '') {
      for (const option of options) {
        const optionText = option.textContent.toLowerCase();
        if (optionText.includes('prefer not to say') || 
            optionText.includes('declined') ||
            optionText.includes('do not wish')) {
          selectElement.value = option.value;
          triggerChangeEvent(selectElement);
          console.log(`Job Autofill: Filled with default: ${option.value}`);
          return true;
        }
      }
    }

    return false;
  }

  // Get the key for value mapping
  function getFieldKey(value) {
    // Map form values to mapping keys
    const keyMap = {
      'male': 'male',
      'female': 'female',
      'non-binary': 'non-binary',
      'white': 'white',
      'black': 'black',
      'hispanic': 'hispanic',
      'asian': 'asian',
      'native': 'native',
      'pacific': 'pacific',
      'multiracial': 'multiracial',
      'not-protected': 'not-protected',
      'protected': 'protected',
      'disabled': 'disabled',
      'no': 'no',
      'yes': 'yes',
      'maybe': 'maybe'
    };
    return keyMap[value] || '';
  }

  // Trigger change event for React/Angular form handling
  function triggerChangeEvent(element) {
    const event = new Event('change', { bubbles: true });
    element.dispatchEvent(event);
    
    // Also dispatch input event for some frameworks
    const inputEvent = new Event('input', { bubbles: true });
    element.dispatchEvent(inputEvent);
  }

  // Show notification that EEO was filled
  function showNotification() {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4a90d9;
      color: white;
      padding: 15px 20px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = '✓ EEO Form Auto-filled!';
    
    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Listen for messages from popup (to manually trigger fill)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'fillEEO') {
      loadSettings().then(() => {
        detectAndFillEEOForm();
        sendResponse({ success: true });
      });
      return true;
    }
  });

  // Initialize when script loads
  init();
})();