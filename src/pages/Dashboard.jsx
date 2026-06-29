import React, { useState, useEffect, useCallback } from 'react';
import './Dashboard.css';
import { Zap, History, PlusSquare, Activity, BarChart3, Shield, AlertTriangle, RefreshCw } from 'lucide-react';
import RuleBuilderPage from '../components/RuleBuilderPage';
import SavedRulesSidebar from '../components/SavedRulesSidebar';
import RuleSummaryPanel from '../components/RuleSummaryPanel';
import LiveAnalysis from '../components/LiveAnalysis';
import AggregatedAnalysis from '../components/AggregatedAnalysis';
import HistoricalAnalysis from '../components/HistoricalAnalysis';
import ErrorBoundary from '../components/ErrorBoundary';
import { API_BASE } from '../config/appConfig';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('live');
  const [rules, setRules] = useState([]);
  const [selectedRuleIds, setSelectedRuleIds] = useState(new Set());
  const [summaryRuleId, setSummaryRuleId] = useState(null);
  const [backendStatus, setBackendStatus] = useState('connecting');
  const [editingRule, setEditingRule] = useState(null);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/rules`);
      if (!res.ok) { setBackendStatus('down'); return; }
      const ct = res.headers.get('content-type');
      if (!ct || !ct.includes('application/json')) { setBackendStatus('down'); return; }
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
      setBackendStatus('up');
    } catch {
      setBackendStatus('down');
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const toggleRuleSelection = (ruleId) => {
    setSelectedRuleIds(prev => {
      const next = new Set(prev);
      if (next.has(ruleId)) next.delete(ruleId); else next.add(ruleId);
      return next;
    });
  };

  const navigateToSummary = (ruleId) => {
    setSummaryRuleId(ruleId);
    setActiveTab('summary');
  };

  const navigateToEdit = (rule) => {
    setEditingRule(rule);
    setActiveTab('build');
  };

  const handleEditComplete = () => {
    setEditingRule(null);
  };

  const navItems = [
    { key: 'live',       label: 'Live Monitor',      icon: Activity },
    { key: 'agg',        label: 'Aggregated',        icon: BarChart3 },
    { key: 'historical', label: 'Historical',        icon: History },
    { key: 'build',      label: 'New Rule',          icon: PlusSquare },
    { key: 'summary',    label: 'Rule Details',      icon: Shield },
  ];

  const renderPage = () => {
    switch (activeTab) {
      case 'live':
        return (
          <ErrorBoundary label="Live Analysis">
            <LiveAnalysis rules={rules} selectedRuleIds={selectedRuleIds} />
          </ErrorBoundary>
        );
      case 'agg':
        return (
          <ErrorBoundary label="Aggregated Analysis">
            <AggregatedAnalysis rules={rules} selectedRuleIds={selectedRuleIds} />
          </ErrorBoundary>
        );
      case 'historical':
        return (
          <ErrorBoundary label="Historical Analysis">
            <HistoricalAnalysis rules={rules} selectedRuleIds={selectedRuleIds} />
          </ErrorBoundary>
        );
      case 'build':
        return (
          <ErrorBoundary label="Rule Builder">
            <RuleBuilderPage
              rules={rules}
              fetchRules={fetchRules}
              editingRule={editingRule}
              onEditComplete={handleEditComplete}
            />
          </ErrorBoundary>
        );
      case 'summary':
        return (
          <ErrorBoundary label="Rule Details">
            <RuleSummaryPanel
              rule={rules.find(r => r.rule_metadata?.rule_id === summaryRuleId)}
              fetchRules={fetchRules}
              navigateToEdit={navigateToEdit}
            />
          </ErrorBoundary>
        );
      default: return null;
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header-logo">
          <Zap size={15} color="#fff" strokeWidth={2.5} />
        </div>
        <h1>Velocity Engine</h1>
        <div className="header-right">
          <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>UIDAI Auth Analytics</span>
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

      {/* Offline banner */}
      {backendStatus === 'down' && (
        <div className="backend-banner">
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertTriangle size={14} />
            Backend is unreachable — the interface is in read-only mode.
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
        {navItems.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`nav-btn ${activeTab === key ? 'active' : ''}`}
            onClick={() => setActiveTab(key)}
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
        <main className="content-area animate-fade-in">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
