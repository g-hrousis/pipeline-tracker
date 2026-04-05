/**
 * Gmail OAuth — authorization code flow with PKCE + refresh token.
 *
 * PKCE (Proof Key for Code Exchange, RFC 7636) eliminates the need for a
 * client_secret entirely.  Before redirecting, the app generates a random
 * code_verifier, stores it in sessionStorage, and sends a SHA-256 hash of it
 * (the code_challenge) to Google.  On return, the token exchange proves
 * possession of the verifier without ever transmitting a secret.  This is the
 * correct pattern for public clients (SPAs, mobile apps) per RFC 6749 / BCP 212.
 *
 * Access tokens are refreshed silently — you authorize once and it works
 * indefinitely (refresh token is valid until you revoke access in your Google
 * account settings or leave it idle for 6 months).
 *
 * ── One-time setup (~10 min) ─────────────────────────────────────────────────
 * 1. https://console.cloud.google.com → New project (or reuse existing)
 * 2. APIs & Services → Library → search "Gmail API" → Enable
 * 3. APIs & Services → OAuth consent screen
 *      User type: External → Create
 *      App name: Pipeline Tracker  |  Support / Developer email: your email
 *      Save and Continue through scopes (skip) → Save
 *      Add yourself as a Test User (under "Test users") → Save
 * 4. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
 *      Application type: Web application
 *      Name: Pipeline Tracker
 *      Authorized JavaScript origins: http://localhost:5173
 *      Authorized redirect URIs:      http://localhost:5173
 *      → Create
 * 5. Copy only the Client ID (you do NOT need the client secret with PKCE).
 * 6. Add it to .env.local:
 *      VITE_GOOGLE_CLIENT_ID=<client-id>.apps.googleusercontent.com
 * 7. Restart Vite (npm run dev) and click "Connect Gmail" in the header.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const KEY_ACCESS   = 'pipeline_gmail_token';
const KEY_REFRESH  = 'pipeline_gmail_refresh';
const KEY_EXPIRY   = 'pipeline_gmail_token_expiry';
const KEY_VERIFIER = 'pipeline_pkce_verifier'; // sessionStorage — survives redirect, cleared after use

const SCOPES         = 'https://www.googleapis.com/auth/gmail.readonly';
const AUTH_ENDPOINT  = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

function clientId()    { return import.meta.env.VITE_GOOGLE_CLIENT_ID || ''; }
function redirectUri() { return window.location.origin; }

// ── PKCE helpers ──────────────────────────────────────────────────────────────

/** Cryptographically random 96-byte base64url string (128 chars). */
function generateVerifier() {
  const buf = new Uint8Array(96);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** SHA-256 hash of verifier, base64url-encoded — sent to the auth endpoint. */
async function deriveChallenge(verifier) {
  const encoder = new TextEncoder();
  const data    = encoder.encode(verifier);
  const digest  = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Token storage ─────────────────────────────────────────────────────────────

function saveTokens({ access_token, refresh_token, expires_in }) {
  if (access_token) {
    localStorage.setItem(KEY_ACCESS, access_token);
    // Treat as expired 60s early so we never hand a stale token to the API.
    localStorage.setItem(KEY_EXPIRY, String(Date.now() + (Number(expires_in) - 60) * 1000));
  }
  // Google only returns a refresh_token on the first code exchange (or after
  // prompt=consent).  On silent refresh calls it's absent — don't clobber it.
  if (refresh_token) {
    localStorage.setItem(KEY_REFRESH, refresh_token);
  }
}

export function clearGmailToken() {
  [KEY_ACCESS, KEY_REFRESH, KEY_EXPIRY].forEach((k) => {
    try { localStorage.removeItem(k); } catch {}
  });
  try { sessionStorage.removeItem(KEY_VERIFIER); } catch {}
}

function getCachedAccessToken() {
  const token  = localStorage.getItem(KEY_ACCESS);
  const expiry = parseInt(localStorage.getItem(KEY_EXPIRY) || '0', 10);
  return token && Date.now() < expiry ? token : null;
}

/** True when a refresh token is stored — user has authorized at least once. */
export function isGmailConnected() {
  return !!localStorage.getItem(KEY_REFRESH);
}

// ── Silent token refresh ──────────────────────────────────────────────────────

async function doRefresh() {
  const refreshToken = localStorage.getItem(KEY_REFRESH);
  if (!refreshToken) {
    const err = new Error('No refresh token — connect Gmail first');
    err.code = 'NOT_CONNECTED';
    throw err;
  }

  // Refresh exchanges only need client_id + refresh_token (no secret, no verifier).
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId(),
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body.error === 'invalid_grant') {
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
 * Returns a valid access token — uses the cache if fresh, otherwise silently
 * refreshes via the stored refresh token.  gmail.js calls this on every request.
 */
export async function getValidGmailToken() {
  const cached = getCachedAccessToken();
  if (cached) return cached;
  return doRefresh();
}

// ── Authorization code + PKCE flow ────────────────────────────────────────────

/**
 * Generates a PKCE verifier/challenge pair, stores the verifier in
 * sessionStorage, then redirects to Google's consent screen.
 * The page will return to window.location.origin with ?code=...
 */
export async function startGmailOAuth() {
  if (!clientId()) {
    throw new Error('VITE_GOOGLE_CLIENT_ID not set — see src/utils/googleAuth.js for setup instructions');
  }

  const verifier   = generateVerifier();
  const challenge  = await deriveChallenge(verifier);

  // Store verifier in sessionStorage so it survives the redirect but is
  // scoped to this browser tab and cleared once we've used it.
  sessionStorage.setItem(KEY_VERIFIER, verifier);

  const params = new URLSearchParams({
    client_id:             clientId(),
    redirect_uri:          redirectUri(),
    response_type:         'code',
    scope:                 SCOPES,
    access_type:           'offline',  // request a refresh token
    prompt:                'consent',  // always issue a fresh refresh token
    code_challenge:        challenge,
    code_challenge_method: 'S256',
  });

  window.location.href = `${AUTH_ENDPOINT}?${params}`;
}

/**
 * Call once on app load.  If the URL contains ?code=, exchanges it for tokens
 * using the PKCE verifier from sessionStorage, cleans the URL, and returns true.
 * Returns false when there is no code in the URL.
 */
export async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get('code');
  const error  = params.get('error');

  if (error) {
    window.history.replaceState({}, '', window.location.pathname);
    throw new Error(`OAuth denied: ${error}`);
  }

  if (!code) return false;

  // Strip code from URL immediately so a hard-refresh doesn't re-trigger the exchange.
  window.history.replaceState({}, '', window.location.pathname);

  const verifier = sessionStorage.getItem(KEY_VERIFIER);
  sessionStorage.removeItem(KEY_VERIFIER);

  if (!verifier) {
    throw new Error('PKCE verifier missing — the OAuth flow was not started from this tab. Please try connecting again.');
  }

  // Token exchange: prove possession of the verifier — no client_secret required.
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId(),
      code,
      redirect_uri:  redirectUri(),
      grant_type:    'authorization_code',
      code_verifier: verifier,  // PKCE proof — replaces client_secret
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
