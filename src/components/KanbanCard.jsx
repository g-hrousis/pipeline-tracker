import { useDraggable } from '@dnd-kit/core';
import { useApp } from '../App.jsx';
import { computeCommScore, getScoreColor, getDaysInStage, isStale, getNextAction } from '../utils/scoring.js';

function getInitials(company) {
  return company
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export default function KanbanCard({ app, isOverlay = false }) {
  const { dispatch } = useApp();

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: app.id,
    disabled: isOverlay,
  });

  const { score } = computeCommScore(app);
  const scoreColor = getScoreColor(score);
  const daysInStage = getDaysInStage(app);
  const staleState = isStale(app);
  const nextAction = getNextAction(app);
  const isUrgent = nextAction.startsWith('URGENT');

  const priorityCls = `kanban-card--priority-${app.priority}`;
  const staleCls = staleState ? `kanban-card--stale-${staleState}` : '';
  const closedCls = app.stage === 'Closed' ? 'kanban-card--closed' : '';
  const overlayCls = isOverlay ? 'kanban-card--overlay' : '';
  const draggingStyle = isDragging ? { opacity: 0.4 } : {};

  return (
    <div
      ref={setNodeRef}
      className={`kanban-card ${priorityCls} ${staleCls} ${closedCls} ${overlayCls}`}
      style={draggingStyle}
      onClick={() => !isOverlay && dispatch({ type: 'SELECT_APP', payload: app.id })}
      {...(isOverlay ? {} : { ...listeners, ...attributes })}
    >
      <div className="kanban-card__top">
        <div className="kanban-card__avatar">{getInitials(app.company)}</div>
        <div className="kanban-card__info">
          <div className="kanban-card__company">{app.company}</div>
          <div className="kanban-card__role">{app.role}</div>
        </div>
        {app.hasNewActivity && <div className="kanban-card__activity-dot" title="New Gmail activity" />}
      </div>

      <div className="kanban-card__meta">
        <span className="kanban-card__days">{daysInStage}d in stage</span>
        {app.priority === 'HIGH' && <span className="badge badge--amber">High</span>}
        {app.stage === 'Closed' && (
          <span className={`badge badge--${app.status === 'WITHDRAWN' ? 'gray' : 'red'}`}>
            {app.status}
          </span>
        )}
        <span className={`kanban-card__score kanban-card__score--${scoreColor}`}>
          {score}/10
        </span>
      </div>

      <div className={`kanban-card__next-action${isUrgent ? ' kanban-card__next-action--urgent' : ''}`}>
        {isUrgent ? '⚠ ' : ''}{nextAction}
      </div>
    </div>
  );
}
