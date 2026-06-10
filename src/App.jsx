import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import { Activity, PlusSquare, History, Shield, BarChart3 } from 'lucide-react';
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
  const [fetchError, setFetchError] = useState(null);

  const fetchRules = useCallback(async () => {
    try {
      setFetchError(null);
      const res = await fetch('/api/rules');
      if (res.ok) {
        const data = await res.json();
        setRules(data);
      } else {
        setFetchError('Failed to load rules from server.');
      }
    } catch (e) {
      console.error(e);
      setFetchError('Network error loading rules.');
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
            rule={rules.find(r => r.rule_metadata.rule_id === summaryRuleId)}
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

      {fetchError && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px',
          padding: '0.5rem 1rem',
          margin: '0 1.5rem',
          color: '#fca5a5',
          fontSize: '0.8rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>{fetchError}</span>
          <button
            onClick={fetchRules}
            style={{
              background: 'rgba(239,68,68,0.2)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: '4px',
              color: '#fca5a5',
              padding: '0.2rem 0.6rem',
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
          >
            Retry
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
