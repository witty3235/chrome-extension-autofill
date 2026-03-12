// Background service worker for the Job Autofill extension
// Handles storage operations and communicates with content scripts

chrome.runtime.onInstalled.addListener(() => {
  console.log('Job Autofill extension installed');
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getSettings') {
    chrome.storage.local.get('autofillSettings').then(result => {
      sendResponse(result.autofillSettings);
    });
    return true;
  }

  if (message.action === 'saveSettings') {
    chrome.storage.local.set({ autofillSettings: message.settings }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Handle extension icon click (optional: could add a badge or notification)
chrome.action.onClicked.addListener((tab) => {
  // This would only fire if we didn't have a popup
  // With popup.html set in manifest, this won't be used
});