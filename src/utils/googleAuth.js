/**
 * Google Identity Services (GIS) OAuth token management.
 *
 * One-time setup (takes ~10 min):
 * 1. Go to https://console.cloud.google.com
 * 2. New project → APIs & Services → Enable "Gmail API"
 * 3. OAuth consent screen → External → add your email as Test User → Save
 * 4. Credentials → Create → OAuth 2.0 Client ID → Web application
 *    Authorized JS origins: http://localhost:5173
 *    (add https://your-domain.com if you ever deploy)
 * 5. Copy the Client ID and add to .env.local:
 *    VITE_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
 * 6. Restart Vite (npm run dev) and click "Connect Gmail" in the header.
 *
 * Tokens last 1 hour. The app will prompt you to reconnect when they expire.
 */

const KEY_TOKEN  = 'pipeline_gmail_token';
const KEY_EXPIRY = 'pipeline_gmail_token_expiry';

export function getGmailToken() {
  try {
    const token  = localStorage.getItem(KEY_TOKEN);
    const expiry = parseInt(localStorage.getItem(KEY_EXPIRY) || '0', 10);
    if (!token || Date.now() > expiry) return null;
    return token;
  } catch {
    return null;
  }
}

export function saveGmailToken(accessToken, expiresIn) {
  try {
    // Subtract 60s so we treat the token as expired a minute early
    const expiry = Date.now() + (Number(expiresIn) - 60) * 1000;
    localStorage.setItem(KEY_TOKEN, accessToken);
    localStorage.setItem(KEY_EXPIRY, expiry.toString());
  } catch {}
}

export function clearGmailToken() {
  try {
    localStorage.removeItem(KEY_TOKEN);
    localStorage.removeItem(KEY_EXPIRY);
  } catch {}
}

export function isGmailConnected() {
  return !!getGmailToken();
}

/**
 * Opens the Google OAuth popup and resolves with the access token.
 * Uses the GIS "token" model — no server, no refresh token needed.
 */
export function requestGmailToken() {
  return new Promise((resolve, reject) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      reject(new Error(
        'VITE_GOOGLE_CLIENT_ID not set — see src/utils/googleAuth.js for setup instructions'
      ));
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services script not loaded — check your internet connection'));
      return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        saveGmailToken(response.access_token, response.expires_in);
        resolve(response.access_token);
      },
    });
    // prompt: '' means skip consent screen if already authorized
    client.requestAccessToken({ prompt: '' });
  });
}
