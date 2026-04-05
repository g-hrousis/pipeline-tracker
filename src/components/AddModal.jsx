import { useState } from 'react';
import { useApp } from '../App.jsx';
import { STAGES } from '../data/applications.js';

const TODAY = new Date().toISOString().split('T')[0];

export default function AddModal({ onClose }) {
  const { dispatch, addToast } = useApp();
  const [form, setForm] = useState({
    company: '',
    role: '',
    stage: 'Applied',
    priority: 'MEDIUM',
    deadline: '',
    notes: '',
  });
  const [error, setError] = useState('');

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setError('');
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.company.trim()) { setError('Company name is required'); return; }
    if (!form.role.trim()) { setError('Role is required'); return; }

    dispatch({
      type: 'ADD_APPLICATION',
      payload: {
        company: form.company.trim(),
        role: form.role.trim(),
        stage: form.stage,
        priority: form.priority,
        deadline: form.deadline || null,
        notes: form.notes.trim(),
        appliedAt: TODAY,
        stageEnteredAt: TODAY,
        timeline: [{ date: TODAY, type: 'applied', note: `Added manually — ${form.stage}` }],
      },
    });

    addToast({ type: 'success', message: `${form.company.trim()} added to pipeline` });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal add-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="modal__header">
          <div className="modal__title-group">
            <div className="modal__company" style={{ fontSize: 14 }}>Add Application</div>
            <div className="modal__role">Track a new job opportunity</div>
          </div>
          <button className="modal__close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal__form">
            <div className="form-field">
              <label>Company *</label>
              <input
                value={form.company}
                onChange={(e) => set('company', e.target.value)}
                placeholder="e.g. Acme Corp"
                autoFocus
              />
            </div>

            <div className="form-field">
              <label>Role *</label>
              <input
                value={form.role}
                onChange={(e) => set('role', e.target.value)}
                placeholder="e.g. Business Analyst"
              />
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Stage</label>
                <select value={form.stage} onChange={(e) => set('stage', e.target.value)}>
                  {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Priority</label>
                <select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>

            <div className="form-field">
              <label>Deadline (optional)</label>
              <input
                type="date"
                value={form.deadline}
                onChange={(e) => set('deadline', e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Notes</label>
              <textarea
                className="notes-area"
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Initial notes, source, referral…"
                rows={3}
                style={{ minHeight: 60 }}
              />
            </div>

            {error && (
              <div style={{ fontSize: 11, color: 'var(--red)', padding: '4px 0' }}>{error}</div>
            )}
          </div>

          <div className="modal__actions">
            <button type="button" className="btn btn--secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn--primary">Add Application</button>
          </div>
        </form>
      </div>
    </div>
  );
}
