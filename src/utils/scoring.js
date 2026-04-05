export function daysSince(isoDateString) {
  if (!isoDateString) return 999;
  const date = new Date(isoDateString);
  const now = new Date();
  const diff = now - date;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function getDaysInStage(app) {
  return daysSince(app.stageEnteredAt);
}

export function isStale(app) {
  if (app.stage === 'Closed') return null;
  const days = getDaysInStage(app);
  if (days > 14) return 'red';
  if (days > 7) return 'amber';
  return null;
}

export function computeCommScore(app) {
  let score = 5; // baseline
  const breakdown = [];
  const timeline = app.timeline || [];

  const inboundTypes = ['screen', 'interview', 'offer'];
  const hasReply = timeline.some(
    (e) =>
      inboundTypes.includes(e.type) ||
      (e.type === 'email' && (
        e.note.toLowerCase().includes('responds') ||
        e.note.toLowerCase().includes('received') ||
        e.note.toLowerCase().includes('replies') ||
        e.note.toLowerCase().includes('reply') ||
        e.note.toLowerCase().includes('sends') ||
        e.note.toLowerCase().includes('next steps') ||
        e.note.toLowerCase().includes('confirmation') ||
        e.note.toLowerCase().includes('reminder') ||
        e.note.toLowerCase().includes('invitation')
      ))
  );

  if (hasReply) {
    score += 2;
    breakdown.push('+2 Company replied at least once');
  }

  const followUps = timeline.filter((e) => e.type === 'follow-up');
  if (followUps.length > 0) {
    score += 2;
    breakdown.push('+2 At least one follow-up sent');
  }

  // Check if a follow-up was sent in the 3–7 day window after last significant event
  if (followUps.length > 0) {
    const lastSignificant = timeline
      .filter((e) => ['applied', 'screen', 'interview', 'assessment'].includes(e.type))
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

    if (lastSignificant) {
      const firstFollowUpAfter = followUps
        .filter((f) => new Date(f.date) > new Date(lastSignificant.date))
        .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

      if (firstFollowUpAfter) {
        const days = Math.floor(
          (new Date(firstFollowUpAfter.date) - new Date(lastSignificant.date)) / (1000 * 60 * 60 * 24)
        );
        if (days >= 3 && days <= 7) {
          score += 1;
          breakdown.push('+1 Follow-up sent in 3–7 day window');
        } else if (days < 2 && days >= 0) {
          score -= 1;
          breakdown.push('-1 Follow-up sent too soon (<2 days)');
        }
      }
    }
  }

  if ((app.contacts || []).length > 1) {
    score += 2;
    breakdown.push('+2 Multiple contacts at company');
  }

  // Last outreach date
  const outreachTypes = ['follow-up', 'applied', 'screen', 'interview', 'assessment'];
  const lastOutreach = timeline
    .filter((e) => outreachTypes.includes(e.type))
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

  if (lastOutreach) {
    const daysSinceOutreach = daysSince(lastOutreach.date);
    if (daysSinceOutreach > 14 && !hasReply) {
      score -= 2;
      breakdown.push('-2 Last outreach >14 days ago with no response');
    }
  }

  if (app.stage === 'Closed') {
    score = app.status === 'WITHDRAWN' ? 5 : 3;
    breakdown.push('Closed application');
  }

  const clamped = Math.min(10, Math.max(0, score));
  return { score: clamped, breakdown };
}

export function getScoreColor(score) {
  if (score >= 8) return 'green';
  if (score >= 5) return 'amber';
  return 'red';
}

export function getNextAction(app) {
  if (app.stage === 'Closed') return 'Closed — no action';

  if (app.hasNewActivity) return 'New email — review and respond if needed';

  if (app.deadline) {
    const daysLeft = Math.ceil(
      (new Date(app.deadline) - new Date()) / (1000 * 60 * 60 * 24)
    );
    if (daysLeft <= 7) {
      const d = new Date(app.deadline);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `URGENT: Submit by ${label} (${daysLeft} day${daysLeft !== 1 ? 's' : ''})`;
    }
  }

  if (app.stage === 'Assessment') {
    const assessmentEntry = [...(app.timeline || [])]
      .reverse()
      .find((e) => e.type === 'assessment');
    if (assessmentEntry && daysSince(assessmentEntry.date) < 7) {
      const estDate = new Date(assessmentEntry.date);
      estDate.setDate(estDate.getDate() + 7);
      const label = estDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `Hold — await response (est. ${label})`;
    }
  }

  if (app.stage === 'Recruiter Screen') {
    const followUps = (app.timeline || []).filter((e) => e.type === 'follow-up');
    const lastFollowUp = followUps.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    if (lastFollowUp) {
      const days = daysSince(lastFollowUp.date);
      if (days >= 7 && days <= 14) {
        const checkInDate = new Date();
        checkInDate.setDate(checkInDate.getDate() + (11 - days));
        const label = checkInDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `Send final check-in on ${label}`;
      }
      if (days > 14) {
        return 'Send final check-in — overdue';
      }
    }
  }

  const daysApplied = daysSince(app.appliedAt);
  if (daysApplied > 60) return 'Mark stale or close';
  if (daysApplied > 30) return 'Optional: light LinkedIn engagement';
  return 'Monitor';
}

export function computeHealthGrade(applications) {
  const active = applications.filter((a) => a.stage !== 'Closed');

  const advancedStages = ['Recruiter Screen', 'Assessment', 'First Interview', 'Final Round', 'Offer Received'];
  const advanced = active.filter((a) => advancedStages.includes(a.stage));

  const recentActivity = active.filter((a) => {
    const last = [...(a.timeline || [])].sort((x, y) => new Date(y.date) - new Date(x.date))[0];
    return last && daysSince(last.date) < 14;
  });

  const responseRate = active.length
    ? active.filter((a) => {
        const { score } = computeCommScore(a);
        return score >= 6;
      }).length / active.length
    : 0;

  if (advanced.length >= 2 && recentActivity.length >= 3) return 'A';
  if (advanced.length >= 1 && responseRate >= 0.3) return 'B';
  if (recentActivity.length >= 2 || responseRate >= 0.15) return 'C';
  return 'D';
}

export function getHealthGradeNarrative(grade) {
  switch (grade) {
    case 'A': return '2+ processes advanced past recruiter screen with recent activity. Strong pipeline.';
    case 'B': return 'Active pipeline with mixed responsiveness. Keep following up.';
    case 'C': return 'Few responses, mostly waiting. Consider broadening outreach.';
    case 'D': return 'Pipeline is stale across the board. Prioritize new outreach immediately.';
    default: return '';
  }
}
