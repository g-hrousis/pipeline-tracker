# Pipeline Tracker

A personal job application tracker with a Kanban board, sortable list view, analytics dashboard, Gmail sync, and Claude-powered resume fit scoring.

---

## What it does

- **Kanban board** — drag cards across 8 pipeline stages (Targeting → Closed)
- **List view** — sortable table with inline stage changes
- **Analytics** — pipeline funnel, conversion rates, health grade, score distribution
- **Gmail sync** — pulls every email tied to each company into the card modal; auto-detects new applications from confirmation emails
- **Resume fit scoring** — paste your resume once, Claude scores every application 1–10 with strengths, gaps, and a recommendation; paste a job description inside any card for more precise results
- **Communication scoring** — rule-based outreach quality score per application
- **Urgent deadline banner** — surfaces applications with deadlines within 7 days
- **Fully offline-first** — all data lives in `localStorage`, no backend

---

## Prerequisites

- [Node.js](https://nodejs.org) 18 or later (`node -v` to check)
- An [Anthropic API key](https://console.anthropic.com) (for fit scoring + new-job detection)
- A Google Cloud project with Gmail API enabled (for email sync — setup below)

---

## Quick start

```bash
# 1. Clone
git clone https://github.com/g-hrousis/pipeline-tracker.git
cd pipeline-tracker

# 2. Install dependencies
npm install

# 3. Add your API keys (see sections below for how to get them)
cp .env.example .env.local
# edit .env.local and fill in the two values

# 4. Start the dev server
npm run dev
# → open http://localhost:5173
```

---

## Environment variables

Create `.env.local` in the project root (copy from `.env.example`):

```env
VITE_ANTHROPIC_API_KEY=sk-ant-api03-...
VITE_GOOGLE_CLIENT_ID=123456789-abc123.apps.googleusercontent.com
```

Both values are explained in detail below.

---

## Getting your Anthropic API key

Used for resume fit scoring and auto-detecting new job applications from Gmail.

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign in or create an account
3. Click **API Keys** in the left sidebar → **Create Key**
4. Copy the key (starts with `sk-ant-api03-`) and paste it as `VITE_ANTHROPIC_API_KEY` in `.env.local`

> The key is only used client-side from your local machine. Never commit `.env.local` to git (it is already in `.gitignore`).

---

## Setting up Gmail sync (Google OAuth + PKCE)

This takes about 10 minutes the first time. Once done you authorize once in the browser and it stays connected indefinitely.

### Step 1 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top → **New Project**
3. Name it `Pipeline Tracker` (or anything you like) → **Create**
4. Make sure the new project is selected in the dropdown before continuing

### Step 2 — Enable the Gmail API

1. In the left sidebar go to **APIs & Services** → **Library**
2. Search for **Gmail API** → click it → click **Enable**

### Step 3 — Configure the OAuth consent screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. User type: **External** → **Create**
3. Fill in the required fields:
   - App name: `Pipeline Tracker`
   - User support email: your Gmail address
   - Developer contact email: your Gmail address
4. Click **Save and Continue**
5. On the **Scopes** page — click **Save and Continue** (no scopes needed here)
6. On the **Test users** page — click **Add Users**, enter your Gmail address, click **Add**
7. Click **Save and Continue** → **Back to Dashboard**

> You do not need to publish the app. Leaving it in Testing mode is fine as long as your email is in the test users list.

### Step 4 — Create OAuth credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name: `Pipeline Tracker`
5. Under **Authorized JavaScript origins** click **+ Add URI**:
   ```
   http://localhost:5173
   ```
6. Under **Authorized redirect URIs** click **+ Add URI**:
   ```
   http://localhost:5173
   ```
7. Click **Create**
8. A dialog shows your credentials — copy the **Client ID** (looks like `123456789-abc123.apps.googleusercontent.com`)
9. Paste it as `VITE_GOOGLE_CLIENT_ID` in `.env.local`

> You do **not** need the Client Secret. The app uses PKCE (RFC 7636) which proves identity with a cryptographic challenge instead of a shared secret.

### Step 5 — Connect Gmail in the app

1. Restart the dev server if it is running (`Ctrl+C` → `npm run dev`)
2. Open [http://localhost:5173](http://localhost:5173)
3. Click **Connect Gmail** in the header
4. A Google sign-in page opens — select your account and click **Allow**
5. You are redirected back to the app and a sync starts automatically

**That is it.** The connection is permanent — the app silently refreshes the access token in the background whenever it expires. You only need to reconnect if you manually revoke access in your [Google account settings](https://myaccount.google.com/permissions).

---

## How the Gmail sync works

When you click **Sync Gmail** (or it runs automatically every 5 minutes):

1. **Existing applications** — for each tracked company, the app searches Gmail for emails from that company's domain(s) and pulls the subject, sender, date, and snippet into the card modal under "Gmail Correspondence". New emails are merged with existing ones — nothing is ever overwritten.

2. **New application detection** — the app searches for job confirmation emails from companies not yet in your tracker. Claude extracts the company name and role from the email metadata and creates new cards automatically.

Email type (confirmation, invite, assessment, rejection, offer) is classified locally without an API call using keyword matching against the subject and snippet.

---

## Resume fit scoring

1. Click **Resume** in the header
2. Either drag and drop a `.txt` or `.md` file onto the upload zone, or paste your resume text directly
3. Click **Save & Score All Apps** — Claude scores every active application on a 1–10 scale with strengths, gaps, and a recommendation
4. Scores appear as **★ N** badges on Kanban cards and as a full breakdown inside each card modal

**To improve accuracy for a specific role:**
1. Open the card modal
2. Paste the job description into the **Job Description** field
3. Click **↻ Rescore** — Claude re-runs the analysis with the full JD context

Scores are stored in `localStorage` and persist across sessions. Re-upload your resume anytime to re-score everything.

---

## Project structure

```
src/
  App.jsx                  — global state (useReducer), context, layout
  main.jsx                 — React entry point
  index.css                — design system (CSS custom properties, all styles)
  data/
    applications.js        — default applications, STAGES, COMPANY_DOMAINS
  components/
    Header.jsx             — wordmark, health grade, Gmail connect/sync, Resume button
    UrgentBanner.jsx       — deadline warning bar
    KanbanBoard.jsx        — drag-and-drop board (@dnd-kit)
    KanbanCard.jsx         — draggable card with score badges, stale glow
    ListView.jsx           — sortable table view
    Analytics.jsx          — recharts funnel, conversion stats, health grade
    CardModal.jsx          — full detail modal with Gmail, scoring, notes, contacts
    AddModal.jsx           — new application form
    ResumeModal.jsx        — resume upload and scoring trigger
    SuggestionBar.jsx      — auto-detected app suggestions bar
    Toast.jsx              — notification stack
  utils/
    googleAuth.js          — PKCE OAuth flow, token storage, silent refresh
    gmail.js               — Gmail REST API calls, new-job detection via Claude
    fitScoring.js          — Claude Haiku resume vs role scoring
    scoring.js             — communication score, health grade, next action
    storage.js             — localStorage helpers
```

---

## Adding or editing applications

**Via the UI:**
Click the **+** button (bottom right) to add a new application. Fill in company, role, stage, and priority — all other fields can be edited in the card modal.

**Via the data file:**
Edit `src/data/applications.js` to change the pre-populated defaults. If you want Gmail sync to work for a company, add its sending domain(s) to the `COMPANY_DOMAINS` map:

```js
'Company Name': ['domain.com', 'ats-provider.com'],
```

The domain should match what appears in the `From:` field of emails you receive from that company. ATS providers like Lever, Greenhouse, Workday, and iCIMS all send from their own domains — add those too.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server at http://localhost:5173 |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |

---

## Tech stack

| | |
|---|---|
| Framework | React 19 + Vite 8 |
| Drag and drop | @dnd-kit/core |
| Charts | Recharts |
| Styling | Plain CSS with custom properties |
| Auth | Google OAuth 2.0 + PKCE (no backend, no client secret) |
| AI | Anthropic Claude API (Haiku for scoring, Sonnet for detection) |
| Persistence | localStorage only |
