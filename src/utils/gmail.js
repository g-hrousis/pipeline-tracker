import { COMPANY_DOMAINS } from '../data/applications.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const GMAIL_MCP_URL = 'https://gmail.mcp.claude.com/mcp';

function getApiKey() {
  return import.meta.env.VITE_ANTHROPIC_API_KEY || '';
}

// ── Core: call Claude with Gmail MCP access ────────────────────────────────

async function callClaudeWithGmail(prompt, maxTokens = 2048) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No Anthropic API key configured');

  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'mcp-client-2025-04-04',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      mcp_servers: [
        { type: 'url', url: GMAIL_MCP_URL, name: 'gmail' },
      ],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error ${res.status}`);
  }

  const data = await res.json();
  // Get final text content (last text block after any tool use)
  const textBlocks = (data.content || []).filter((b) => b.type === 'text');
  return textBlocks[textBlocks.length - 1]?.text || '';
}

// ── Sync a single known application ──────────────────────────────────────

export async function fetchGmailForApp(app) {
  const domains = COMPANY_DOMAINS[app.company];
  if (!domains || domains.length === 0) {
    return { appId: app.id, threads: [], hasNewActivity: false };
  }

  const fromList = domains.map((d) => `from:${d}`).join(' OR ');
  const prompt = `Search Gmail for emails matching: (${fromList}) after:2026/2/1

For this job application:
- Company: ${app.company}
- Role: ${app.role}

Find the most recent relevant emails and return a JSON array (max 5 emails):
[{
  "id": "gmail_message_id",
  "subject": "email subject",
  "from": "sender@domain.com",
  "date": "YYYY-MM-DD",
  "snippet": "first ~150 chars of email body",
  "emailType": "reply|invite|assessment|rejection|offer|other",
  "gmailUrl": "https://mail.google.com/mail/u/0/#inbox/MESSAGE_ID"
}]

Return ONLY the JSON array. If no emails found, return [].`;

  try {
    const text = await callClaudeWithGmail(prompt);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return { appId: app.id, threads: [], hasNewActivity: false };

    const threads = JSON.parse(jsonMatch[0]);
    const existingIds = new Set((app.gmailThreads || []).map((t) => t.id));
    const hasNewActivity = threads.some((t) => t.id && !existingIds.has(t.id));

    return { appId: app.id, threads, hasNewActivity };
  } catch {
    return { appId: app.id, threads: [], hasNewActivity: false, error: true };
  }
}

// ── Sync all known applications ────────────────────────────────────────────

export async function syncAllApplications(applications) {
  const toSync = applications.filter((a) => a.stage !== 'Closed');
  const results = await Promise.allSettled(
    toSync.map((app) => fetchGmailForApp(app))
  );
  return results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
}

// ── Auto-detect NEW applications from Gmail ────────────────────────────────

export async function detectNewApplications(existingApps) {
  const knownCompanies = existingApps
    .map((a) => a.company.toLowerCase())
    .join(', ');

  const prompt = `Search Gmail for job application confirmation emails received in the last 90 days.

I'm tracking job applications. These companies are ALREADY tracked — skip them:
${knownCompanies}

Search for emails with subjects like:
- "thank you for applying"
- "application received" / "application confirmation"
- "thank you for your application"
- "we received your application"
- "complete your application" (incomplete/abandoned applications)
- "action required" related to job applications

For each NEW company (not in the skip list above), extract:
[{
  "company": "Company Name",
  "role": "Exact Job Title from email",
  "status": "Applied|Incomplete|Under Review",
  "appliedAt": "YYYY-MM-DD",
  "emailFrom": "sender@domain.com",
  "emailSubject": "subject line",
  "snippet": "key detail from email body",
  "priority": "HIGH|MEDIUM|LOW",
  "isIncomplete": false
}]

Priority guide: HIGH = top consulting/finance/tech firms, MEDIUM = mid-tier, LOW = others.
Set isIncomplete = true if the email says the application was started but not finished.

Return ONLY the JSON array. If nothing new found, return [].`;

  try {
    const text = await callClaudeWithGmail(prompt, 3000);
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const found = JSON.parse(jsonMatch[0]);
    const knownSet = new Set(existingApps.map((a) => a.company.toLowerCase()));

    return found
      .filter((f) => f.company && !knownSet.has(f.company.toLowerCase()))
      .map((f, i) => ({
        id: `auto-${Date.now()}-${i}`,
        company: f.company,
        role: f.role || 'Unknown Role',
        stage: f.isIncomplete ? 'Targeting' : 'Applied',
        priority: f.priority || 'MEDIUM',
        status: f.isIncomplete ? 'Incomplete' : (f.status || 'Under Review'),
        deadline: null,
        appliedAt: f.appliedAt || new Date().toISOString().split('T')[0],
        stageEnteredAt: f.appliedAt || new Date().toISOString().split('T')[0],
        contacts: [],
        timeline: [{
          date: f.appliedAt || new Date().toISOString().split('T')[0],
          type: f.isIncomplete ? 'note' : 'applied',
          note: `Auto-detected via Gmail scan — ${f.snippet || f.emailSubject || 'email received'}`,
        }],
        notes: `Auto-detected from Gmail. From: ${f.emailFrom || 'unknown'}. Subject: "${f.emailSubject || ''}"`,
        documents: [],
        gmailThreads: [],
        hasNewActivity: true,
        source: 'gmail-detected',
        jobDescription: '',
      }));
  } catch {
    return [];
  }
}
