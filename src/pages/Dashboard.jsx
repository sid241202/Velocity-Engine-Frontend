import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Dashboard.css';
import { Zap, History, PlusSquare, Activity, BarChart3, Shield, AlertTriangle, RefreshCw, Send, ArrowRight, X } from 'lucide-react';
import RuleBuilderPage from '../components/RuleBuilderPage';
import SavedRulesSidebar from '../components/SavedRulesSidebar';
import RuleSummaryPanel from '../components/RuleSummaryPanel';
import LiveAnalysis from '../components/LiveAnalysis';
import AggregatedAnalysis from '../components/AggregatedAnalysis';
import HistoricalAnalysis from '../components/HistoricalAnalysis';
import ErrorBoundary from '../components/ErrorBoundary';
import PermissionGuard from '../components/PermissionGuard';
import { API_BASE } from '../config/appConfig';
import { toISTDatetimeLocal, parseISTStringToEpochMs } from '../utils/istUtils';
import { useRBAC } from '../context/RBACContext';
import { PERMISSIONS } from '../permissions';

// build's tab also doubles as the rule-edit surface (navigateToEdit routes
// here), so it accepts create OR update rather than requiring create alone.
const NAV_ITEMS = [
  { key: 'live',       label: 'Live Stream',       icon: Activity,   tip: 'Real-time event stream & breach detection', anyOf: [PERMISSIONS.LIVE_ANALYSIS_READ] },
  { key: 'agg',        label: 'Analytics',         icon: BarChart3,  tip: 'Aggregated rule analysis over a custom date range', anyOf: [PERMISSIONS.AGGREGATED_ANALYSIS_READ] },
  { key: 'historical', label: 'Historical Replay', icon: History,    tip: 'Replay and test rules on historical data', anyOf: [PERMISSIONS.HISTORICAL_ANALYSIS_READ] },
  { key: 'build',      label: 'Create Rule',       icon: PlusSquare, tip: 'Build a new anomaly detection rule', anyOf: [PERMISSIONS.RULES_CREATE, PERMISSIONS.RULES_UPDATE] },
  { key: 'summary',    label: 'Rule Summary',      icon: Shield,     tip: 'View and manage a specific rule', anyOf: [PERMISSIONS.RULES_READ] },
];

/**
 * Dashboard — all five panels are always mounted (display:none when inactive).
 *
 * WHY: React unmounts components on tab-switch when using a switch/renderPage()
 * pattern. This wipes all local state (query results, chart data, WebSocket
 * connections, in-flight DuckDB queries, etc.). By keeping every panel mounted
 * and toggling CSS visibility instead, we get:
 *   • Agg/Historical results survive navigation
 *   • Live WebSocket stays connected while user browses other tabs
 *   • DuckDB queries run in the background and show results on return
 *   • No wasted re-fetches or reconnect latency
 *
 * Hard-reload (browser F5) resets all ephemeral React state automatically
 * because the JS runtime is destroyed — no extra logic needed.
 */
