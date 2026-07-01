import React from 'react';
import { ShieldCheck, Info, TrendingUp } from 'lucide-react';
import { getRuleColor } from '../constants';

const SEV_COLORS = {
  CRITICAL: 'var(--danger)',
  HIGH:     '#f87171',
  MEDIUM:   'var(--amber)',
  LOW:      'var(--teal)',
};

const STATUS_MAP = {
  ACTIVE:  { dot: 'active',  badge: 'badge-success', label: 'Active' },
  PAUSED:  { dot: 'paused',  badge: 'badge-warning', label: 'Paused' },
  DRAFT:   { dot: 'draft',   badge: 'badge-draft',   label: 'Draft'  },
  DELETED: { dot: 'deleted', badge: 'badge-danger',  label: 'Deleted'},
};

export default function SavedRulesSidebar({
  rules, fetchRules, selectedRuleIds, toggleRuleSelection, activeTab, navigateToSummary
}) {
  const isAnalysisPage = ['live', 'agg', 'historical'].includes(activeTab);
  // Live and Agg analysis only work for non-DRAFT rules
  const isProdOnlyAnalysis = ['live', 'agg'].includes(activeTab);

  return (
    <div
      className="glass-panel"
      style={{ height: 'calc(100vh - 162px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.875rem', borderBottom: '1px solid var(--border)' }}>
        <ShieldCheck size={17} color="var(--violet-light)" strokeWidth={2} />
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>Detection Rules</span>
        {rules.length > 0 && (
          <span className="badge badge-violet" style={{ marginLeft: 'auto' }}>{rules.length}</span>
        )}
      </div>

      {/* Selection hint */}
      {isAnalysisPage && rules.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.75rem', padding: '0.35rem 0.6rem', background: 'var(--violet-subtle)', borderRadius: '6px', border: '1px solid rgba(124,58,237,0.15)' }}>
          <TrendingUp size={11} color="var(--violet-light)" />
          <span style={{ fontSize: '0.68rem', color: 'var(--violet-light)', fontWeight: 500 }}>Click a rule to include in analysis</span>
        </div>
      )}

      {/* Rule list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.45rem', minHeight: 0 }}>
        {rules.map(r => {
          const ruleId    = r.rule_metadata.rule_id;
          const isSelected = selectedRuleIds.has(ruleId);
          const color     = getRuleColor(rules, ruleId);
          const meta      = r.rule_metadata;
          const statusInfo = STATUS_MAP[meta.status] || STATUS_MAP.DRAFT;
          const sevColor  = SEV_COLORS[meta.severity_level] || 'var(--text-3)';

          return (
            <div
              key={ruleId}
              onClick={() => {
                if (!isAnalysisPage) return;
                if (isProdOnlyAnalysis && meta.status === 'DRAFT') {
                  // DRAFT rules cannot be used in Live or Agg analysis
                  return;
                }
                toggleRuleSelection(ruleId);
              }}
              title={isProdOnlyAnalysis && meta.status === 'DRAFT'
                ? 'DRAFT rules are not available for Live or Agg analysis. Use Historical Analysis instead, or publish this rule.'
                : ''}
              style={{
                background: isSelected ? `${color}12` : 'var(--surface-2)',
                borderRadius: '8px',
                border: `1px solid ${isSelected ? `${color}35` : 'var(--border)'}`,
                borderLeft: `3px solid ${isSelected ? color : 'transparent'}`,
                padding: '0.6rem 0.75rem',
                cursor: (isAnalysisPage && !(isProdOnlyAnalysis && meta.status === 'DRAFT'))
                  ? 'pointer' : isProdOnlyAnalysis && meta.status === 'DRAFT' ? 'not-allowed' : 'default',
                opacity: isProdOnlyAnalysis && meta.status === 'DRAFT' ? 0.5 : 1,
                /* Specific transitions only — 'transition: all' causes layout bounce */
                transition: 'border-color 0.15s ease, background 0.15s ease',

              }}
              onMouseEnter={e => {
                if (!isSelected && !(isProdOnlyAnalysis && meta.status === 'DRAFT')) e.currentTarget.style.background = 'var(--surface-3)';
              }}
              onMouseLeave={e => {
                if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                {/* Color dot */}
                <div
                  style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: color, marginTop: 5, flexShrink: 0,
                    opacity: isSelected ? 1 : 0.4,
                    boxShadow: isSelected ? `0 0 5px ${color}` : 'none',
                  }}
                />

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span style={{
                      fontSize: '0.78rem', fontWeight: 600,
                      color: isSelected ? color : 'var(--text-1)',
                      letterSpacing: '-0.01em',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: '130px',
                      transition: 'color 0.15s',
                    }}>
                      {meta.rule_name || ruleId}
                    </span>
                    <span className={`badge ${statusInfo.badge}`} style={{ fontSize: '0.58rem' }}>
                      {statusInfo.label}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.68rem', color: sevColor, fontWeight: 500 }}>
                      {meta.severity_level}
                    </span>
                    <button
                      onClick={e => { e.stopPropagation(); navigateToSummary(ruleId); }}
                      className="btn btn-ghost"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '2px', borderRadius: '4px',
                        display: 'flex', alignItems: 'center',
                        color: 'var(--text-3)', transition: 'color 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--text-2)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-3)'}
                      title="View rule details"
                    >
                      <Info size={12} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {rules.length === 0 && (
          <div className="empty-state" style={{ padding: '2rem 1rem' }}>
            <ShieldCheck size={32} className="empty-state-icon" />
            <p className="empty-state-title">No rules yet</p>
            <p className="empty-state-sub">Create your first detection rule using the New Rule tab.</p>
          </div>
        )}
      </div>
    </div>
  );
}
