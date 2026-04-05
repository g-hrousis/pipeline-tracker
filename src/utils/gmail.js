import { COMPANY_DOMAINS } from '../data/applications.js';

const GMAIL_API         = 'https://gmail.googleapis.com/gmail/v1/users/me';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

function getApiKey() {
  return import.meta.env.VITE_ANTHROPIC_API_KEY || '';
}

// ── Gmail REST API helpers ────────────────────────────────────────────────

async function gmailGet(path, token) {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    const err = new Error('Gmail session expired — reconnect Gmail in the header');
    err.code = 'AUTH_EXPIRED';
    throw err;
  }
  if (!res.ok) throw new Error(`Gmail API error ${res.status}`);
  return res.json();
}

async function searchMessageIds(token, query, maxResults = 50) {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const data = await gmailGet(`/messages?${params}`, token);
  return (data.messages || []).map((m) => m.id);
}

async function getMessageMeta(token, id) {
  // format=metadata + requested headers gives us Subject/From/Date + snippet
  const qs = 'format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date';
  return gmailGet(`/messages/${id}?${qs}`, token);
}

function headerVal(msg, name) {
  return (
    msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
  );
}

function internalDateToISO(ts) {
  if (!ts) return new Date().toISOString().split('T')[0];
  return new Date(parseInt(ts, 10)).toISOString().split('T')[0];
}

/** Rule-based email type classification — no API cost. */
function classifyEmailType(subject = '', snippet = '') {
  const t = (subject + ' ' + snippet).toLowerCase();
  if (/reject|not moving forward|not selected|unfortunately|other candidates|position.*filled|moved forward with other|will not be moving/.test(t))
    return 'rejection';
  if (/offer|congratulations|pleased to offer|we.*like to offer|offer letter|compensation package/.test(t))
    return 'offer';
  if (/interview|schedule.*call|schedule.*meet|invited.*speak|virtual.*meeting|speak with our|zoom|teams call|video call|phone screen/.test(t))
    return 'invite';
  if (/assessment|take-home|coding challenge|case study|hackerrank|codility|pymetrics|online test|aptitude|skills test/.test(t))
    return 'assessment';
  if (/application received|thank you for applying|we received your|application confirmation|successfully submitted|your application for/.test(t))
    return 'confirmation';
  if (/^re:|follow.?up|checking in|circling back|following up|just wanted to/.test(t))
    return 'reply';
  return 'other';
}

// ── Per-app Gmail sync ─────────────────────────────────────────────────────

