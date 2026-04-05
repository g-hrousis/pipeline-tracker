import { useApp } from '../App.jsx';
import { computeHealthGrade } from '../utils/scoring.js';

function formatDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function timeSince(isoString) {
  if (!isoString) return null;
  const diff = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function Header() {
  const { state, dispatch, runGmailSync } = useApp();
  const { applications, view, isSyncing, gmailSyncedAt } = state;

  const active = applications.filter((a) => a.stage !== 'Closed');
  const grade = computeHealthGrade(active);

  const urgentCount = applications.filter((a) => {
    if (!a.deadline) return false;
    const d = Math.ceil((new Date(a.deadline) - new Date()) / (1000 * 60 * 60 * 24));
    return d <= 7 && a.stage !== 'Closed';
  }).length;

  const syncLabel = timeSince(gmailSyncedAt);
  const today = new Date().toISOString().split('T')[0];

  return (
    <header className="header">
      <div className="header__brand">
        <div className="header__brand-dot" />
        Pipeline
      </div>

      <span className="header__date">{formatDate(today)}</span>

      <div className="header__spacer" />

      <span className={`header__grade header__grade--${grade}`}>
        {grade} Grade
      </span>

      {urgentCount > 0 && (
        <span className="header__deadline-count">
          ⚠ {urgentCount} deadline{urgentCount > 1 ? 's' : ''}
        </span>
      )}

      <button
        className="sync-btn"
        onClick={() => runGmailSync(false)}
        disabled={isSyncing}
        title="Sync Gmail"
      >
        {isSyncing ? (
          <span className="sync-btn__spinner" />
        ) : (
          <span>⟳</span>
        )}
        {isSyncing ? 'Syncing…' : 'Sync Gmail'}
      </button>

      {syncLabel && (
        <span className="sync-timestamp">Synced {syncLabel}</span>
      )}

      <div className="view-toggle">
        {['kanban', 'list', 'analytics'].map((v) => (
          <button
            key={v}
            className={`view-toggle__btn${view === v ? ' view-toggle__btn--active' : ''}`}
            onClick={() => dispatch({ type: 'SET_VIEW', payload: v })}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
    </header>
  );
}
