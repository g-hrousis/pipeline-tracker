import { useEffect, useRef, useState } from 'react';
import { useApp } from '../App.jsx';

export default function ResumeModal({ onClose }) {
  const { state, handleResumeUpdate } = useApp();
  const { resumeText, resumeName, isScoring } = state;

  const [text, setText] = useState(resumeText || '');
  const [name, setName] = useState(resumeName || '');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const closeRef = useRef(null);
  const textareaRef = useRef(null);

  // Focus trap
  useEffect(() => {
    const prev = document.activeElement;
    closeRef.current?.focus();
    return () => prev?.focus();
  }, []);

  // Escape to close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setText(e.target.result);
      setName(file.name);
    };
    reader.readAsText(file);
  }

  function onFileChange(e) {
    handleFile(e.target.files[0]);
  }

  function onDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md'))) {
      handleFile(file);
    }
  }

  function onDragOver(e) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave() {
    setIsDragging(false);
  }

  function handleSave() {
    handleResumeUpdate(text.trim(), name || 'Resume');
    onClose();
  }

  function handleClear() {
    setText('');
    setName('');
    handleResumeUpdate('', '');
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const hasResume = !!text.trim();

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal resume-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Resume & Fit Scoring"
      >
        {/* Header */}
        <div className="modal__header">
          <div className="resume-modal__icon">📄</div>
          <div className="modal__title-group">
            <div className="modal__company">Resume & Fit Scoring</div>
            <div className="modal__role">
              {hasResume
                ? `${name || 'Resume'} · ${wordCount.toLocaleString()} words`
                : 'Upload or paste your resume to score all applications'}
            </div>
          </div>
          <button
            ref={closeRef}
            className="modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="modal__body">
          {/* Upload zone */}
          <div className="modal__section">
            <div className="modal__section-title">Resume Text</div>
            <div
              className={`resume-upload-zone${isDragging ? ' resume-upload-zone--dragging' : ''}`}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => !isDragging && fileInputRef.current?.click()}
            >
              {hasResume ? (
                <div className="resume-upload-zone__loaded">
                  <span className="resume-upload-zone__filename">📄 {name || 'Resume'}</span>
                  <span className="resume-upload-zone__wordcount">{wordCount.toLocaleString()} words loaded</span>
                  <span className="resume-upload-zone__hint">Click or drop to replace</span>
                </div>
              ) : (
                <div className="resume-upload-zone__empty">
                  <span className="resume-upload-zone__arrow">↑</span>
                  <span>Drop a .txt or .md file, or click to browse</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,text/plain"
              style={{ display: 'none' }}
              onChange={onFileChange}
            />
          </div>

          {/* Paste textarea */}
          <div className="modal__section">
            <div className="modal__section-title">
              Or Paste Resume Text
              {hasResume && (
                <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--green)', fontWeight: 600 }}>
                  ✓ Loaded
                </span>
              )}
            </div>
            <textarea
              ref={textareaRef}
              className="notes-area resume-textarea"
              value={text}
              onChange={(e) => { setText(e.target.value); if (!name) setName('Resume'); }}
              placeholder="Paste your resume text here…&#10;&#10;The full text will be sent to Claude for fit analysis. Include your work experience, skills, education, and any relevant accomplishments."
              onClick={(e) => e.stopPropagation()}
              rows={12}
            />
          </div>

          {/* What this does */}
          {!hasResume && (
            <div className="modal__section">
              <div className="resume-info-box">
                <div className="resume-info-box__title">How fit scoring works</div>
                <ul className="resume-info-box__list">
                  <li>Claude compares your resume against each application's role and company</li>
                  <li>Each app receives a score from 1–10 with strengths, gaps, and a recommendation</li>
                  <li>Scores appear as colored badges on Kanban cards and in card modals</li>
                  <li>Add a job description inside any card for more precise scoring</li>
                  <li>Re-score anytime after updating your resume or adding a JD</li>
                </ul>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="modal__section">
            <div className="resume-modal__actions">
              {hasResume && (
                <button
                  className="resume-modal__btn resume-modal__btn--clear"
                  onClick={handleClear}
                  disabled={isScoring}
                >
                  Clear Resume
                </button>
              )}
              <button
                className="resume-modal__btn resume-modal__btn--save"
                onClick={handleSave}
                disabled={!text.trim() || isScoring}
              >
                {isScoring ? (
                  <>
                    <span className="sync-btn__spinner" />
                    Scoring all apps…
                  </>
                ) : hasResume ? (
                  'Save & Re-score All Apps'
                ) : (
                  'Save & Score All Apps'
                )}
              </button>
            </div>
            {isScoring && (
              <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                Running Claude fit analysis across all active applications…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
