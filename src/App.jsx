import { createContext, useContext, useReducer, useState, useEffect, useRef, useCallback } from 'react';
import { defaultApplications } from './data/applications.js';
import {
  saveApplications, loadApplications,
  saveSyncTimestamp, loadSyncTimestamp,
  saveAutoSyncTimestamp, loadAutoSyncTimestamp,
  saveSuggestedApps, loadSuggestedApps,
  saveDismissedSuggestions, loadDismissedSuggestions,
  saveResumeText, loadResumeText,
  saveResumeName, loadResumeName,
  saveFitScores, loadFitScores,
} from './utils/storage.js';
import { syncAllApplications, detectNewApplications } from './utils/gmail.js';
import { scoreAllApps } from './utils/fitScoring.js';
import Header from './components/Header.jsx';
import UrgentBanner from './components/UrgentBanner.jsx';
import KanbanBoard from './components/KanbanBoard.jsx';
import ListView from './components/ListView.jsx';
import Analytics from './components/Analytics.jsx';
import CardModal from './components/CardModal.jsx';
import AddModal from './components/AddModal.jsx';
import ResumeModal from './components/ResumeModal.jsx';
import Toast from './components/Toast.jsx';
import SuggestionBar from './components/SuggestionBar.jsx';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const TODAY = new Date().toISOString().split('T')[0];

