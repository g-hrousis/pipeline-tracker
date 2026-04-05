const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

function getApiKey() {
  return import.meta.env.VITE_ANTHROPIC_API_KEY || '';
}

function buildFitPrompt(app, resumeText, jobDescription = '') {
  const jdSection = jobDescription
    ? `\n\nJOB DESCRIPTION:\n${jobDescription}`
    : '';

  return `You are a career advisor evaluating resume-to-job fit.

CANDIDATE RESUME:
${resumeText.slice(0, 3000)}

TARGET ROLE: ${app.role} at ${app.company}${jdSection}

Score this candidate's fit for this role on a scale of 1–10, where:
- 10 = perfect match (skills, experience, background strongly aligned)
- 7–9 = strong fit (most requirements met, minor gaps)
- 5–6 = moderate fit (some alignment, notable gaps)
- 3–4 = weak fit (few matching skills)
- 1–2 = poor fit (significant mismatch)

Return ONLY a JSON object, no other text:
{
  "score": 7,
  "summary": "One sentence overall assessment",
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "gaps": ["gap 1", "gap 2"],
  "recommendation": "One sentence on whether to prioritize this application"
}`;
}

export async function scoreFit(app, resumeText, jobDescription = '') {
  const apiKey = getApiKey();
  if (!apiKey || !resumeText.trim()) {
    return null;
  }

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-20250514',
        max_tokens: 512,
        messages: [{ role: 'user', content: buildFitPrompt(app, resumeText, jobDescription) }],
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      score: Math.min(10, Math.max(1, Number(parsed.score) || 5)),
      summary: parsed.summary || '',
      strengths: parsed.strengths || [],
      gaps: parsed.gaps || [],
      recommendation: parsed.recommendation || '',
      usedJD: !!jobDescription,
      scoredAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function scoreAllApps(apps, resumeText) {
  if (!resumeText.trim()) return {};
  const apiKey = getApiKey();
  if (!apiKey) return {};

  const activeApps = apps.filter((a) => a.stage !== 'Closed');
  const results = await Promise.allSettled(
    activeApps.map((app) => scoreFit(app, resumeText, app.jobDescription || ''))
  );

  const scores = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) {
      scores[activeApps[i].id] = r.value;
    }
  });
  return scores;
}

export function getFitScoreColor(score) {
  if (score >= 8) return 'green';
  if (score >= 5) return 'amber';
  return 'red';
}
