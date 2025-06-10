// background.js
// Service worker: polls LinkedIn guest Jobs API every 30 minutes and sends notifications for new jobs via regex parsing

// Constants
const TIME_PARAM = 'r3600'; // last hour filter
const ALARM_NAME = 'jobCheck';

// 1. On install/update, schedule repeating alarm
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, {
    when: Date.now(),
    periodInMinutes: 30
  });
});

// 2. Parse HTML response into job objects using regex (DOMParser unavailable in service worker)
function parseJobs(html) {
  const jobs = [];
  // Match each list item block
  const itemRegex = /<li[\s\S]*?<a[^>]+class="[^"]*base-card__full-link[^"]*"[^>]+href="([^"]+)"[\s\S]*?>([\s\S]*?)<\/a>[\s\S]*?<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>([^<]+)<\/h3>[\s\S]*?<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>([^<]+)<\/h4>[\s\S]*?<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([^<]+)<\/span>/g;
  let match;
  while ((match = itemRegex.exec(html)) !== null) {
    const url = match[1];
    const title = match[3].trim();
    const company = match[4].trim();
    const location = match[5].trim();
    const id = url.split('/').pop().split('?')[0];
    jobs.push({ id, title, company, location, url });
  }
  return jobs;
}

// 3. Alarm listener: fetch, detect new jobs, notify
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== ALARM_NAME) return;
  try {
    const { criteria = {}, lastSeen = {} } = await chrome.storage.local.get(['criteria', 'lastSeen']);
    if (!criteria.keywords) return;

    // Build guest API URL
    const params = new URLSearchParams({
      keywords: criteria.keywords,
      location: criteria.location,
      f_TPR: TIME_PARAM,
      start: '0'
    });
    const fetchUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`;

    const res = await fetch(fetchUrl, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const jobs = parseJobs(html);
    if (!jobs.length) return;

    const seenId = lastSeen[criteria.id];
    const newJobs = seenId ? jobs.filter(j => j.id !== seenId) : jobs;
    if (newJobs.length === 0) return;

    // Update storage
    lastSeen[criteria.id] = jobs[0].id;
    const lastFetched = {};
    jobs.forEach(j => { lastFetched[j.id] = j.url; });
    await chrome.storage.local.set({ lastSeen, lastFetched });

    // Send notifications
    newJobs.forEach(job => {
      chrome.notifications.create(job.id, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: job.title,
        message: `${job.company} — ${job.location}`,
        contextMessage: 'Posted within the last hour'
      });
    });
  } catch (err) {
    console.error('Error in jobCheck alarm:', err);
  }
});

// 4. Open job URL on notification click
chrome.notifications.onClicked.addListener(async notifId => {
  const { lastFetched = {} } = await chrome.storage.local.get('lastFetched');
  const url = lastFetched[notifId];
  if (url) chrome.tabs.create({ url });
});