function generateId() {
  return `app-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function reducer(state, action) {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, ...action.payload };

    case 'ADD_APPLICATION': {
      const newApp = {
        id: generateId(),
        stage: 'Targeting',
        priority: 'MEDIUM',
        status: 'Under Review',
        deadline: null,
        appliedAt: TODAY,
        stageEnteredAt: TODAY,
        contacts: [],
        timeline: [{ date: TODAY, type: 'applied', note: 'Application added' }],
        notes: '',
        documents: [],
        gmailThreads: [],
        hasNewActivity: false,
        jobDescription: '',
        source: 'manual',
        ...action.payload,
      };
      return { ...state, applications: [...state.applications, newApp] };
    }

    case 'ADD_APPLICATIONS_BULK': {
      // Auto-detected apps from Gmail — prepend so they appear first
      const existingIds = new Set(state.applications.map((a) => a.company.toLowerCase()));
      const fresh = action.payload.filter(
        (a) => !existingIds.has(a.company.toLowerCase())
      );
      return { ...state, applications: [...fresh, ...state.applications] };
    }

    case 'UPDATE_APPLICATION': {
      const apps = state.applications.map((a) =>
        a.id === action.payload.id ? { ...a, ...action.payload.updates } : a
      );
      return { ...state, applications: apps };
    }

    case 'MOVE_STAGE': {
      const { id, stage } = action.payload;
      const apps = state.applications.map((a) => {
        if (a.id !== id) return a;
        return {
          ...a,
          stage,
          stageEnteredAt: TODAY,
          timeline: [...a.timeline, { date: TODAY, type: 'stage-change', note: `Moved to ${stage}` }],
        };
      });
      return { ...state, applications: apps };
    }

    case 'SET_VIEW':       return { ...state, view: action.payload };
    case 'TOGGLE_SHOW_CLOSED': return { ...state, showClosed: !state.showClosed };

    case 'SELECT_APP': {
      const apps = state.applications.map((a) =>
        a.id === action.payload ? { ...a, hasNewActivity: false } : a
      );
      return { ...state, selectedAppId: action.payload, applications: apps };
    }
    case 'DESELECT_APP':  return { ...state, selectedAppId: null };

    case 'ADD_TOAST': {
      const toast = { id: Date.now(), ...action.payload };
      return { ...state, toasts: [...state.toasts, toast] };
    }
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.payload) };

    case 'GMAIL_SYNC_START':    return { ...state, isSyncing: true };
    case 'GMAIL_SYNC_COMPLETE': {
      const ts = new Date().toISOString();
      return {
        ...state,
        isSyncing: false,
        gmailSyncedAt: ts,
        ...(action.payload?.isAuto ? { lastAutoSync: ts } : {}),
      };
    }
    case 'SET_GMAIL_DATA': {
      const results = action.payload;
      const apps = state.applications.map((a) => {
        const match = results.find((r) => r.appId === a.id);
        if (!match) return a;
        // Merge incoming threads with existing — deduplicate by id, newest first
        const existing = a.gmailThreads || [];
        const incoming = match.threads || [];
        const existingIds = new Set(existing.map((t) => t.id).filter(Boolean));
        const merged = [
          ...incoming.filter((t) => t.id && !existingIds.has(t.id)),
          ...existing,
        ].sort((x, y) => new Date(y.date || 0) - new Date(x.date || 0));
        return {
          ...a,
          gmailThreads: merged,
          hasNewActivity: a.hasNewActivity || match.hasNewActivity,
        };
      });
      return { ...state, applications: apps };
    }

    case 'SET_SUGGESTED_APPS':  return { ...state, suggestedApps: action.payload };
    case 'ACCEPT_SUGGESTION': {
      const suggestion = state.suggestedApps.find((s) => s.id === action.payload);
      if (!suggestion) return state;
      const newApp = { ...suggestion, id: generateId() };
      return {
        ...state,
        applications: [...state.applications, newApp],
        suggestedApps: state.suggestedApps.filter((s) => s.id !== action.payload),
        dismissedSuggestions: [...state.dismissedSuggestions, action.payload],
      };
    }
    case 'DISMISS_SUGGESTION':
      return {
        ...state,
        suggestedApps: state.suggestedApps.filter((s) => s.id !== action.payload),
        dismissedSuggestions: [...state.dismissedSuggestions, action.payload],
      };

    // ── Resume & Fit Scoring ────────────────────────────────────────────────
    case 'SET_RESUME':
      return { ...state, resumeText: action.payload.text, resumeName: action.payload.name };

    case 'SET_FIT_SCORES':
      return { ...state, fitScores: { ...state.fitScores, ...action.payload } };

    case 'SET_FIT_SCORE':
      return {
        ...state,
        fitScores: { ...state.fitScores, [action.payload.appId]: action.payload.result },
      };

    case 'SCORING_START':    return { ...state, isScoring: true };
    case 'SCORING_COMPLETE': return { ...state, isScoring: false };

    default:
      return state;
  }
}

const initialState = {
  applications: [],
  view: 'kanban',
  showClosed: false,
  selectedAppId: null,
  toasts: [],
  gmailSyncedAt: null,
  lastAutoSync: null,
  isSyncing: false,
  suggestedApps: [],
  dismissedSuggestions: [],
  resumeText: '',
  resumeName: '',
  fitScores: {},
  isScoring: false,
};

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const syncInProgress = useRef(false);
  const scoreInProgress = useRef(false);

  // ── Hydrate ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const apps       = loadApplications();
    const syncedAt   = loadSyncTimestamp();
    const autoSync   = loadAutoSyncTimestamp();
    const suggested  = loadSuggestedApps();
    const dismissed  = loadDismissedSuggestions();
    const resumeText = loadResumeText();
    const resumeName = loadResumeName();
    const fitScores  = loadFitScores();
    dispatch({
      type: 'HYDRATE',
      payload: {
        applications: apps || defaultApplications,
        gmailSyncedAt: syncedAt,
        lastAutoSync: autoSync,
        suggestedApps: suggested || [],
        dismissedSuggestions: dismissed || [],
        resumeText,
        resumeName,
        fitScores,
      },
    });
  }, []);

  // ── Persist ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.applications.length > 0) saveApplications(state.applications);
  }, [state.applications]);

  useEffect(() => { saveSuggestedApps(state.suggestedApps); }, [state.suggestedApps]);
  useEffect(() => { saveDismissedSuggestions(state.dismissedSuggestions); }, [state.dismissedSuggestions]);
  useEffect(() => { if (state.gmailSyncedAt) saveSyncTimestamp(state.gmailSyncedAt); }, [state.gmailSyncedAt]);
  useEffect(() => { if (state.lastAutoSync) saveAutoSyncTimestamp(state.lastAutoSync); }, [state.lastAutoSync]);
  useEffect(() => { saveResumeText(state.resumeText); saveResumeName(state.resumeName); }, [state.resumeText, state.resumeName]);
  useEffect(() => { saveFitScores(state.fitScores); }, [state.fitScores]);

  // ── Gmail Sync ───────────────────────────────────────────────────────────
  const runGmailSync = useCallback(async (isAuto = false) => {
    if (syncInProgress.current) return;
    syncInProgress.current = true;
    dispatch({ type: 'GMAIL_SYNC_START' });

    try {
      // 1. Sync existing apps
      const results = await syncAllApplications(state.applications);
      dispatch({ type: 'SET_GMAIL_DATA', payload: results });
      const newActivity = results.filter((r) => r.hasNewActivity).length;

      // 2. Detect & auto-create new apps
      let newApps = [];
      try {
        const detected = await detectNewApplications(state.applications);
        if (detected.length > 0) {
          dispatch({ type: 'ADD_APPLICATIONS_BULK', payload: detected });
          newApps = detected;

          // Auto-score fit for new apps if resume is available
          if (state.resumeText) {
            const scores = await scoreAllApps(detected, state.resumeText);
            if (Object.keys(scores).length > 0) {
              dispatch({ type: 'SET_FIT_SCORES', payload: scores });
            }
          }
        }
      } catch { /* silent — detection is best-effort */ }

      dispatch({ type: 'GMAIL_SYNC_COMPLETE', payload: { isAuto } });

      if (!isAuto) {
        const parts = [];
        if (newApps.length > 0)
          parts.push(`${newApps.length} new app${newApps.length > 1 ? 's' : ''} added: ${newApps.map((a) => a.company).join(', ')}`);
        if (newActivity > 0)
          parts.push(`${newActivity} update${newActivity > 1 ? 's' : ''} on existing apps`);

        dispatch({
          type: 'ADD_TOAST',
          payload: {
            type: parts.length > 0 ? 'success' : 'info',
            message: parts.length > 0 ? parts.join(' · ') : 'Gmail synced — no new activity',
          },
        });
      } else if (newApps.length > 0) {
        dispatch({
          type: 'ADD_TOAST',
          payload: {
            type: 'success',
            message: `${newApps.length} new application${newApps.length > 1 ? 's' : ''} auto-detected: ${newApps.slice(0, 3).map((a) => a.company).join(', ')}`,
          },
        });
      }
    } catch (err) {
      dispatch({ type: 'GMAIL_SYNC_COMPLETE', payload: { isAuto } });
      if (!isAuto) {
        dispatch({
          type: 'ADD_TOAST',
          payload: { type: 'error', message: 'Gmail sync unavailable — check API key or MCP auth' },
        });
      }
    } finally {
      syncInProgress.current = false;
    }
  }, [state.applications, state.resumeText]);

  // Auto-sync on mount (3s delay) + every 5 minutes
  useEffect(() => {
    const t = setTimeout(() => runGmailSync(true), 3000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  useEffect(() => {
    const id = setInterval(() => runGmailSync(true), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [runGmailSync]);

  // ── Resume & Fit Scoring ─────────────────────────────────────────────────
  const handleResumeUpdate = useCallback(async (text, name) => {
    dispatch({ type: 'SET_RESUME', payload: { text, name } });

    if (!text.trim()) return;
    if (scoreInProgress.current) return;
    scoreInProgress.current = true;
    dispatch({ type: 'SCORING_START' });

    dispatch({ type: 'ADD_TOAST', payload: { type: 'info', message: 'Scoring resume fit for all applications…' } });

    try {
      const scores = await scoreAllApps(state.applications, text);
      dispatch({ type: 'SET_FIT_SCORES', payload: scores });
      const count = Object.keys(scores).length;
      dispatch({
        type: 'ADD_TOAST',
        payload: { type: 'success', message: `Fit scores updated for ${count} application${count !== 1 ? 's' : ''}` },
      });
    } catch {
      dispatch({ type: 'ADD_TOAST', payload: { type: 'error', message: 'Fit scoring failed — check API key' } });
    } finally {
      dispatch({ type: 'SCORING_COMPLETE' });
      scoreInProgress.current = false;
    }
  }, [state.applications]);

  const rescoreSingleApp = useCallback(async (appId, jobDescription = '') => {
    const app = state.applications.find((a) => a.id === appId);
    if (!app || !state.resumeText) return;

    const { scoreFit } = await import('./utils/fitScoring.js');
    const result = await scoreFit(app, state.resumeText, jobDescription);
    if (result) dispatch({ type: 'SET_FIT_SCORE', payload: { appId, result } });
  }, [state.applications, state.resumeText]);

  const urgentApps = state.applications.filter((a) => {
    if (!a.deadline) return false;
    const daysLeft = Math.ceil((new Date(a.deadline) - new Date()) / (1000 * 60 * 60 * 24));
    return daysLeft <= 7 && a.stage !== 'Closed';
  });

  const selectedApp = state.applications.find((a) => a.id === state.selectedAppId) || null;

  const addToast = useCallback((toast) => dispatch({ type: 'ADD_TOAST', payload: toast }), []);

  const ctx = {
    state,
    dispatch,
    addToast,
    runGmailSync,
    handleResumeUpdate,
    rescoreSingleApp,
    showAddModal,
    setShowAddModal,
    showResumeModal,
    setShowResumeModal,
  };

  return (
    <AppContext.Provider value={ctx}>
      <Header />
      {urgentApps.length > 0 && <UrgentBanner apps={urgentApps} />}
      {state.suggestedApps.length > 0 && <SuggestionBar />}
      <main className="app-main">
        {state.view === 'kanban'    && <KanbanBoard />}
        {state.view === 'list'      && <ListView />}
        {state.view === 'analytics' && <Analytics />}
      </main>
      <button className="fab" onClick={() => setShowAddModal(true)} title="Add Application">+</button>
      {selectedApp    && <CardModal app={selectedApp} />}
      {showAddModal   && <AddModal onClose={() => setShowAddModal(false)} />}
      {showResumeModal && <ResumeModal onClose={() => setShowResumeModal(false)} />}
      <Toast />
    </AppContext.Provider>
  );
}
