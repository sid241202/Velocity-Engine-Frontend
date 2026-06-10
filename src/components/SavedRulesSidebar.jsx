import React from 'react';
import { ShieldAlert, Info } from 'lucide-react';
import { getRuleColor } from '../constants';

export default function SavedRulesSidebar({ rules, fetchRules, selectedRuleIds, toggleRuleSelection, activeTab, navigateToSummary }) {

  const isAnalysisPage = activeTab === 'live' || activeTab === 'agg' || activeTab === 'historical';

  const handleCardClick = (ruleId) => {
    if (isAnalysisPage) {
      toggleRuleSelection(ruleId);
    }
  };

  const getStatusColor = (status) => {
    if (status === 'ACTIVE') return 'var(--success)';
    if (status === 'PAUSED') return 'var(--warning)';
    return '#475569';
  };

  return (
    <div className="glass-panel" style={{ height: 'calc(100vh - 180px)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem' }}>
        <ShieldAlert size={20} color="#60a5fa" />
        <h2 style={{ color: 'white', margin: 0, fontSize: '1.15rem' }}>Saved Rules Portfolio</h2>
      </div>

      {isAnalysisPage && (
        <div style={{
          fontSize: '0.7rem',
          color: 'var(--text-muted)',
          marginBottom: '1rem',
          padding: '0.4rem 0.6rem',
          background: 'rgba(59, 130, 246, 0.08)',
          borderRadius: '6px',
          border: '1px solid rgba(59, 130, 246, 0.15)',
          textAlign: 'center'
        }}>
          Click to select for analysis
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {rules.map(r => {
          const ruleId = r.rule_metadata.rule_id;
          const isSelected = selectedRuleIds.has(ruleId);
          const color = getRuleColor(rules, ruleId);

          return (
            <div
              key={ruleId}
              className="rule-card"
              onClick={() => handleCardClick(ruleId)}
              style={{
                background: isSelected ? `${color}15` : 'rgba(15, 23, 42, 0.6)',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid transparent',
                borderLeft: isSelected ? `3px solid ${color}` : '3px solid transparent',
                cursor: isAnalysisPage ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
              }}
            >
              <div
                className="rule-color-dot"
                style={{
                  backgroundColor: color,
                  opacity: isSelected ? 1 : 0.3,
                }}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <h3 style={{
                    fontSize: '0.85rem',
                    color: isSelected ? color : '#60a5fa',
                    margin: 0,
                    wordBreak: 'break-word',
                    paddingRight: '0.3rem',
                    lineHeight: 1.3,
                  }}>
                    {r.rule_metadata.rule_name}
                  </h3>
                  <span style={{
                    fontSize: '0.6rem',
                    padding: '0.15rem 0.35rem',
                    borderRadius: '4px',
                    background: getStatusColor(r.rule_metadata.status),
                    color: 'white',
                    flexShrink: 0,
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                  }}>
                    {r.rule_metadata.status}
                  </span>
                </div>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: 0 }}>
                  {r.rule_metadata.severity_level}
                </p>
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); navigateToSummary(ruleId); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                title="View rule summary"
              >
                <Info size={16} color="var(--text-muted)" />
              </button>
            </div>
          );
        })}

        {rules.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem', fontSize: '0.85rem' }}>
            No rules saved. Build one to see it here.
          </div>
        )}
      </div>
    </div>
  );
}
