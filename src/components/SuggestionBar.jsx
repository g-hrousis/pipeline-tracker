import { useApp } from '../App.jsx';

export default function SuggestionBar() {
  const { state, dispatch, addToast } = useApp();
  const { suggestedApps } = state;
  if (!suggestedApps.length) return null;

  const accept = (id) => {
    dispatch({ type: 'ACCEPT_SUGGESTION', payload: id });
    addToast({ type: 'success', message: 'Application added to pipeline' });
  };

  const dismiss = (id) => {
    dispatch({ type: 'DISMISS_SUGGESTION', payload: id });
  };

  return (
    <div className="suggestion-bar">
      <div className="suggestion-bar__header">
        <span className="suggestion-bar__title">✦ New Jobs Detected via Gmail</span>
      </div>
      <div className="suggestion-bar__list">
        {suggestedApps.map((app) => (
          <div key={app.id} className="suggestion-chip">
            <div className="suggestion-chip__info">
              <span className="suggestion-chip__company">{app.company}</span>
              <span className="suggestion-chip__role">{app.role}</span>
            </div>
            <button className="suggestion-chip__add" onClick={() => accept(app.id)}>
              + Add
            </button>
            <button className="suggestion-chip__dismiss" onClick={() => dismiss(app.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
