import { useState } from 'react';

export default function UrgentBanner({ apps }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="urgent-banner">
      <span className="urgent-banner__icon">⚠</span>
      <div className="urgent-banner__text">
        {apps.map((app) => {
          const daysLeft = Math.ceil(
            (new Date(app.deadline) - new Date()) / (1000 * 60 * 60 * 24)
          );
          const label = new Date(app.deadline).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric',
          });
          return (
            <span key={app.id} className="urgent-banner__item">
              <strong>{app.company}</strong> — {app.role} — submit by {label} ({daysLeft} day{daysLeft !== 1 ? 's' : ''})
            </span>
          );
        })}
      </div>
      <button className="urgent-banner__close" onClick={() => setDismissed(true)}>✕</button>
    </div>
  );
}
