import React, { useState } from 'react';
import { Search, Shield, PlusSquare } from 'lucide-react';
import { generateShortSummary } from '../utils/ruleSummary';

const STATUS_STYLE = {
  ACTIVE: { bg: 'rgba(63,185,80,0.15)', color: 'var(--success)' },
  PAUSED: { bg: 'rgba(227,160,8,0.15)', color: 'var(--warning)' },
  DRAFT:  { bg: 'rgba(139,148,158,0.15)', color: 'var(--text-3)' },
};

const SEVERITY_STYLE = {
  CRITICAL: { bg: 'rgba(248,81,73,0.15)', color: 'var(--danger)' },
  HIGH: { bg: 'rgba(255,123,114,0.15)', color: '#ff7b72' },
  MEDIUM: { bg: 'rgba(227,160,8,0.15)', color: 'var(--warning)' },
  LOW: { bg: 'rgba(63,185,80,0.15)', color: 'var(--success)' },
};

/**
 * RulesBrowser — a scannable card list of every rule, so understanding
 * what a colleague's rule does doesn't require opening it. Each card
 * leads with the plain-language sentence, not the raw config — the same
 * "read the sentence, not the JEXL" principle RuleSummaryPanel already
 * uses for a single rule, just applied across all of them at once.
 */
export default function RulesBrowser({ rules, onSelectRule, onCreateRule }) {
  const [search, setSearch] = useState('');

  const filtered = rules.filter(r => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const meta = r.rule_metadata || {};
    return (meta.rule_name || '').toLowerCase().includes(q) || (meta.rule_id || '').toLowerCase().includes(q);
  });

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ color: 'var(--text-1)', margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700 }}>All Rules</h2>
          <p style={{ color: 'var(--text-3)', margin: '0.2rem 0 0', fontSize: 'var(--fs-xs)' }}>
            {rules.length} rule{rules.length === 1 ? '' : 's'} — click one to see the full detail.
          </p>
        </div>
        <div className="input-unit-row" style={{ maxWidth: 260, marginLeft: 'auto' }}>
          <input
            type="text"
            placeholder="Search rules…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '2rem' }}
          />
          <Search size={14} style={{ position: 'relative', left: 28, marginRight: -22, color: 'var(--text-3)', pointerEvents: 'none' }} />
        </div>
        {onCreateRule && (
          <button className="btn btn-accent" onClick={onCreateRule} style={{ fontSize: '0.8rem' }}>
            <PlusSquare size={14} /> New Rule
          </button>
        )}
      </div>

      {filtered.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '3rem 1rem', color: 'var(--text-3)' }}>
          <Shield size={32} style={{ opacity: 0.4 }} />
          {rules.length === 0 ? 'No rules yet — create your first one.' : 'No rules match your search.'}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
        {filtered.map(rule => {
          const meta = rule.rule_metadata || {};
          const statusStyle = STATUS_STYLE[meta.status] || STATUS_STYLE.DRAFT;
          const sevStyle = SEVERITY_STYLE[meta.severity_level] || SEVERITY_STYLE.MEDIUM;
          return (
            <button
              key={meta.rule_id}
              type="button"
              onClick={() => onSelectRule(meta.rule_id)}
              className="card"
              style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1px solid var(--border)' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-1)', lineHeight: 1.35 }}>{meta.rule_name || meta.rule_id}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-xs)', background: statusStyle.bg, color: statusStyle.color }}>
                  {meta.status || 'UNKNOWN'}
                </span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-xs)', background: sevStyle.bg, color: sevStyle.color }}>
                  {meta.severity_level || 'MEDIUM'}
                </span>
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-3)', lineHeight: 1.5 }}>
                {generateShortSummary(rule)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