export async function fetchGmailForApp(app, token) {
  if (!token) return { appId: app.id, threads: [], hasNewActivity: false };

  const domains = COMPANY_DOMAINS[app.company];
  if (!domains || domains.length === 0) {
    return { appId: app.id, threads: [], hasNewActivity: false };
  }

  const existing   = app.gmailThreads || [];
  const existingIds = new Set(existing.map((t) => t.id).filter(Boolean));

  // Incremental: only ask for messages newer than the latest we already have
  const latestDate = existing
    .map((t) => t.date || '')
    .filter(Boolean)
    .sort()
    .pop();
  const afterDate = latestDate ? latestDate.replace(/-/g, '/') : '2025/1/1';

  const fromQuery = domains.map((d) => `from:${d}`).join(' OR ');
  const query     = `(${fromQuery}) after:${afterDate}`;

  try {
    const ids    = await searchMessageIds(token, query, 50);
    const newIds = ids.filter((id) => !existingIds.has(id));

    if (newIds.length === 0) {
      return { appId: app.id, threads: [], hasNewActivity: false };
    }

    // Fetch metadata for all new messages (cap at 30 per sync cycle)
    const fetched = await Promise.allSettled(
      newIds.slice(0, 30).map((id) => getMessageMeta(token, id))
    );

    const newThreads = fetched
      .filter((r) => r.status === 'fulfilled')
      .map(({ value: msg }) => {
        const subject = headerVal(msg, 'Subject');
        const from    = headerVal(msg, 'From');
        const date    = internalDateToISO(msg.internalDate);
        const snippet = msg.snippet || '';
        return {
          id:        msg.id,
          subject,
          from,
          date,
          snippet,
          emailType: classifyEmailType(subject, snippet),
          gmailUrl:  `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
        };
      });

    return { appId: app.id, threads: newThreads, hasNewActivity: newThreads.length > 0 };
  } catch (err) {
    if (err.code === 'AUTH_EXPIRED') throw err;
    return { appId: app.id, threads: [], hasNewActivity: false, error: true };
  }
}

// ── Sync all known applications ────────────────────────────────────────────

export async function syncAllApplications(applications, token) {
  if (!token) return [];
  const toSync  = applications.filter((a) => a.stage !== 'Closed');
  const results = await Promise.allSettled(
    toSync.map((app) => fetchGmailForApp(app, token))
  );
  return results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
}

// ── Auto-detect NEW applications from Gmail ────────────────────────────────

export async function detectNewApplications(existingApps, token) {
  if (!token) return [];
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const knownCompanies = new Set(existingApps.map((a) => a.company.toLowerCase()));

  // Search several subject-line patterns in parallel
  const queries = [
    'subject:"thank you for applying" after:2025/10/1',
    'subject:"application received" after:2025/10/1',
    'subject:"application confirmation" after:2025/10/1',
    'subject:"thank you for your application" after:2025/10/1',
    'subject:"we received your application" after:2025/10/1',
    'subject:"your application" after:2025/10/1',
  ];

  try {
    const idSets = await Promise.allSettled(
      queries.map((q) => searchMessageIds(token, q, 15))
    );
    const allIds = [
      ...new Set(
        idSets
          .filter((r) => r.status === 'fulfilled')
          .flatMap((r) => r.value)
      ),
    ].slice(0, 40);

    if (allIds.length === 0) return [];

    // Fetch message metadata
    const fetched = await Promise.allSettled(
      allIds.map((id) => getMessageMeta(token, id))
    );
    const messages = fetched
      .filter((r) => r.status === 'fulfilled')
      .map(({ value: msg }) => ({
        subject: headerVal(msg, 'Subject'),
        from:    headerVal(msg, 'From'),
        date:    internalDateToISO(msg.internalDate),
        snippet: msg.snippet || '',
      }));

    if (messages.length === 0) return [];

    // Ask Claude (no MCP, no Gmail tool) to extract company/role from the snippets
    const prompt = `You are extracting job application data from email metadata.

These are confirmation emails from job applications. Extract the company and role from each:

${messages.map((m, i) =>
  `${i + 1}. From: ${m.from}\n   Subject: ${m.subject}\n   Date: ${m.date}\n   Snippet: ${m.snippet}`
).join('\n\n')}

SKIP emails from these already-tracked companies (case-insensitive): ${[...knownCompanies].join(', ')}

For each genuinely new job application (not spam, not a newsletter), extract:
[{
  "company": "Company Name",
  "role": "Job Title",
  "appliedAt": "YYYY-MM-DD",
  "emailFrom": "sender@domain.com",
  "emailSubject": "subject line",
  "snippet": "key detail",
  "priority": "HIGH|MEDIUM|LOW",
  "isIncomplete": false
}]

Priority: HIGH = top consulting/finance/tech (McKinsey, BCG, Goldman, etc.), MEDIUM = mid-tier, LOW = others.
isIncomplete = true if the email says the application was started but not submitted.

Return ONLY the JSON array. Empty array [] if nothing new.`;

    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-20250514',
        max_tokens: 2000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const found = JSON.parse(jsonMatch[0]);

    return found
      .filter((f) => f.company && !knownCompanies.has(f.company.toLowerCase()))
      .map((f, i) => ({
        id:             `auto-${Date.now()}-${i}`,
        company:        f.company,
        role:           f.role || 'Unknown Role',
        stage:          f.isIncomplete ? 'Targeting' : 'Applied',
        priority:       f.priority || 'MEDIUM',
        status:         f.isIncomplete ? 'Incomplete' : 'Under Review',
        deadline:       null,
        appliedAt:      f.appliedAt || new Date().toISOString().split('T')[0],
        stageEnteredAt: f.appliedAt || new Date().toISOString().split('T')[0],
        contacts:       [],
        timeline: [{
          date: f.appliedAt || new Date().toISOString().split('T')[0],
          type: f.isIncomplete ? 'note' : 'applied',
          note: `Auto-detected via Gmail — ${f.snippet || f.emailSubject || ''}`,
        }],
        notes:          `Auto-detected from Gmail. From: ${f.emailFrom || ''}. Subject: "${f.emailSubject || ''}"`,
        documents:      [],
        gmailThreads:   [],
        hasNewActivity: true,
        source:         'gmail-detected',
        jobDescription: '',
      }));
  } catch (err) {
    if (err.code === 'AUTH_EXPIRED') throw err;
    return [];
  }
}
