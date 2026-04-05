const KEY_APPS = 'pipeline_applications';
const KEY_SYNC = 'pipeline_gmail_synced_at';
const KEY_AUTO_SYNC = 'pipeline_gmail_auto_synced_at';
const KEY_SUGGESTED = 'pipeline_suggested_apps';
const KEY_DISMISSED = 'pipeline_dismissed_suggestions';

export function saveApplications(apps) {
  try {
    localStorage.setItem(KEY_APPS, JSON.stringify(apps));
  } catch (e) {
    console.warn('Failed to save applications to localStorage:', e);
  }
}

export function loadApplications() {
  try {
    const raw = localStorage.getItem(KEY_APPS);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Failed to load applications from localStorage:', e);
    return null;
  }
}

export function saveSyncTimestamp(ts) {
  try {
    localStorage.setItem(KEY_SYNC, ts);
  } catch (e) {}
}

export function loadSyncTimestamp() {
  try {
    return localStorage.getItem(KEY_SYNC) || null;
  } catch (e) {
    return null;
  }
}

export function saveAutoSyncTimestamp(ts) {
  try {
    localStorage.setItem(KEY_AUTO_SYNC, ts);
  } catch (e) {}
}

export function loadAutoSyncTimestamp() {
  try {
    return localStorage.getItem(KEY_AUTO_SYNC) || null;
  } catch (e) {
    return null;
  }
}

export function saveSuggestedApps(apps) {
  try {
    localStorage.setItem(KEY_SUGGESTED, JSON.stringify(apps));
  } catch (e) {}
}

export function loadSuggestedApps() {
  try {
    const raw = localStorage.getItem(KEY_SUGGESTED);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

export function saveDismissedSuggestions(ids) {
  try {
    localStorage.setItem(KEY_DISMISSED, JSON.stringify(ids));
  } catch (e) {}
}

export function loadDismissedSuggestions() {
  try {
    const raw = localStorage.getItem(KEY_DISMISSED);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}
