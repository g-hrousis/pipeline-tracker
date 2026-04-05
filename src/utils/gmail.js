import { COMPANY_DOMAINS } from '../data/applications.js';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

function getApiKey() {
  return import.meta.env.VITE_ANTHROPIC_API_KEY || '';
}

function getMCPBase() {
  return import.meta.env.VITE_MCP_BASE_URL || 'http://localhost:3100';
}

async function queryMCPGmail(domains, daysBack = 60) {
  const domainList = Array.isArray(domains) ? domains : [domains];
  const fromQuery = domainList.map((d) => `from:${d}`).join(' OR ');
  const query = `(${fromQuery}) newer_than:${daysBack}d`;

  const res = await fetch(`${getMCPBase()}/gmail/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, maxResults: 10 }),
  });

  if (!res.ok) throw new Error(`MCP server error: ${res.status}`);
  return res.json();
}

function buildClassificationPrompt(emails, companyName, role) {
  const emailList = emails
    .map(
      (e, i) =>
        `[${i}] From: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\nSnippet: ${e.snippet}`
    )
    .join('\n\n');

  return `You are analyzing emails related to a job application at ${companyName} for the role: ${role}.

Classify each email. Return ONLY a JSON array, no other text:
[{"index": 0, "type": "reply|invite|assessment|rejection|offer|other", "summary": "one-line description"}]

Types:
- reply: general response from company
- invite: interview or call invitation
- assessment: test, assessment, or exercise
- rejection: rejection or no longer considering
- offer: job offer or terms
- other: everything else

Emails:
${emailList}`;
}

async function classifyEmails(emails, companyName, role) {
  const apiKey = getApiKey();
  if (!apiKey) return emails.map((e) => ({ ...e, emailType: 'other', summary: e.snippet }));

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: buildClassificationPrompt(emails, companyName, role) }],
      }),
    });

    if (!res.ok) return emails.map((e) => ({ ...e, emailType: 'other', summary: e.snippet }));

    const data = await res.json();
    const text = data.content?.[0]?.text || '[]';

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return emails.map((e) => ({ ...e, emailType: 'other', summary: e.snippet }));

    const classifications = JSON.parse(jsonMatch[0]);
    return emails.map((email, i) => {
      const cls = classifications.find((c) => c.index === i);
      return {
        ...email,
        emailType: cls?.type || 'other',
        summary: cls?.summary || email.snippet,
      };
    });
  } catch {
    return emails.map((e) => ({ ...e, emailType: 'other', summary: e.snippet }));
  }
}

export async function fetchGmailForApp(app) {
  const domains = COMPANY_DOMAINS[app.company];
  if (!domains || domains.length === 0) {
    return { appId: app.id, threads: [], hasNewActivity: false };
  }

  let rawEmails;
  try {
    rawEmails = await queryMCPGmail(domains);
  } catch {
    return { appId: app.id, threads: [], hasNewActivity: false, error: true };
  }

  if (!rawEmails || rawEmails.length === 0) {
    return { appId: app.id, threads: [], hasNewActivity: false };
  }

  const classified = await classifyEmails(rawEmails, app.company, app.role);

  const existingIds = new Set((app.gmailThreads || []).map((t) => t.id));
  const hasNewActivity = classified.some((e) => !existingIds.has(e.id));

  return { appId: app.id, threads: classified.slice(0, 10), hasNewActivity };
}

export async function syncAllApplications(applications) {
  const toSync = applications.filter((a) => a.stage !== 'Closed');
  const results = await Promise.allSettled(toSync.map((app) => fetchGmailForApp(app)));

  return results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value);
}

function buildNewJobDetectionPrompt(emails) {
  const emailList = emails
    .map(
      (e, i) =>
        `[${i}] From: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\nSnippet: ${e.snippet}`
    )
    .join('\n\n');

  return `You are helping track job applications. These emails appear to be job-related. Extract application info from each email.

Return ONLY a JSON array, no other text:
[{"index": 0, "company": "Company Name", "role": "Role Title", "status": "Applied|Rejected|Under Review|Active", "appliedAt": "YYYY-MM-DD or null", "isJobRelated": true}]

If an email is NOT job-application related, set isJobRelated: false.

Emails:
${emailList}`;
}

export async function detectNewApplications(existingApps, mcpAvailable = true) {
  if (!mcpAvailable) return [];
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const knownDomains = new Set(
    Object.values(COMPANY_DOMAINS).flat().map((d) => d.toLowerCase())
  );
  const knownCompanies = new Set(existingApps.map((a) => a.company.toLowerCase()));

  const jobKeywords = [
    'application received',
    'thank you for applying',
    'your application',
    'interview invitation',
    'we received your application',
    'application confirmation',
    'next steps',
  ];

  let candidateEmails = [];
  try {
    for (const keyword of jobKeywords.slice(0, 3)) {
      const res = await fetch(`${getMCPBase()}/gmail/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `subject:"${keyword}" newer_than:60d`, maxResults: 5 }),
      });
      if (res.ok) {
        const emails = await res.json();
        candidateEmails.push(...(emails || []));
      }
    }
  } catch {
    return [];
  }

  if (candidateEmails.length === 0) return [];

  // Deduplicate by id
  const seen = new Set();
  candidateEmails = candidateEmails.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  // Filter out known domains
  const unknown = candidateEmails.filter((e) => {
    const fromDomain = (e.from || '').match(/@([^>]+)/)?.[1]?.toLowerCase();
    if (!fromDomain) return false;
    const isKnown = [...knownDomains].some((d) => fromDomain.endsWith(d));
    return !isKnown;
  });

  if (unknown.length === 0) return [];

  // Classify with Claude
  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: buildNewJobDetectionPrompt(unknown) }],
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const text = data.content?.[0]?.text || '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    const suggestions = parsed
      .filter((p) => p.isJobRelated && p.company)
      .filter((p) => !knownCompanies.has(p.company.toLowerCase()))
      .map((p, i) => ({
        id: `suggested-${Date.now()}-${i}`,
        company: p.company,
        role: p.role || 'Unknown Role',
        stage: 'Applied',
        priority: 'LOW',
        status: p.status || 'Under Review',
        deadline: null,
        appliedAt: p.appliedAt || new Date().toISOString().split('T')[0],
        stageEnteredAt: new Date().toISOString().split('T')[0],
        contacts: [],
        timeline: [{ date: new Date().toISOString().split('T')[0], type: 'email', note: 'Detected from Gmail — verify details' }],
        notes: 'Auto-detected from Gmail. Please verify and update details.',
        documents: [],
        gmailThreads: [],
        hasNewActivity: true,
        source: 'gmail-detected',
        emailSnippet: unknown[p.index]?.snippet || '',
      }));

    return suggestions;
  } catch {
    return [];
  }
}
