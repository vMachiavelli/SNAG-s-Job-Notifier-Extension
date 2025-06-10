// background.js
// Service worker: polls LinkedIn guest Jobs API every 30 minutes and sends notifications for new jobs via regex parsing

// Constants
const TIME_PARAM = 'r86400'; // last 24 hour filter
const ALARM_NAME = 'jobCheck';

// 1. On install/update, schedule repeating alarm
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, {
    when: Date.now(),
    periodInMinutes: 30
  });
});

// 2. Parse HTML response into job objects using regex
function parseJobs(html) {
  const jobs = [];
  // This regex looks for <li>…<a class="base-card__full-link" href="URL">…</a> then captures title, company, location
  const itemRegex = /<li[\s\S]*?<a[^>]+class="[^"]*base-card__full-link[^"]*"[^>]+href="([^"]+)"[\s\S]*?>[\s\S]*?<h3[^>]*class="[^"]*base-search-card__title[^"]*"[^>]*>([^<]+)<\/h3>[\s\S]*?<h4[^>]*class="[^"]*base-search-card__subtitle[^"]*"[^>]*>([^<]+)<\/h4>[\s\S]*?<span[^>]*class="[^"]*job-search-card__location[^"]*"[^>]*>([^<]+)<\/span>/g;
  let match;
  while ((match = itemRegex.exec(html)) !== null) {
    const url = match[1];
    const title = match[2].trim();
    const company = match[3].trim();
    const location = match[4].trim();
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

    // Build guest API URL with percent-encoding for spaces
    const kw = encodeURIComponent(criteria.keywords.trim());
    const loc = encodeURIComponent(criteria.location.trim());
    const fetchUrl = 
      `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?` +
      `keywords=${kw}` +
      `&location=${loc}` +
      `&f_TPR=${TIME_PARAM}` +
      `&start=0`;
    console.log('URL', fetchUrl);

    const res = await fetch(fetchUrl, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    console.log('Raw HTML length:', html.length);
    const jobs = parseJobs(html);
    console.log('JOBS FOUND: ', jobs);
    if (jobs.length === 0) return;

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
        contextMessage: 'Posted within the last 24 hours'
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
  if (url) {
    chrome.tabs.create({ url });
  }
});
