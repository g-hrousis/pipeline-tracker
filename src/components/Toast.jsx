import { useEffect, useState } from 'react';
import { useApp } from '../App.jsx';

const TOAST_ICONS = {
  success: '✓',
  info: 'ℹ',
  warning: '⚠',
  error: '✕',
};

const TOAST_DURATION = 3500;

function ToastItem({ toast, onDismiss }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 200);
    }, TOAST_DURATION);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  function dismiss() {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  }

  return (
    <div className={`toast toast--${toast.type}${exiting ? ' toast--exiting' : ''}`}>
      <span className="toast__icon">{TOAST_ICONS[toast.type] || 'ℹ'}</span>
      <span className="toast__msg">{toast.message}</span>
      <button className="toast__close" onClick={dismiss}>✕</button>
    </div>
  );
}

export default function Toast() {
  const { state, dispatch } = useApp();

  function dismiss(id) {
    dispatch({ type: 'REMOVE_TOAST', payload: id });
  }

  return (
    <div className="toast-stack">
      {state.toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}
