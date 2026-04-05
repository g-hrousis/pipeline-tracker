import { useEffect, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { STAGES } from '../data/applications.js';
import { computeCommScore, getScoreColor, getDaysInStage, getNextAction } from '../utils/scoring.js';

const TIMELINE_ICONS = {
  applied: '📝',
  screen: '📞',
  interview: '🎙',
  assessment: '📋',
  offer: '🎉',
  rejection: '❌',
  note: '💬',
  email: '📨',
  'follow-up': '✉',
  'stage-change': '→',
  default: '•',
};

const EMAIL_TYPE_COLORS = {
  reply: 'var(--blue)',
  invite: 'var(--green)',
  assessment: 'var(--amber)',
  rejection: 'var(--red)',
  offer: 'var(--green)',
  other: 'var(--gray)',
};

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(company) {
  return company.split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

export default function CardModal({ app }) {
  const { dispatch, addToast } = useApp();
  const [notes, setNotes] = useState(app.notes || '');
  const [contacts, setContacts] = useState(app.contacts || []);
  const [showSaved, setShowSaved] = useState(false);
  const notesTimer = useRef(null);
  const closeRef = useRef(null);

  // Focus trap
  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    return () => prev?.focus();
  }, []);

  // Escape to close
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') dispatch({ type: 'DESELECT_APP' });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch]);

  // Sync local state when app changes
  useEffect(() => {
    setNotes(app.notes || '');
    setContacts(app.contacts || []);
  }, [app.id]);

  const { score, breakdown } = computeCommScore(app);
  const scoreColor = getScoreColor(score);
  const daysInStage = getDaysInStage(app);
  const nextAction = getNextAction(app);
  const isUrgent = nextAction.startsWith('URGENT');

  function saveNotes(val) {
    clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      dispatch({ type: 'UPDATE_APPLICATION', payload: { id: app.id, updates: { notes: val } } });
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 1800);
    }, 500);
  }

  function handleNotesChange(e) {
    setNotes(e.target.value);
    saveNotes(e.target.value);
  }

  function saveContacts(updated) {
    setContacts(updated);
    dispatch({ type: 'UPDATE_APPLICATION', payload: { id: app.id, updates: { contacts: updated } } });
  }

  function addContact() {
    const c = { id: `c-${Date.now()}`, name: '', title: '', relationship: '', lastContacted: '' };
    saveContacts([...contacts, c]);
  }

  function removeContact(id) {
    saveContacts(contacts.filter((c) => c.id !== id));
  }

  function updateContact(id, field, value) {
    saveContacts(contacts.map((c) => c.id === id ? { ...c, [field]: value } : c));
  }

  function handleStageChange(e) {
    dispatch({ type: 'MOVE_STAGE', payload: { id: app.id, stage: e.target.value } });
    addToast({ type: 'info', message: `${app.company} moved to ${e.target.value}` });
  }

  const sortedTimeline = [...(app.timeline || [])].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  const recentEmails = (app.gmailThreads || []).slice(0, 3);

  return (
    <div
      className="modal-backdrop"
      onClick={() => dispatch({ type: 'DESELECT_APP' })}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="modal__header">
          <div className="modal__avatar">{getInitials(app.company)}</div>
          <div className="modal__title-group">
            <div className="modal__company">{app.company}</div>
            <div className="modal__role">{app.role}</div>
            <div className="modal__meta">
              <select
                className="stage-select"
                value={app.stage}
                onChange={handleStageChange}
                onClick={(e) => e.stopPropagation()}
                style={{ width: 'auto', minWidth: 120 }}
              >
                {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {app.priority === 'HIGH' && <span className="badge badge--amber">High Priority</span>}
              {app.stage === 'Closed' && (
                <span className={`badge badge--${app.status === 'WITHDRAWN' ? 'gray' : 'red'}`}>
                  {app.status}
                </span>
              )}
              {app.hasNewActivity && <span className="badge badge--green">New Activity</span>}
              <span className="modal__days">{daysInStage}d in stage</span>
            </div>
          </div>
          <button
            ref={closeRef}
            className="modal__close"
            onClick={() => dispatch({ type: 'DESELECT_APP' })}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="modal__body">
          {/* Next Action */}
          <div className="modal__section">
            <div className="modal__section-title">Recommended Next Action</div>
            <div className={`next-action-box${isUrgent ? ' next-action-box--urgent' : (nextAction === 'Monitor' || nextAction.startsWith('Optional') ? ' next-action-box--monitor' : '')}`}>
              {isUrgent ? '⚠ ' : ''}{nextAction}
            </div>
          </div>

          {/* Contacts */}
          <div className="modal__section">
            <div className="modal__section-title">Contacts</div>
            <div className="contact-list">
              {contacts.map((c) => (
                <div key={c.id} className="contact-item">
                  <input
                    placeholder="Name"
                    value={c.name}
                    onChange={(e) => updateContact(c.id, 'name', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <input
                    placeholder="Title"
                    value={c.title}
                    onChange={(e) => updateContact(c.id, 'title', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <input
                    placeholder="Relationship"
                    value={c.relationship}
                    onChange={(e) => updateContact(c.id, 'relationship', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <input
                    type="date"
                    value={c.lastContacted}
                    onChange={(e) => updateContact(c.id, 'lastContacted', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontSize: 11, padding: '4px 6px' }}
                  />
                  <button className="contact-item__remove" onClick={() => removeContact(c.id)}>✕</button>
                </div>
              ))}
            </div>
            <button className="add-contact-btn" onClick={addContact}>+ Add Contact</button>
          </div>

          {/* Timeline */}
          <div className="modal__section">
            <div className="modal__section-title">Timeline</div>
            <div className="timeline">
              {sortedTimeline.map((entry, i) => (
                <div key={i} className="timeline-entry">
                  <div className="timeline-entry__icon">
                    {TIMELINE_ICONS[entry.type] || TIMELINE_ICONS.default}
                  </div>
                  <div className="timeline-entry__content">
                    <div className="timeline-entry__date">{formatDate(entry.date)}</div>
                    <div className="timeline-entry__note">{entry.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Gmail Emails */}
          <div className="modal__section">
            <div className="modal__section-title">Recent Gmail Activity</div>
            {recentEmails.length > 0 ? (
              <div className="gmail-thread-list">
                {recentEmails.map((email, i) => (
                  <div key={email.id || i} className="gmail-thread">
                    <div className="gmail-thread__top">
                      <div className="gmail-thread__subject">{email.subject || '(No subject)'}</div>
                      <div className="gmail-thread__date">
                        {email.date ? new Date(email.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                      </div>
                    </div>
                    <div className="gmail-thread__from">{email.from}</div>
                    <div className="gmail-thread__snippet">{email.snippet || email.summary}</div>
                    <div className="gmail-thread__footer">
                      {email.emailType && email.emailType !== 'other' && (
                        <span className="gmail-thread__type" style={{ color: EMAIL_TYPE_COLORS[email.emailType] || 'var(--gray)' }}>
                          {email.emailType}
                        </span>
                      )}
                      {email.gmailUrl && (
                        <a
                          href={email.gmailUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gmail-thread__link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View in Gmail ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="gmail-empty">
                No emails synced yet. Click "Sync Gmail" in the header.
              </div>
            )}
          </div>

          {/* Communication Score */}
          <div className="modal__section">
            <div className="modal__section-title">Communication Score</div>
            <div className="score-display">
              <div className={`score-number score-number--${scoreColor}`}>{score}</div>
              <div className="score-breakdown">
                {breakdown.map((item, i) => (
                  <div key={i} className="score-breakdown__item">{item}</div>
                ))}
                {breakdown.length === 0 && (
                  <div className="score-breakdown__item" style={{ color: 'var(--text-muted)' }}>
                    Baseline score — add contacts and timeline events
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="modal__section">
            <div className="modal__section-title">Notes</div>
            <textarea
              className="notes-area"
              value={notes}
              onChange={handleNotesChange}
              placeholder="Add notes about this application…"
              onClick={(e) => e.stopPropagation()}
            />
            <div className={`notes-save-indicator${showSaved ? ' notes-save-indicator--visible' : ''}`}>
              ✓ Saved
            </div>
          </div>

          {/* Documents */}
          <div className="modal__section">
            <div className="modal__section-title">Documents</div>
            {(app.documents || []).length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                No documents added. Note resume version or cover letter details here.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {app.documents.map((doc, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{doc.name}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
