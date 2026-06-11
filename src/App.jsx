import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import { Activity, PlusSquare, History, Shield, BarChart3, AlertTriangle, RefreshCw } from 'lucide-react';
import RuleBuilderPage from './components/RuleBuilderPage';
import SavedRulesSidebar from './components/SavedRulesSidebar';
import RuleSummaryPanel from './components/RuleSummaryPanel';
import LiveAnalysis from './components/LiveAnalysis';
import AggregatedAnalysis from './components/AggregatedAnalysis';
import HistoricalAnalysis from './components/HistoricalAnalysis';

function App() {
  const [activeTab, setActiveTab] = useState('live');
  const [rules, setRules] = useState([]);
  const [selectedRuleIds, setSelectedRuleIds] = useState(new Set());
  const [summaryRuleId, setSummaryRuleId] = useState(null);
  const [backendStatus, setBackendStatus] = useState('connecting'); // 'connecting' | 'up' | 'down'

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/rules');
      if (!res.ok) {
        setBackendStatus('down');
        return;
      }
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        setBackendStatus('down');
        return;
      }
      const data = await res.json();
      setRules(data);
      setBackendStatus('up');
    } catch {
      setBackendStatus('down');
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const toggleRuleSelection = (ruleId) => {
    setSelectedRuleIds(prev => {
      const next = new Set(prev);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return next;
    });
  };

  const navigateToSummary = (ruleId) => {
    setSummaryRuleId(ruleId);
    setActiveTab('summary');
  };

  const navItems = [
    { key: 'historical', label: 'Historical Analysis', icon: History },
    { key: 'build', label: 'Rule Builder', icon: PlusSquare },
    { key: 'live', label: 'Live Analysis', icon: Activity },
    { key: 'agg', label: 'Aggregated Analysis', icon: BarChart3 },
    { key: 'summary', label: 'Rule Summary', icon: Shield },
  ];

  const renderPage = () => {
    switch (activeTab) {
      case 'live':
        return <LiveAnalysis rules={rules} selectedRuleIds={selectedRuleIds} />;
      case 'summary':
        return (
          <RuleSummaryPanel
            rule={rules.find(r => r.rule_metadata?.rule_id === summaryRuleId)}
            fetchRules={fetchRules}
          />
        );
      case 'build':
        return <RuleBuilderPage rules={rules} fetchRules={fetchRules} />;
      case 'agg':
        return <AggregatedAnalysis rules={rules} selectedRuleIds={selectedRuleIds} />;
      case 'historical':
        return <HistoricalAnalysis rules={rules} selectedRuleIds={selectedRuleIds} />;
      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <Activity size={32} color="#60a5fa" />
        <h1>Velocity Engine Control Plane</h1>
      </header>

      {backendStatus === 'down' && (
        <div style={{
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: '8px',
          padding: '0.6rem 1rem',
          margin: '0 1.5rem',
          color: '#fcd34d',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertTriangle size={16} />
            Backend service is unavailable. The UI is in read-only mode. Actions requiring the backend will not work.
          </span>
          <button
            onClick={fetchRules}
            style={{
              background: 'rgba(245,158,11,0.2)',
              border: '1px solid rgba(245,158,11,0.4)',
              borderRadius: '4px',
              color: '#fcd34d',
              padding: '0.25rem 0.7rem',
              cursor: 'pointer',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      <div className="nav-bar">
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              className={`nav-btn ${activeTab === item.key ? 'active' : ''}`}
              onClick={() => setActiveTab(item.key)}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </div>

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

export default App;
