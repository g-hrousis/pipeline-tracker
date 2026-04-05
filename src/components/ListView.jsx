import { useState } from 'react';
import { useApp } from '../App.jsx';
import { STAGES } from '../data/applications.js';
import { computeCommScore, getScoreColor, getDaysInStage, getNextAction } from '../utils/scoring.js';

function getInitials(company) {
  return company.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

const COLUMNS = [
  { key: 'company', label: 'Company' },
  { key: 'role', label: 'Role' },
  { key: 'stage', label: 'Stage' },
  { key: 'priority', label: 'Priority' },
  { key: 'daysInStage', label: 'Days' },
  { key: 'commScore', label: 'Score' },
  { key: 'deadline', label: 'Deadline' },
  { key: 'nextAction', label: 'Next Action' },
];

export default function ListView() {
  const { state, dispatch, addToast } = useApp();
  const [sortKey, setSortKey] = useState('priority');
  const [sortDir, setSortDir] = useState('asc');

  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };

  const apps = state.applications
    .filter((a) => state.showClosed || a.stage !== 'Closed')
    .map((a) => ({
      ...a,
      daysInStage: getDaysInStage(a),
      commScore: computeCommScore(a).score,
      nextAction: getNextAction(a),
    }))
    .sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === 'priority') { av = priorityOrder[av] ?? 3; bv = priorityOrder[bv] ?? 3; }
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? cmp : -cmp;
    });

  function handleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function handleStageChange(app, newStage) {
    dispatch({ type: 'MOVE_STAGE', payload: { id: app.id, stage: newStage } });
    addToast({ type: 'info', message: `${app.company} moved to ${newStage}` });
  }

  function priorityBadge(p) {
    const map = { HIGH: 'amber', MEDIUM: 'blue', LOW: 'gray' };
    return <span className={`badge badge--${map[p] || 'gray'}`}>{p}</span>;
  }

  function scoreBadge(score) {
    const color = getScoreColor(score);
    return <span className={`kanban-card__score kanban-card__score--${color}`}>{score}/10</span>;
  }

  return (
    <div className="list-view">
      <div className="list-toolbar">
        <label className="kanban-toolbar__label">
          <input
            type="checkbox"
            checked={state.showClosed}
            onChange={() => dispatch({ type: 'TOGGLE_SHOW_CLOSED' })}
          />
          Show Closed
        </label>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {apps.length} application{apps.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="list-table-wrap">
        <table className="list-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={sortKey === col.key ? 'sorted' : ''}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="sort-indicator">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {apps.map((app) => (
              <tr
                key={app.id}
                className={app.stage === 'Closed' ? 'row--closed' : ''}
                onClick={() => dispatch({ type: 'SELECT_APP', payload: app.id })}
              >
                <td>
                  <div className="company-cell">
                    <div className="company-avatar">{getInitials(app.company)}</div>
                    <span style={{ fontWeight: 600 }}>{app.company}</span>
                    {app.hasNewActivity && (
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block', marginLeft: 4 }} />
                    )}
                  </div>
                </td>
                <td style={{ color: 'var(--text-secondary)', maxWidth: 160 }}>{app.role}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <select
                    className="stage-select"
                    value={app.stage}
                    onChange={(e) => handleStageChange(app, e.target.value)}
                  >
                    {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td>{priorityBadge(app.priority)}</td>
                <td style={{ color: 'var(--text-muted)' }}>{app.daysInStage}d</td>
                <td>{scoreBadge(app.commScore)}</td>
                <td style={{ color: app.deadline ? 'var(--red)' : 'var(--text-muted)' }}>
                  {app.deadline
                    ? new Date(app.deadline + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '—'}
                </td>
                <td style={{
                  color: app.nextAction.startsWith('URGENT') ? 'var(--red)' : 'var(--text-muted)',
                  fontWeight: app.nextAction.startsWith('URGENT') ? 600 : 400,
                  maxWidth: 200,
                }}>
                  {app.nextAction}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
