import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useApp } from '../App.jsx';
import { STAGES } from '../data/applications.js';
import KanbanCard from './KanbanCard.jsx';

function KanbanColumn({ stage, apps }) {
  const { isOver, setNodeRef } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={`kanban-column${isOver ? ' kanban-column--over' : ''}`}
    >
      <div className="kanban-column__header">
        <span className="kanban-column__title">{stage}</span>
        <span className="kanban-column__count">{apps.length}</span>
      </div>
      <div className="kanban-column__body">
        {apps.length === 0 ? (
          <div className="kanban-empty">No applications<br />in this stage</div>
        ) : (
          apps.map((app) => <KanbanCard key={app.id} app={app} />)
        )}
      </div>
    </div>
  );
}

export default function KanbanBoard() {
  const { state, dispatch, addToast } = useApp();
  const [activeApp, setActiveApp] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const visibleApps = state.showClosed
    ? state.applications
    : state.applications.filter((a) => a.stage !== 'Closed');

  const stagesToShow = state.showClosed
    ? STAGES
    : STAGES.filter((s) => s !== 'Closed');

  function handleDragStart(event) {
    const app = state.applications.find((a) => a.id === event.active.id);
    setActiveApp(app || null);
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveApp(null);
    if (!over) return;

    const newStage = over.id;
    const app = state.applications.find((a) => a.id === active.id);
    if (!app || app.stage === newStage) return;

    dispatch({ type: 'MOVE_STAGE', payload: { id: active.id, stage: newStage } });
    addToast({ type: 'info', message: `${app.company} moved to ${newStage}` });
  }

  function handleDragCancel() {
    setActiveApp(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="kanban-toolbar">
        <label className="kanban-toolbar__label">
          <input
            type="checkbox"
            checked={state.showClosed}
            onChange={() => dispatch({ type: 'TOGGLE_SHOW_CLOSED' })}
          />
          Show Closed
        </label>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {visibleApps.length} application{visibleApps.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="kanban-board">
        {stagesToShow.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            apps={visibleApps.filter((a) => a.stage === stage)}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeApp ? <KanbanCard app={activeApp} isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
