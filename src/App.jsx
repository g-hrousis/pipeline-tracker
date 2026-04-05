import { createContext, useContext, useReducer, useState, useEffect, useRef, useCallback } from 'react';
import { defaultApplications } from './data/applications.js';
import {
  saveApplications, loadApplications,
  saveSyncTimestamp, loadSyncTimestamp,
  saveAutoSyncTimestamp, loadAutoSyncTimestamp,
  saveSuggestedApps, loadSuggestedApps,
  saveDismissedSuggestions, loadDismissedSuggestions,
} from './utils/storage.js';
import { syncAllApplications, detectNewApplications } from './utils/gmail.js';
import Header from './components/Header.jsx';
import UrgentBanner from './components/UrgentBanner.jsx';
import KanbanBoard from './components/KanbanBoard.jsx';
import ListView from './components/ListView.jsx';
import Analytics from './components/Analytics.jsx';
import CardModal from './components/CardModal.jsx';
import AddModal from './components/AddModal.jsx';
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
        ...action.payload,
      };
      return { ...state, applications: [...state.applications, newApp] };
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
          timeline: [
            ...a.timeline,
            { date: TODAY, type: 'stage-change', note: `Moved to ${stage}` },
          ],
        };
      });
      return { ...state, applications: apps };
    }

    case 'SET_VIEW':
      return { ...state, view: action.payload };

    case 'TOGGLE_SHOW_CLOSED':
      return { ...state, showClosed: !state.showClosed };

    case 'SELECT_APP': {
      // Clear hasNewActivity when opening modal
      const apps = state.applications.map((a) =>
        a.id === action.payload ? { ...a, hasNewActivity: false } : a
      );
      return { ...state, selectedAppId: action.payload, applications: apps };
    }

    case 'DESELECT_APP':
      return { ...state, selectedAppId: null };

    case 'ADD_TOAST': {
      const toast = { id: Date.now(), ...action.payload };
      return { ...state, toasts: [...state.toasts, toast] };
    }

    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.payload) };

    case 'GMAIL_SYNC_START':
      return { ...state, isSyncing: true };

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
      const results = action.payload; // [{appId, threads, hasNewActivity}]
      const apps = state.applications.map((a) => {
        const match = results.find((r) => r.appId === a.id);
        if (!match) return a;
        return {
          ...a,
          gmailThreads: match.threads,
          hasNewActivity: a.hasNewActivity || match.hasNewActivity,
        };
      });
      return { ...state, applications: apps };
    }

    case 'SET_SUGGESTED_APPS':
      return { ...state, suggestedApps: action.payload };

    case 'ACCEPT_SUGGESTION': {
      const suggestion = state.suggestedApps.find((s) => s.id === action.payload);
      if (!suggestion) return state;
      const newApp = { ...suggestion, id: generateId(), source: 'gmail-detected' };
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
  showAddModal: false,
};

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [showAddModal, setShowAddModal] = useState(false);
  const syncInProgress = useRef(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const apps = loadApplications();
    const syncedAt = loadSyncTimestamp();
    const autoSync = loadAutoSyncTimestamp();
    const suggested = loadSuggestedApps();
    const dismissed = loadDismissedSuggestions();
    dispatch({
      type: 'HYDRATE',
      payload: {
        applications: apps || defaultApplications,
        gmailSyncedAt: syncedAt,
        lastAutoSync: autoSync,
        suggestedApps: suggested || [],
        dismissedSuggestions: dismissed || [],
      },
    });
  }, []);

  // Persist applications on change
  useEffect(() => {
    if (state.applications.length > 0) {
      saveApplications(state.applications);
    }
  }, [state.applications]);

  // Persist suggested apps
  useEffect(() => {
    saveSuggestedApps(state.suggestedApps);
  }, [state.suggestedApps]);

  // Persist dismissed
  useEffect(() => {
    saveDismissedSuggestions(state.dismissedSuggestions);
  }, [state.dismissedSuggestions]);

  // Persist sync timestamps
  useEffect(() => {
    if (state.gmailSyncedAt) saveSyncTimestamp(state.gmailSyncedAt);
  }, [state.gmailSyncedAt]);
  useEffect(() => {
    if (state.lastAutoSync) saveAutoSyncTimestamp(state.lastAutoSync);
  }, [state.lastAutoSync]);

  const runGmailSync = useCallback(async (isAuto = false) => {
    if (syncInProgress.current) return;
    syncInProgress.current = true;
    dispatch({ type: 'GMAIL_SYNC_START' });

    try {
      const results = await syncAllApplications(state.applications);
      dispatch({ type: 'SET_GMAIL_DATA', payload: results });

      const newActivityCount = results.filter((r) => r.hasNewActivity).length;

      // Detect new applications from Gmail
      try {
        const suggestions = await detectNewApplications(state.applications);
        const fresh = suggestions.filter(
          (s) => !state.dismissedSuggestions.includes(s.id)
        );
        if (fresh.length > 0) {
          dispatch({ type: 'SET_SUGGESTED_APPS', payload: fresh });
        }
      } catch {
        // silent
      }

      dispatch({ type: 'GMAIL_SYNC_COMPLETE', payload: { isAuto } });

      if (!isAuto) {
        if (newActivityCount > 0) {
          dispatch({
            type: 'ADD_TOAST',
            payload: {
              type: 'success',
              message: `Gmail synced — ${newActivityCount} new activit${newActivityCount === 1 ? 'y' : 'ies'} detected`,
            },
          });
        } else {
          dispatch({
            type: 'ADD_TOAST',
            payload: { type: 'info', message: 'Gmail synced — no new activity' },
          });
        }
      }
    } catch (err) {
      dispatch({ type: 'GMAIL_SYNC_COMPLETE', payload: { isAuto } });
      if (!isAuto) {
        dispatch({
          type: 'ADD_TOAST',
          payload: { type: 'error', message: 'Gmail sync unavailable — ensure MCP server is running' },
        });
      }
    } finally {
      syncInProgress.current = false;
    }
  }, [state.applications, state.dismissedSuggestions]);

  // Auto-sync on mount (after 3s delay)
  useEffect(() => {
    const t = setTimeout(() => runGmailSync(true), 3000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-sync every 5 minutes
  useEffect(() => {
    const id = setInterval(() => runGmailSync(true), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [runGmailSync]);

  const urgentApps = state.applications.filter((a) => {
    if (!a.deadline) return false;
    const daysLeft = Math.ceil((new Date(a.deadline) - new Date()) / (1000 * 60 * 60 * 24));
    return daysLeft <= 7 && a.stage !== 'Closed';
  });

  const selectedApp = state.applications.find((a) => a.id === state.selectedAppId) || null;

  const addToast = useCallback((toast) => dispatch({ type: 'ADD_TOAST', payload: toast }), []);

  const ctx = { state, dispatch, addToast, runGmailSync, showAddModal, setShowAddModal };

  return (
    <AppContext.Provider value={ctx}>
      <Header />
      {urgentApps.length > 0 && <UrgentBanner apps={urgentApps} />}
      {state.suggestedApps.length > 0 && <SuggestionBar />}
      <main className="app-main">
        {state.view === 'kanban' && <KanbanBoard />}
        {state.view === 'list' && <ListView />}
        {state.view === 'analytics' && <Analytics />}
      </main>
      <button className="fab" onClick={() => setShowAddModal(true)} title="Add Application">+</button>
      {selectedApp && <CardModal app={selectedApp} />}
      {showAddModal && <AddModal onClose={() => setShowAddModal(false)} />}
      <Toast />
    </AppContext.Provider>
  );
}

