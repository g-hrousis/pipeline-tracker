/**
 * Gmail OAuth — authorization code flow with refresh token.
 *
 * Access tokens last 1 hour but are refreshed automatically and silently.
 * The refresh token stored in localStorage never expires unless you revoke
 * access in your Google account settings (or leave it totally idle for 6 months).
 * In practice you authorize once and it just keeps working.
 *
 * ── One-time setup (~10 min) ─────────────────────────────────────────────────
 * 1. https://console.cloud.google.com → New project (or reuse existing)
 * 2. APIs & Services → Library → search "Gmail API" → Enable
 * 3. APIs & Services → OAuth consent screen
 *      User type: External → Create
 *      App name: Pipeline Tracker  |  Support email: your email
 *      Developer contact: your email → Save and Continue (skip scopes) → Save
 *      Back to Dashboard → "Publish App" (leave in Testing is fine — add
 *      yourself as a Test User under "Test users")
 * 4. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
 *      Application type: **Desktop app**   ← important, not "Web application"
 *      Name: Pipeline Tracker → Create
 * 5. Copy the Client ID and Client Secret shown in the dialog.
 * 6. Add both to your .env.local:
 *      VITE_GOOGLE_CLIENT_ID=<client-id>.apps.googleusercontent.com
 *      VITE_GOOGLE_CLIENT_SECRET=<client-secret>
 * 7. Restart Vite (npm run dev) and click "Connect Gmail" in the header.
 *
 * Why "Desktop app"?  Google treats the client_secret for Desktop/Installed
 * apps as non-confidential (documented in their OAuth guide). That means it's
 * safe to include it in a local frontend app's .env.local.  Web-app credentials
 * do require a backend for the code exchange, which would add unnecessary complexity.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const KEY_ACCESS  = 'pipeline_gmail_token';
const KEY_REFRESH = 'pipeline_gmail_refresh';
const KEY_EXPIRY  = 'pipeline_gmail_token_expiry';

const SCOPES         = 'https://www.googleapis.com/auth/gmail.readonly';
const AUTH_ENDPOINT  = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

function clientId()     { return import.meta.env.VITE_GOOGLE_CLIENT_ID || ''; }
function clientSecret() { return import.meta.env.VITE_GOOGLE_CLIENT_SECRET || ''; }
// For Desktop-app credentials, localhost redirect URIs are always whitelisted by Google.
function redirectUri()  { return window.location.origin; }

// ── Token storage ─────────────────────────────────────────────────────────────

function saveTokens({ access_token, refresh_token, expires_in }) {
  if (access_token) {
    localStorage.setItem(KEY_ACCESS, access_token);
    // treat as expired 60s early so we never hand out a stale token
    localStorage.setItem(KEY_EXPIRY, String(Date.now() + (Number(expires_in) - 60) * 1000));
  }
  // Google only returns a refresh_token on the first exchange (or when prompt=consent).
  // On subsequent refresh calls it comes back undefined — don't overwrite the stored one.
  if (refresh_token) {
    localStorage.setItem(KEY_REFRESH, refresh_token);
  }
}

export function clearGmailToken() {
  [KEY_ACCESS, KEY_REFRESH, KEY_EXPIRY].forEach((k) => {
    try { localStorage.removeItem(k); } catch {}
  });
}

function getCachedAccessToken() {
  const token  = localStorage.getItem(KEY_ACCESS);
  const expiry = parseInt(localStorage.getItem(KEY_EXPIRY) || '0', 10);
  return token && Date.now() < expiry ? token : null;
}

/** True when we have a refresh token — i.e. the user has authorized before. */
export function isGmailConnected() {
  return !!localStorage.getItem(KEY_REFRESH);
}

// ── Token refresh ─────────────────────────────────────────────────────────────

async function doRefresh() {
  const refreshToken = localStorage.getItem(KEY_REFRESH);
  if (!refreshToken) {
    const err = new Error('No refresh token — connect Gmail first');
    err.code = 'NOT_CONNECTED';
    throw err;
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.error === 'invalid_grant') {
      // Refresh token has been revoked or expired — force re-auth
      clearGmailToken();
      const err = new Error('Gmail authorization revoked — reconnect Gmail');
      err.code = 'AUTH_EXPIRED';
      throw err;
    }
    throw new Error(`Token refresh failed (${res.status}): ${body.error_description || body.error || ''}`);
  }

  const data = await res.json();
  saveTokens(data);
  return data.access_token;
}

/**
 * Returns a valid access token, silently refreshing if the cached one has expired.
 * This is what gmail.js should call — not getGmailToken() directly.
 */
export async function getValidGmailToken() {
  const cached = getCachedAccessToken();
  if (cached) return cached;
  return doRefresh();
}

// ── OAuth authorization code flow ────────────────────────────────────────────

/**
 * Redirects the browser to Google's OAuth consent screen.
 * On return, the URL will contain ?code=... which handleOAuthCallback() handles.
 */
export function startGmailOAuth() {
  if (!clientId()) {
    throw new Error(
      'VITE_GOOGLE_CLIENT_ID not set — see src/utils/googleAuth.js for setup instructions'
    );
  }
  const params = new URLSearchParams({
    client_id:     clientId(),
    redirect_uri:  redirectUri(),
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',   // request a refresh token
    prompt:        'consent',   // always ask so Google always issues a refresh token
  });
  window.location.href = `${AUTH_ENDPOINT}?${params}`;
}

/**
 * Call this once on app load.
 * If the URL contains ?code=, it exchanges the code for tokens, cleans the URL,
 * and returns true.  Returns false if there's no code in the URL.
 */
export async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get('code');
  const error  = params.get('error');

  if (error) {
    // User cancelled or denied — clean URL and surface the error
    window.history.replaceState({}, '', window.location.pathname);
    throw new Error(`OAuth denied: ${error}`);
  }

  if (!code) return false;

  // Clean the code out of the URL immediately so a page refresh doesn't re-trigger
  window.history.replaceState({}, '', window.location.pathname);

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId(),
      client_secret: clientSecret(),
      code,
      redirect_uri:  redirectUri(),
      grant_type:    'authorization_code',
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`OAuth code exchange failed: ${body.error_description || body.error || res.status}`);
  }

  const data = await res.json();
  saveTokens(data);
  return true;
}
