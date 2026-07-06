import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Dashboard.css';
import { Zap, History, PlusSquare, Activity, BarChart3, Shield, AlertTriangle, RefreshCw, FlaskConical } from 'lucide-react';
import RuleBuilderPage from '../components/RuleBuilderPage';
import SavedRulesSidebar from '../components/SavedRulesSidebar';
import RuleSummaryPanel from '../components/RuleSummaryPanel';
import LiveAnalysis from '../components/LiveAnalysis';
import AggregatedAnalysis from '../components/AggregatedAnalysis';
import HistoricalAnalysis from '../components/HistoricalAnalysis';
import ErrorBoundary from '../components/ErrorBoundary';
import { API_BASE } from '../config/appConfig';
import { toISTDatetimeLocal, parseISTStringToEpochMs } from '../utils/istUtils';
import { MOCK_RULE, MOCK_RULE_ID, THRESHOLD } from '../simulation/mockEngine';

// ── SIMULATION MODE ──────────────────────────────────────────────────────────
// This branch (test-simulation) runs entirely in-browser so every panel,
// graph, and interaction can be visually verified without a running backend,
// Flink cluster, Kafka, ClickHouse, or Iceberg. All backend/WebSocket calls
// are replaced by src/simulation/mockEngine.js. To disable, remove this
// constant and restore the original fetchRules body / panel props below.
const SIMULATION_MODE = true;

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
  const [activeTab, setActiveTab]         = useState('live');
  const [rules, setRules]                 = useState([]);
  const [selectedRuleIds, setSelectedRuleIds] = useState(new Set());
  const [summaryRuleId, setSummaryRuleId] = useState(null);
  const [backendStatus, setBackendStatus] = useState('connecting');
  const [editingRule, setEditingRule]     = useState(null);
  const [historicalPrefill, setHistoricalPrefill] = useState(null);

  // Track which tabs have been visited so we can lazy-mount panels
  const visitedTabsRef = useRef(new Set(['live']));
  const handleTabChange = (tab) => {
    visitedTabsRef.current.add(tab);
    setActiveTab(tab);
  };

  const fetchRules = useCallback(async () => {
    if (SIMULATION_MODE) {
      // Inject the single mock rule and mark the (nonexistent) backend as up.
      setRules([MOCK_RULE]);
      setBackendStatus('up');
      return;
    }
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

  // Auto-select the mock rule on mount in simulation mode.
  useEffect(() => {
    if (SIMULATION_MODE) {
      setSelectedRuleIds(new Set([MOCK_RULE_ID]));
    }
  }, []);

  const toggleRuleSelection = (ruleId) => {
    setSelectedRuleIds(prev => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId); else next.add(ruleId);
      return next;
    });
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
    setSelectedRuleIds(prev => {
      const next = new Set(prev);
      next.add(ruleId);
      return next;
    });
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

  const navItems = [
    { key: 'live',       label: 'Live Stream',       icon: Activity,   tip: 'Real-time event stream & breach detection' },
    { key: 'agg',        label: 'Analytics',         icon: BarChart3,   tip: 'Aggregated rule analysis from ClickHouse' },
    { key: 'historical', label: 'Historical Replay', icon: History,     tip: 'Replay and test rules on historical data' },
    { key: 'build',      label: 'Create Rule',       icon: PlusSquare,  tip: 'Build a new anomaly detection rule' },
    { key: 'summary',    label: 'Rule Summary',      icon: Shield,      tip: 'View and manage a specific rule' },
  ];

  // Determine which rules a draft user can access per panel
  // Draft rules: ONLY historical analysis allowed
  // Prod/Paused rules: all panels allowed
  const analysisSelectedIds = selectedRuleIds;

  // For Live and Agg: filter out DRAFT rules with a tooltip
  const prodSelectedIds = new Set(
    [...selectedRuleIds].filter(id => {
      const rule = rules.find(r => r.rule_metadata.rule_id === id);
      return rule && rule.rule_metadata.status !== 'DRAFT';
    })
  );

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

      {/* Simulation mode banner */}
      {SIMULATION_MODE && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(251,191,36,0.15), rgba(251,191,36,0.05))',
          border: '1px solid rgba(251,191,36,0.4)',
          borderRadius: '8px',
          margin: '0.5rem 1rem',
          padding: '0.5rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          fontSize: '0.78rem',
          color: '#fbbf24',
          fontWeight: 500,
        }}>
          <FlaskConical size={14} />
          <span><strong>Simulation Mode</strong> — Backend &amp; Flink are not required. Live Analysis ticks a mock Flink pipeline in-browser (early-fire partial updates + a settled tick every IST minute, threshold ≥ {THRESHOLD} triggers a breach across 5 mock entities); Historical Replay and its forensic breakdowns use synthesized Iceberg-style backtest data.</span>
        </div>
      )}

      {/* Offline banner — only shown when NOT in simulation mode */}
      {!SIMULATION_MODE && backendStatus === 'down' && (
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
        {navItems.map(({ key, label, icon: Icon, tip }) => (
          <button
            key={key}
            className={`nav-btn ${activeTab === key ? 'active' : ''}`}
            onClick={() => handleTabChange(key)}
            title={tip}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>

      {/* Main layout */}
      <div className="app-layout">
        <aside>
          <SavedRulesSidebar
            rules={rules}
            fetchRules={fetchRules}
            selectedRuleIds={selectedRuleIds}
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
              <LiveAnalysis rules={rules} selectedRuleIds={prodSelectedIds} allSelectedRuleIds={selectedRuleIds} simulationMode={SIMULATION_MODE} />
            </ErrorBoundary>
          </div>

          {/* Aggregated Analysis — always mounted */}
          <div style={{ display: activeTab === 'agg' ? 'block' : 'none' }}
               className={activeTab === 'agg' ? 'animate-fade-in' : ''}>
            <ErrorBoundary label="Aggregated Analysis">
              <AggregatedAnalysis rules={rules} selectedRuleIds={prodSelectedIds} allSelectedRuleIds={selectedRuleIds} onDrillToHistorical={drillToHistorical} simulationMode={SIMULATION_MODE} />
            </ErrorBoundary>
          </div>

          {/* Historical Analysis — always mounted */}
          <div style={{ display: activeTab === 'historical' ? 'block' : 'none' }}
               className={activeTab === 'historical' ? 'animate-fade-in' : ''}>
            <ErrorBoundary label="Historical Analysis">
              <HistoricalAnalysis rules={rules} selectedRuleIds={analysisSelectedIds} prefill={historicalPrefill} simulationMode={SIMULATION_MODE} />
            </ErrorBoundary>
          </div>

          {/* Rule Builder — lazy mount on first visit */}
          {visitedTabsRef.current.has('build') && (
            <div style={{ display: activeTab === 'build' ? 'block' : 'none' }}
                 className={activeTab === 'build' ? 'animate-fade-in' : ''}>
              <ErrorBoundary label="Rule Builder">
                <RuleBuilderPage
                  rules={rules}
                  fetchRules={fetchRules}
                  editingRule={editingRule}
                  onEditComplete={handleEditComplete}
                />
              </ErrorBoundary>
            </div>
          )}

          {/* Rule Summary — lazy mount on first visit */}
          {visitedTabsRef.current.has('summary') && (
            <div style={{ display: activeTab === 'summary' ? 'block' : 'none' }}
                 className={activeTab === 'summary' ? 'animate-fade-in' : ''}>
              <ErrorBoundary label="Rule Details">
                <RuleSummaryPanel
                  rule={rules.find(r => r.rule_metadata?.rule_id === summaryRuleId)}
                  fetchRules={fetchRules}
                  navigateToEdit={navigateToEdit}
                />
              </ErrorBoundary>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
