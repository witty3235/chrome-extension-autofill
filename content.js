// Content script for job application auto-fill
// Supports multiple job posting websites with extensible architecture

(function() {
  'use strict';

  // ============================================================================
  // Website Handlers Registry
  // ============================================================================
  // Add new website handlers here following the pattern below

  const websiteHandlers = {
    // ---------------------------------------------------------------------
    // Lever.co Handler
    // ---------------------------------------------------------------------
    'lever.co': {
      name: 'Lever',
      detectForm: function() {
        const pageText = document.body.textContent.toLowerCase();
        
        // Check if this is an application page
        const isApplicationPage = window.location.href.includes('/apply') ||
                                   document.querySelector('form[data-application]') ||
                                   document.querySelector('.application-form');
        
        if (!isApplicationPage) return null;
        
        // Look for forms
        const forms = document.querySelectorAll('form');
        for (const form of forms) {
          const formText = form.textContent.toLowerCase();
          if (formText.includes('equal employment') || 
              formText.includes('eeo') ||
              formText.includes('gender') ||
              formText.includes('ethnicity')) {
            return form;
          }
        }
        
        // If no EEO found yet, return the main form anyway - we'll scan it later
        const mainForm = document.querySelector('form');
        return mainForm;
      },
      
      // EEO field configurations for Lever
      eeoFields: {
        gender: {
          names: ['eeo[gender]'],
          labelPatterns: ['gender', 'gender identity'],
          selectors: ['select[name*="gender"]', 'input[name*="gender"]']
        },
        race: {
          names: ['eeo[race]'],
          labelPatterns: ['ethnicity', 'race', 'racial'],
          selectors: ['select[name*="ethnicity"]', 'select[name*="race"]', 'input[name*="ethnicity"]']
        },
        veteran: {
          names: ['eeo[veteran]'],
          labelPatterns: ['veteran', 'veteran status'],
          selectors: ['select[name*="veteran"]', 'input[name*="veteran"]']
        },
        disability: {
          names: ['eeo[disability]'],
          labelPatterns: ['disability', 'disabled', 'handicap'],
          selectors: ['select[name*="disability"]', 'input[name*="disability"]']
        }
      },
      
      // Value mapping for Lever-specific options
      valueMapping: {
        gender: {
          'male': ['male', 'man'],
          'female': ['female', 'woman'],
          'non-binary': ['non-binary', 'nonbinary', 'genderqueer'],
          '': ['prefer not to say', 'declined', 'not disclosed']
        },
        race: {
          'white': ['white', 'caucasian'],
          'black': ['black', 'african american'],
          'hispanic': ['hispanic', 'latino', 'latina'],
          'asian': ['asian'],
          'native': ['american indian', 'alaska native'],
          'pacific': ['pacific islander', 'hawaiian'],
          'multiracial': ['multiracial', 'two or more', 'multiple'],
          '': ['prefer not to say', 'declined', 'not disclosed']
        },
        veteran: {
          'not-protected': ['not a protected veteran', 'not protected', 'not a veteran'],
          'protected': ['protected veteran'],
          'disabled': ['disabled veteran', 'disabled']
        },
        disability: {
          'no': ['no', 'no i do not'],
          'yes': ['yes', 'i have a disability'],
          'maybe': ['maybe', 'not sure']
        }
      }
    },

    // ---------------------------------------------------------------------
    // Workday Handler (for companies using Workday)
    // ---------------------------------------------------------------------
    'workday.com': {
      name: 'Workday',
      detectForm: function() {
        // Workday uses specific form structures
        const isApplicationPage = document.querySelector('[data-automationid*="Application"]');
        if (!isApplicationPage) return null;
        
        return document.querySelector('form');
      },
      
      eeoFields: {
        gender: {
          names: ['gender', 'Gender'],
          labelPatterns: ['gender'],
          selectors: ['select[data-automationid*="gender"]']
        },
        race: {
          names: ['ethnicity', 'Race'],
          labelPatterns: ['ethnicity', 'race'],
          selectors: ['select[data-automationid*="ethnicity"]']
        },
        veteran: {
          names: ['veteranStatus', 'VeteranStatus'],
          labelPatterns: ['veteran'],
          selectors: ['select[data-automationid*="veteran"]']
        },
        disability: {
          names: ['disabilityStatus', 'DisabilityStatus'],
          labelPatterns: ['disability'],
          selectors: ['select[data-automationid*="disability"]']
        }
      },
      
      valueMapping: {
        gender: { 'male': ['Male'], 'female': ['Female'], '': ['Prefer not to'] },
        race: { 'white': ['White'], 'black': ['Black'], 'hispanic': ['Hispanic'], '': ['Prefer not to'] },
        veteran: { 'not-protected': ['I am not a protected veteran'], 'protected': ['Protected veteran'], 'disabled': ['Disabled veteran'] },
        disability: { 'no': ['No'], 'yes': ['Yes'], 'maybe': ['Maybe'] }
      }
    }
  };

  // ============================================================================
  // Base EEO Auto-fill Logic
  // ============================================================================

  // Value mapping for default fallback
  const DEFAULT_VALUE_MAPPINGS = {
    gender: {
      'male': ['male', 'man'],
      'female': ['female', 'woman'],
      'non-binary': ['non-binary', 'nonbinary'],
      '': ['prefer not to say', 'declined', 'not disclosed']
    },
    race: {
      'white': ['white', 'caucasian'],
      'black': ['black', 'african american'],
      'hispanic': ['hispanic', 'latino'],
      'asian': ['asian'],
      'native': ['american indian'],
      'pacific': ['pacific islander'],
      'multiracial': ['multiracial', 'two or more'],
      '': ['prefer not to say', 'declined']
    },
    veteran: {
      'not-protected': ['not protected', 'not a protected'],
      'protected': ['protected'],
      'disabled': ['disabled']
    },
    disability: {
      'no': ['no', 'do not have'],
      'yes': ['yes', 'have a'],
      'maybe': ['maybe', 'not sure']
    }
  };

  // Settings key mapping
  const SETTING_KEY_MAP = {
    'male': 'gender', 'female': 'gender', 'non-binary': 'gender',
    'white': 'race', 'black': 'race', 'hispanic': 'race',
    'asian': 'race', 'native': 'race', 'pacific': 'race', 'multiracial': 'race',
    'not-protected': 'veteran', 'protected': 'veteran', 'disabled': 'veteran',
    'no': 'disability', 'yes': 'disability', 'maybe': 'disability'
  };

  let settings = null;
  let isFilled = false;
  let currentHandler = null;

  // ============================================================================
  // Initialization
  // ============================================================================

  async function init() {
    console.log('Job Autofill: Starting...');
    
    // Detect which website handler to use
    currentHandler = detectWebsiteHandler();
    
    if (!currentHandler) {
      console.log('Job Autofill: No matching handler found for this website');
      return;
    }
    
    console.log(`Job Autofill: Using handler for ${currentHandler.name}`);
    
    // Load settings
    await loadSettings();
    
    if (!settings) {
      console.log('Job Autofill: No settings found');
      return;
    }

    // Start form detection
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onPageReady);
    } else {
      onPageReady();
    }
  }

  function detectWebsiteHandler() {
    const hostname = window.location.hostname.toLowerCase();
    
    for (const [domain, handler] of Object.entries(websiteHandlers)) {
      if (hostname.includes(domain.replace('.', ''))) {
        return handler;
      }
      
      // Also check for partial matches (e.g., jobs.lever.co -> lever.co)
      if (hostname.includes(domain) || hostname.endsWith('.' + domain)) {
        return handler;
      }
    }
    
    // Default to generic handler if no specific one found
    return null;
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
    // Initial scan after page loads
    setTimeout(() => detectAndFillForm(), 1000);
    
    // Also observe for dynamic content
    observeForForm();
  }

  // ============================================================================
  // Form Detection & Filling
  // ============================================================================

  function detectAndFillForm() {
    if (isFilled || !currentHandler) return;

    const form = currentHandler.detectForm();
    
    if (form) {
      console.log('Job Autofill: Found form, attempting to fill...');
      fillForm(form);
    } else {
      console.log('Job Autofill: No form detected');
    }
  }

  function fillForm(form) {
    if (!settings || isFilled) return;

    let filledCount = 0;
    const fieldConfigs = currentHandler.eeoFields;
    
    // Fill each EEO field type
    if (settings.gender && fieldConfigs.gender) {
      if (fillField(form, fieldConfigs.gender, settings.gender)) {
        console.log('Job Autofill: Filled gender');
        filledCount++;
      }
    }
    
    if (settings.race && fieldConfigs.race) {
      if (fillField(form, fieldConfigs.race, settings.race)) {
        console.log('Job Autofill: Filled race/ethnicity');
        filledCount++;
      }
    }
    
    if (settings.veteran && fieldConfigs.veteran) {
      if (fillField(form, fieldConfigs.veteran, settings.veteran)) {
        console.log('Job Autofill: Filled veteran status');
        filledCount++;
      }
    }
    
    if (settings.disability && fieldConfigs.disability) {
      if (fillField(form, fieldConfigs.disability, settings.disability)) {
        console.log('Job Autofill: Filled disability status');
        filledCount++;
      }
    }

    if (filledCount > 0) {
      console.log(`Job Autofill: Filled ${filledCount} EEO fields`);
      isFilled = true;
      showNotification(`✓ Auto-filled ${filledCount} EEO field(s) for ${currentHandler.name}!`);
    }
  }

  function fillField(form, config, value) {
    // Try by name attributes
    for (const name of config.names) {
      // Try select
      let field = form.querySelector(`select[name="${name}"], select[name*="${name}"]`);
      if (field && fillSelectField(field, value)) return true;
      
      // Try input
      field = form.querySelector(`input[name="${name}"], input[name*="${name}"]`);
      if (field && fillInputField(field, value)) return true;
    }
    
    // Try by explicit selectors
    for (const selector of config.selectors) {
      const field = form.querySelector(selector);
      if (field) {
        if (field.tagName === 'SELECT') {
          if (fillSelectField(field, value)) return true;
        } else {
          if (fillInputField(field, value)) return true;
        }
      }
    }
    
    // Try by label association
    const labelField = findFieldByLabel(form, config.labelPatterns);
    if (labelField) {
      if (labelField.tagName === 'SELECT') {
        return fillSelectField(labelField, value);
      } else if (labelField.type === 'radio') {
        return fillRadioGroup(form.querySelectorAll(`input[name="${labelField.name}"]`), value);
      }
    }
    
    return false;
  }

  function findFieldByLabel(form, labelPatterns) {
    const labels = form.querySelectorAll('label, [class*="label"], [class*="Label"]');
    
    for (const label of labels) {
      const labelText = label.textContent.toLowerCase();
      
      for (const pattern of labelPatterns) {
        if (labelText.includes(pattern)) {
          // Check for associated input
          const forAttr = label.getAttribute('for');
          if (forAttr) {
            const field = form.querySelector(`#${forAttr}`);
            if (field) return field;
          }
          
          // Check nested input
          const nested = label.querySelector('input, select');
          if (nested) return nested;
          
          // Check sibling
          const sibling = label.nextElementSibling;
          if (sibling && (sibling.tagName === 'INPUT' || sibling.tagName === 'SELECT')) {
            return sibling;
          }
        }
      }
    }
    
    return null;
  }

  function fillSelectField(selectElement, value) {
    if (!selectElement) return false;
    
    const options = selectElement.querySelectorAll('option');
    const valueMap = currentHandler?.valueMapping || DEFAULT_VALUE_MAPPINGS;
    const key = SETTING_KEY_MAP[value] || '';
    const mappings = valueMap[key]?.[value] || valueMap[key] || [];
    
    for (const option of options) {
      const optionText = option.textContent.toLowerCase().trim();
      const optionValue = option.value.toLowerCase().trim();
      
      // Exact value match
      if (optionValue === value) {
        selectElement.value = option.value;
        triggerChangeEvent(selectElement);
        return true;
      }
      
      // Text match via mapping
      for (const mapValue of mappings) {
        if (optionText.includes(mapValue)) {
          selectElement.value = option.value;
          triggerChangeEvent(selectElement);
          return true;
        }
      }
    }
    
    // Default to "prefer not to say" option
    for (const option of options) {
      const optText = option.textContent.toLowerCase();
      if (optText.includes('prefer not') || optText.includes('declined')) {
        selectElement.value = option.value;
        triggerChangeEvent(selectElement);
        return true;
      }
    }
    
    return false;
  }

  function fillInputField(inputElement, value) {
    if (!inputElement) return false;
    
    inputElement.value = value;
    triggerChangeEvent(inputElement);
    return true;
  }

  function fillRadioGroup(radios, value) {
    if (!radios || radios.length === 0) return false;
    
    const valueMap = currentHandler?.valueMapping || DEFAULT_VALUE_MAPPINGS;
    const key = SETTING_KEY_MAP[value] || '';
    const mappings = valueMap[key]?.[key] || valueMap[key] || [];
    
    for (const radio of radios) {
      const label = document.querySelector(`label[for="${radio.id}"]`) || 
                   radio.closest('label') ||
                   radio.parentElement;
      
      if (label) {
        const labelText = label.textContent.toLowerCase();
        
        for (const mapValue of mappings) {
          if (labelText.includes(mapValue)) {
            radio.checked = true;
            triggerChangeEvent(radio);
            return true;
          }
        }
      }
    }
    
    return false;
  }

  function triggerChangeEvent(element) {
    ['change', 'input', 'blur'].forEach(eventType => {
      element.dispatchEvent(new Event(eventType, { bubbles: true }));
    });
  }

  function showNotification(message) {
    const existing = document.querySelector('.job-autofill-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = 'job-autofill-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #4a90d9, #357abd);
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(74, 144, 217, 0.4);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      font-weight: 500;
      animation: slideInRight 0.3s ease;
    `;
    notification.textContent = message;
    
    if (!document.getElementById('job-autofill-styles')) {
      const style = document.createElement('style');
      style.id = 'job-autofill-styles';
      style.textContent = `@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideInRight 0.3s ease reverse';
      setTimeout(() => notification.remove(), 300);
    }, 4000);
  }

  function observeForForm() {
    const observer = new MutationObserver((mutations) => {
      if (isFilled) {
        observer.disconnect();
        return;
      }
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const text = (node.textContent || '').toLowerCase();
              
              if (text.includes('equal employment') || 
                  text.includes('gender') && text.includes('select')) {
                setTimeout(() => detectAndFillForm(), 500);
                return;
              }
            }
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 60000);
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'fillEEO') {
      isFilled = false;
      loadSettings().then(() => {
        detectAndFillForm();
        sendResponse({ success: true });
      });
      return true;
    }
    
    if (message.action === 'getStatus') {
      sendResponse({ 
        isFilled: isFilled, 
        hasSettings: !!settings,
        handler: currentHandler?.name || 'unknown'
      });
      return true;
    }
  });

  // Initialize
  init();
})();