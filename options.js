// options.js
// Handles saving and restoring LinkedIn Job Alert settings

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('optionsForm');
    const keywordsInput = document.getElementById('keywords');
    const locationInput = document.getElementById('location');
    const intervalInput = document.getElementById('interval');
  
    // Restore saved settings
    chrome.storage.local.get(['criteria', 'interval'], data => {
      if (data.criteria) {
        keywordsInput.value = data.criteria.keywords || '';
        locationInput.value = data.criteria.location || '';
      }
      if (data.interval) {
        intervalInput.value = data.interval;
      }
    });
  
    // Save settings on form submit
    form.addEventListener('submit', e => {
      e.preventDefault();
  
      const keywords = keywordsInput.value.trim();
      const location = locationInput.value.trim();
      const interval = parseInt(intervalInput.value, 10);
      const criteria = {
        keywords,
        location,
        id: `${keywords}|${location}`
      };
  
      // Persist to storage
      chrome.storage.local.set({ criteria, interval }, () => {
        // (Re)create the polling alarm
        chrome.alarms.create('jobCheck', { periodInMinutes: interval });
        // Provide feedback to user
        alert('Settings saved successfully!');
      });
    });
  });