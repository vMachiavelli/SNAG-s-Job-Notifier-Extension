// background.js
// Service worker: polls LinkedIn guest Jobs API every 30 minutes and sends notifications for new jobs via regex parsing

// Constants
const TIME_PARAM = 'r86400'; // last 24 hour filter
const ALARM_NAME = 'jobCheck';

// 1. On install/update, schedule repeating alarm
chrome.runtime.onInstalled.addListener(() => {
  console.log('🛠️ background.js loaded');
  chrome.alarms.create(ALARM_NAME, {
    when: Date.now(),
    periodInMinutes: 30
  });
});

// 2. Parse HTML response into job objects using regex
function parseJobs(html) {
  const jobs = [];
  // Match list items containing job cards and capture URL, title, company, location
  const itemRegex = /<li[\s\S]*?<div[^>]*class="[^"]*base-card[^"]*"[\s\S]*?<a[^>]*class="[^"]*_full-link[^"]*"[^>]*href="([^"]+)"[\s\S]*?<h3[^>]*class="[^"]*_title[^"]*"[^>]*>([^<]+)<\/h3>[\s\S]*?<h4[^>]*class="[^"]*_subtitle[^"]*"[^>]*>([^<]+)<\/h4>[\s\S]*?<span[^>]*class="[^"]*_location[^"]*"[^>]*>([^<]+)<\/span>/g;
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
  console.log('🔥 Alarm fired:', alarm.name);
  if (alarm.name !== ALARM_NAME) {
    console.log('⏭️ Ignoring alarm:', alarm.name);
    return;
  }
  try {
    const { criteria = {}, lastSeen = {} } = await chrome.storage.local.get(['criteria', 'lastSeen']);
    console.log('Stored criteria in SW:', criteria);
    if (!criteria.keywords) {
      console.log('❌ No keywords set, aborting');
      return;
    }

    // Build guest API URL with percent-encoding
    const kw = encodeURIComponent(criteria.keywords.trim());
    const loc = encodeURIComponent(criteria.location.trim());
    const fetchUrl =
      `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?` +
      `keywords=${kw}` +
      `&location=${loc}` +
      `&f_TPR=${TIME_PARAM}` +
      `&start=0`;
    console.log('🔗 Fetching URL:', fetchUrl);

    const res = await fetch(fetchUrl, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    console.log('Raw HTML length:', html.length);

    const jobs = parseJobs(html);
    console.log('PARSED JOBS:', jobs);
    if (jobs.length === 0) {
      console.log('😞 No jobs parsed, regex may need updating');
      return;
    }

    const seenId = lastSeen[criteria.id];
    const newJobs = seenId ? jobs.filter(j => j.id !== seenId) : jobs;
    if (newJobs.length === 0) {
      console.log('🔍 No new jobs since last check');
      return;
    }

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
      console.log('🔔 Notified for job:', job);
    });
  } catch (err) {
    console.error('Error in jobCheck alarm:', err);
  }
});

// 4. Open job URL on notification click
chrome.notifications.onClicked.addListener(async notifId => {
  console.log('🔗 Notification clicked:', notifId);
  const { lastFetched = {} } = await chrome.storage.local.get('lastFetched');
  const url = lastFetched[notifId];
  if (url) chrome.tabs.create({ url });
});

// 5. Listen for testNotification messages to fire a demo notification
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'testNotification') {
    chrome.notifications.create('test-notif', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: '🔔 Test Notification',
      message: 'This is a test alert from Job Notifier!',
      contextMessage: 'Notification system is working'
    });
  }
});