export default function Dashboard() {
  const { hasAnyPermission, loading: rbacLoading } = useRBAC();
  const [activeTab, setActiveTab]         = useState('live');
  const [rules, setRules]                 = useState([]);
  // Single-select: choosing a rule replaces whatever was previously selected
  // (radio-button behavior, not a multi-select checkbox list).
  const [selectedRuleId, setSelectedRuleId] = useState(null);
  const [summaryRuleId, setSummaryRuleId] = useState(null);
  const [backendStatus, setBackendStatus] = useState('connecting');
  const [editingRule, setEditingRule]     = useState(null);
  const [historicalPrefill, setHistoricalPrefill] = useState(null);

  // First-run onboarding card — dismissed permanently once closed, persisted
  // across sessions since there's no user-account backing this yet.
  const [showOnboarding, setShowOnboarding] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('ve_onboarding_dismissed') !== 'true'
  );
  const dismissOnboarding = () => {
    localStorage.setItem('ve_onboarding_dismissed', 'true');
    setShowOnboarding(false);
  };

  // Track which tabs have been visited so we can lazy-mount panels
  const visitedTabsRef = useRef(new Set(['live']));
  const handleTabChange = (tab) => {
    visitedTabsRef.current.add(tab);
    setActiveTab(tab);
  };

  const fetchRules = useCallback(async () => {
    const controller = new AbortController();
    // 10-second timeout: if the backend is hanging (no response, not closed),
    // transition to 'down' state so the offline banner is shown promptly.
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${API_BASE}/rules`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) { setBackendStatus('down'); return; }
      const ct = res.headers.get('content-type');
      if (!ct || !ct.includes('application/json')) { setBackendStatus('down'); return; }
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
      setBackendStatus('up');
    } catch (err) {
      clearTimeout(timeoutId);
      setBackendStatus('down');
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  // If the current tab isn't permitted for this user's role (e.g. the
  // default 'live' tab for a role without live_analysis:read), jump to the
  // first tab they can actually access instead of landing on a 403.
  useEffect(() => {
    if (rbacLoading) return;
    const current = NAV_ITEMS.find(n => n.key === activeTab);
    if (current && !hasAnyPermission(current.anyOf)) {
      const firstAllowed = NAV_ITEMS.find(n => hasAnyPermission(n.anyOf));
      if (firstAllowed) handleTabChange(firstAllowed.key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rbacLoading, activeTab]);

  const toggleRuleSelection = (ruleId) => {
    // Radio-button behavior: clicking the already-selected rule deselects it,
    // clicking a different rule replaces the current selection.
    setSelectedRuleId(prev => (prev === ruleId ? null : ruleId));
  };

  const navigateToSummary = (ruleId) => {
    setSummaryRuleId(ruleId);
    handleTabChange('summary');
  };

  const navigateToEdit = (rule) => {
    setEditingRule(rule);
    handleTabChange('build');
  };

  const handleEditComplete = () => {
    setEditingRule(null);
  };

  // Cross-panel drill-through: jump from an anomaly to Historical Analysis,
  // pre-selecting the rule that fired and a date range bracketing when it
  // happened, so the analyst lands on the right context in one click.
  // (Historical replay has no ad hoc "filter to this entity" capability today
  // — this gets you to the right rule + right time window, not a pre-applied
  // entity filter.)
  const drillToHistorical = (ruleId, aroundTs) => {
    setSelectedRuleId(ruleId);
    const centerEpoch = parseISTStringToEpochMs(aroundTs);
    const nowEpoch = Date.now();
    const sevenDaysAgo = nowEpoch - 7 * 24 * 60 * 60 * 1000;
    const safeCenterEpoch = isNaN(centerEpoch) ? nowEpoch : Math.min(Math.max(centerEpoch, sevenDaysAgo), nowEpoch);
    const startEpoch = Math.max(safeCenterEpoch - 60 * 60 * 1000, sevenDaysAgo);
    const endEpoch = Math.min(safeCenterEpoch + 15 * 60 * 1000, nowEpoch);
    setHistoricalPrefill({
      ruleId,
      startTs: toISTDatetimeLocal(startEpoch),
      endTs: toISTDatetimeLocal(endEpoch),
      nonce: Date.now(), // forces HistoricalAnalysis's effect to re-fire even if ruleId/times repeat
    });
    handleTabChange('historical');
  };

  // Determine which rule a draft user can access per panel
  // Draft rules: ONLY historical analysis allowed
  // Prod/Paused rules: all panels allowed
  const analysisSelectedId = selectedRuleId;

  // For Live and Agg: null out the selection if it's a DRAFT rule
  const selectedRuleRecord = rules.find(r => r.rule_metadata.rule_id === selectedRuleId);
  const prodSelectedId = (selectedRuleRecord && selectedRuleRecord.rule_metadata.status !== 'DRAFT')
    ? selectedRuleId
    : null;

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header-logo">
          <Zap size={15} color="#fff" strokeWidth={2.5} />
        </div>
        <h1>Velocity Engine</h1>
        <div className="header-right">
          <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>UIDAI · Auth Analytics</span>
          <span
            className={`conn-pill ${
              backendStatus === 'up' ? 'connected' :
              backendStatus === 'connecting' ? 'reconnecting' : 'disconnected'
            }`}
          >
            <span className="status-dot" style={{
              background: backendStatus === 'up' ? 'var(--success)' :
                           backendStatus === 'connecting' ? 'var(--warning)' : 'var(--danger)',
              width: 6, height: 6
            }} />
            {backendStatus === 'up' ? 'Connected' : backendStatus === 'connecting' ? 'Connecting' : 'Offline'}
          </span>
        </div>
      </header>

      {/* First-run onboarding — explains the Create → Publish → Monitor
          workflow once, dismissible, remembered via localStorage. */}
      {showOnboarding && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(99,102,241,0.12), rgba(45,212,191,0.05))',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: '8px',
          margin: '0.5rem 1rem',
          padding: '0.75rem 2.25rem 0.75rem 1rem',
          position: 'relative',
        }}>
          <button
            onClick={dismissOnboarding}
            title="Dismiss"
            style={{ position: 'absolute', top: '0.6rem', right: '0.6rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex' }}
          >
            <X size={14} />
          </button>
          <p style={{ margin: '0 0 0.65rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)' }}>
            New here? This is a fraud-detection tool for Aadhaar authentication traffic. Here&apos;s how it works:
          </p>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { icon: PlusSquare, label: '1. Create a Rule', desc: 'Describe what unusual activity looks like' },
              { icon: Send, label: '2. Publish It', desc: 'Make it live so it starts watching real traffic' },
              { icon: Activity, label: '3. Monitor Results', desc: 'See it work in Live Stream, Analytics & Historical Replay' },
            ].map(({ icon: Icon, label, desc }, i, arr) => (
              <React.Fragment key={label}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 200 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={13} color="var(--violet-light)" />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-1)' }}>{label}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>{desc}</div>
                  </div>
                </div>
                {i < arr.length - 1 && <ArrowRight size={13} color="var(--text-3)" style={{ flexShrink: 0 }} />}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Offline banner */}
      {backendStatus === 'down' && (
        <div className="backend-banner">
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertTriangle size={14} />
            Cannot reach backend — the interface is in read-only mode. Check that the backend service is running.
          </span>
          <button
            className="btn btn-ghost"
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: 'var(--amber)' }}
            onClick={fetchRules}
          >
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="nav-bar">
        {NAV_ITEMS.map(({ key, label, icon: Icon, tip, anyOf }) => {
          const allowed = rbacLoading || hasAnyPermission(anyOf);
          return (
            <button
              key={key}
              className={`nav-btn ${activeTab === key ? 'active' : ''}`}
              onClick={() => allowed && handleTabChange(key)}
              disabled={!allowed}
              style={!allowed ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
              title={allowed ? tip : `Your role doesn't have access to ${label} (requires ${anyOf.join(' or ')})`}
            >
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Main layout */}
      <div className="app-layout">
        <aside>
          <SavedRulesSidebar
            rules={rules}
            fetchRules={fetchRules}
            selectedRuleId={selectedRuleId}
            toggleRuleSelection={toggleRuleSelection}
            activeTab={activeTab}
            navigateToSummary={navigateToSummary}
          />
        </aside>
        <main className="content-area">
          {/*
           * All analysis panels are permanently mounted. We use display:none to
           * hide inactive ones. This keeps all React state, WebSocket connections,
           * and in-flight queries alive across tab switches.
           *
           * The animate-fade-in class is applied only to the active tab to give a
           * smooth transition feel when switching.
           *
           * Lazy-mount: RuleBuilder, Summary, Build are only mounted once visited.
           */}

          {/* Live Analysis — always mounted */}
          <div style={{ display: activeTab === 'live' ? 'block' : 'none' }}
               className={activeTab === 'live' ? 'animate-fade-in' : ''}>
            <ErrorBoundary label="Live Analysis" showDetails={true}>
              <PermissionGuard permission={PERMISSIONS.LIVE_ANALYSIS_READ} label="Live Stream">
                <LiveAnalysis rules={rules} selectedRuleId={prodSelectedId} allSelectedRuleId={selectedRuleId} onRuleClick={navigateToSummary} />
              </PermissionGuard>
            </ErrorBoundary>
          </div>

          {/* Aggregated Analysis — always mounted */}
          <div style={{ display: activeTab === 'agg' ? 'block' : 'none' }}
               className={activeTab === 'agg' ? 'animate-fade-in' : ''}>
            <ErrorBoundary label="Aggregated Analysis">
              <PermissionGuard permission={PERMISSIONS.AGGREGATED_ANALYSIS_READ} label="Analytics">
                <AggregatedAnalysis rules={rules} selectedRuleId={prodSelectedId} allSelectedRuleId={selectedRuleId} onDrillToHistorical={drillToHistorical} onRuleClick={navigateToSummary} />
              </PermissionGuard>
            </ErrorBoundary>
          </div>

          {/* Historical Analysis — always mounted */}
          <div style={{ display: activeTab === 'historical' ? 'block' : 'none' }}
               className={activeTab === 'historical' ? 'animate-fade-in' : ''}>
            <ErrorBoundary label="Historical Analysis">
              <PermissionGuard permission={PERMISSIONS.HISTORICAL_ANALYSIS_READ} label="Historical Replay">
                <HistoricalAnalysis rules={rules} selectedRuleId={analysisSelectedId} prefill={historicalPrefill} />
              </PermissionGuard>
            </ErrorBoundary>
          </div>

          {/* Rule Builder — lazy mount on first visit */}
          {visitedTabsRef.current.has('build') && (
            <div style={{ display: activeTab === 'build' ? 'block' : 'none' }}
                 className={activeTab === 'build' ? 'animate-fade-in' : ''}>
              <ErrorBoundary label="Rule Builder">
                <PermissionGuard anyOf={[PERMISSIONS.RULES_CREATE, PERMISSIONS.RULES_UPDATE]} label="Create Rule">
                  <RuleBuilderPage
                    rules={rules}
                    fetchRules={fetchRules}
                    editingRule={editingRule}
                    onEditComplete={handleEditComplete}
                  />
                </PermissionGuard>
              </ErrorBoundary>
            </div>
          )}

          {/* Rule Summary — lazy mount on first visit */}
          {visitedTabsRef.current.has('summary') && (
            <div style={{ display: activeTab === 'summary' ? 'block' : 'none' }}
                 className={activeTab === 'summary' ? 'animate-fade-in' : ''}>
              <ErrorBoundary label="Rule Details">
                <PermissionGuard permission={PERMISSIONS.RULES_READ} label="Rule Summary">
                  <RuleSummaryPanel
                    rule={rules.find(r => r.rule_metadata?.rule_id === summaryRuleId)}
                    fetchRules={fetchRules}
                    navigateToEdit={navigateToEdit}
                  />
                </PermissionGuard>
              </ErrorBoundary>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
