import React from 'react';
import { Send, PlayCircle, PauseCircle, Trash2, Shield, Clock, Filter, Layers, BarChart3, AlertTriangle, Zap, Pencil, ArrowLeft, ChevronDown, ChevronRight, Settings2 } from 'lucide-react';
import { API_BASE } from '../config/appConfig';
import { getAuthHeaders } from '../services/apiClient';
import RequirePermission from './RequirePermission';
import { PERMISSIONS } from '../permissions';
import { pathToLabel } from '../constants/eventFields';
import { generateSummary, formatMs, formatTtl } from '../utils/ruleSummary';
import RulesBrowser from './RulesBrowser';

// Friendly label for a raw event-field dot-path, falling back to the raw
// path itself for anything outside the known schema (e.g. rules saved
// before this field list existed).
const fieldLabel = (path) => pathToLabel.get(path) || path;

export default function RuleSummaryPanel({ rule, rules, fetchRules, navigateToEdit, onSelectRule, onBack, onCreateRule }) {
  const [isActioning, setIsActioning] = React.useState(false);
  const [showTechnical, setShowTechnical] = React.useState(false);

  // rules:publish is enforced server-side via RequirePermission (see
  // internal/middleware/auth.go) on POST /rules/:id/prod and
  // POST /rules/:id/status. DELETE /rules/:id has no such route-level gate —
  // its rules:delete vs. rules:delete_draft-plus-DRAFT-status decision is
  // made inside DeleteRule itself (internal/handlers/rules.go). Either way,
  // these calls need the same identity headers RBACContext uses for GET /me
  // so the backend can resolve who's asking.
  const publishRule = async (id) => {
    if (isActioning) return;
    setIsActioning(true);
    try {
      const res = await fetch(`${API_BASE}/rules/${id}/prod`, {
        method: 'POST',
        headers: await getAuthHeaders(),
      });
      if (res.ok) { alert('Rule published successfully!'); fetchRules(); }
      else if (res.status === 403) { alert("You don't have permission to publish rules."); }
      else { alert('Failed to publish. Check backend logs.'); }
    } catch (e) { console.error(e); alert('Network error.'); }
    finally { setIsActioning(false); }
  };

  const updateStatus = async (id, status) => {
    if (isActioning) return;
    setIsActioning(true);
    try {
      const res = await fetch(`${API_BASE}/rules/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ status })
      });
      if (res.ok) { alert(`Rule is now ${status}`); fetchRules(); }
      else { alert('Failed to update status. Check backend logs.'); }
    } catch (e) { console.error(e); alert('Network error.'); }
    finally { setIsActioning(false); }
  };

  const deleteRule = async (id) => {
    if (!window.confirm('Permanently delete this rule?')) return;
    if (isActioning) return;
    setIsActioning(true);
    try {
      const res = await fetch(`${API_BASE}/rules/${id}`, {
        method: 'DELETE',
        headers: await getAuthHeaders(),
      });
      if (res.ok) { alert('Rule deleted successfully.'); fetchRules(); }
      else if (res.status === 403) { alert("You don't have permission to delete rules."); }
      else { alert('Failed to delete. Check backend logs.'); }
    } catch (e) { console.error(e); alert('Network error.'); }
    finally { setIsActioning(false); }
  };

  if (!rule) {
    if (rules && onSelectRule) {
      return <RulesBrowser rules={rules} onSelectRule={onSelectRule} onCreateRule={onCreateRule} />;
    }
    return (
      <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px', color: 'var(--text-muted)', fontSize: '1.1rem' }}>
        <div style={{ textAlign: 'center' }}>
          <Shield size={48} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
          <p>Select a rule from the sidebar to view its summary</p>
        </div>
      </div>
    );
  }

  const meta = rule.rule_metadata || {};
  const routing = rule.execution_routing || {};
  const grouping = rule.grouping || {};
  const windowing = rule.windowing || {};
  const aggregations = rule.aggregations || [];
  const thresholds = rule.having_thresholds || {};
  const filters = rule.filters;

  const statusColor = meta.status === 'ACTIVE' ? 'var(--success)' : meta.status === 'PAUSED' ? 'var(--warning)' : 'var(--gray-8)';

  const formatAlignment = (ms) => {
    if (!ms && ms !== 0) return '00:00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  // Severity color-coding matches the same tiers used in Analytics' anomaly
  // breakdown (AggregatedAnalysis.jsx) — CRITICAL/HIGH/MEDIUM/LOW should look
  // identical wherever severity shows up in the app.
  const severityColorMap = {
    CRITICAL: { bg: 'rgba(248,81,73,0.2)', color: 'var(--danger)' },
    HIGH: { bg: 'rgba(255,123,114,0.2)', color: '#ff7b72' },
    MEDIUM: { bg: 'rgba(227,160,8,0.2)', color: 'var(--warning)' },
    LOW: { bg: 'rgba(63,185,80,0.2)', color: 'var(--success)' }
  };
  const sevStyle = severityColorMap[meta.severity_level] || severityColorMap.MEDIUM;

  const sectionStyle = {
    marginBottom: '1.5rem',
    paddingBottom: '1rem',
    borderBottom: '1px solid var(--glass-border)'
  };

  const sectionHeaderStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: 'var(--text-1)',
    fontSize: 'var(--fs-md)',
    fontWeight: 600,
    marginBottom: '0.75rem'
  };

  const readOnlyInputStyle = {
    width: '100%',
    padding: '0.5rem',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--glass-border)',
    background: 'var(--violet-subtle)',
    color: 'var(--text-main)',
    fontFamily: "'Inter', sans-serif",
    marginTop: '0.25rem',
    cursor: 'default'
  };

  const readOnlyMonoInputStyle = {
    ...readOnlyInputStyle,
    fontFamily: 'monospace',
    fontSize: '0.85rem'
  };

  const fieldLabelStyle = { color: 'var(--text-muted)', fontSize: '0.85rem' };

  const chipStyle = {
    display: 'inline-block',
    padding: '0.2rem 0.6rem',
    borderRadius: 'var(--radius-lg)',
    background: 'rgba(var(--violet-rgb),0.2)',
    border: '1px solid rgba(var(--violet-rgb),0.3)',
    color: 'var(--violet-light)',
    fontSize: '0.8rem',
    marginRight: '0.4rem',
    marginBottom: '0.3rem'
  };

  const renderFilterTree = (node, depth = 0) => {
    if (!node) return null;
    if (node.type === 'group') {
      return (
        <div style={{ borderLeft: '2px solid var(--primary)', marginLeft: depth > 0 ? '1rem' : '0', paddingLeft: '0.75rem', marginTop: '0.3rem', marginBottom: '0.3rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--violet-light)', textTransform: 'uppercase' }}>{node.logic || 'AND'}</span>
          {node.conditions && node.conditions.map((child, i) => (
            <div key={i}>{renderFilterTree(child, depth + 1)}</div>
          ))}
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '0.35rem 0.6rem', borderRadius: 'var(--radius-xs)', marginTop: '0.25rem', fontSize: '0.85rem' }}>
        <span style={{ color: 'var(--violet-light)', fontFamily: 'monospace' }}>{fieldLabel(node.field)}</span>
        <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{node.operator}</span>
        <span style={{ color: 'var(--text-main)', fontFamily: 'monospace' }}>{Array.isArray(node.value) ? node.value.join(', ') : String(node.value ?? '')}</span>
      </div>
    );
  };

  return (
    <div className="glass-panel">
      {onBack && (
        <button type="button" className="btn btn-ghost" style={{ fontSize: '0.76rem', marginBottom: '0.75rem' }} onClick={onBack}>
          <ArrowLeft size={12} /> All Rules
        </button>
      )}
      {/* Top Section — Header */}
      <div style={{ ...sectionStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ color: 'var(--text-1)', margin: 0, marginBottom: '0.75rem', fontSize: 'var(--fs-xl)' }}>{meta.rule_name || 'Unnamed Rule'}</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-xs)', background: statusColor, color: 'white', fontWeight: 600 }}>
              {meta.status || 'UNKNOWN'}
            </span>
            <span style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-xs)', background: sevStyle.bg, color: sevStyle.color, fontWeight: 600 }}>
              {meta.severity_level}
            </span>
          </div>
        </div>
        <Shield size={28} color="var(--primary)" />
      </div>

      {/* What This Rule Does — plain-English summary, shown first because
          it's what a reader actually wants to know before the raw config
          tables below. */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <Zap size={16} color="var(--success)" /> What This Rule Does
        </div>
        <div style={{ background: 'var(--success-subtle)', border: '1px solid rgba(63,185,80,0.2)', borderRadius: 'var(--radius-sm)', padding: '1rem', fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
          {generateSummary(rule)}
        </div>
      </div>

      {/* Section 1 — Rule Configuration */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <AlertTriangle size={16} color="var(--warning)" /> Metadata
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
          <div style={{ flex: 1.5 }}>
            <label style={fieldLabelStyle}>Rule ID</label>
            <input style={readOnlyMonoInputStyle} value={meta.rule_id || ''} disabled />
          </div>
          <div style={{ flex: 2 }}>
            <label style={fieldLabelStyle}>Rule Name</label>
            <input style={readOnlyInputStyle} value={meta.rule_name || ''} disabled />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle}>Severity</label>
            <input style={{ ...readOnlyInputStyle, color: sevStyle.color }} value={meta.severity_level || ''} disabled />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle}>Cooldown Period</label>
            <input style={readOnlyInputStyle} value={meta.penalty_ttl_seconds ? formatTtl(meta.penalty_ttl_seconds) : 'N/A'} disabled />
          </div>
        </div>
      </div>

      {/* Technical Details — the raw configuration (grouping keys, window
          internals, filter tree, aggregation table, JEXL expression).
          Collapsed by default: the plain-language summary above already
          answers "what does this rule do" for the vast majority of
          readers, so the raw config is here for the minority who need to
          verify it exactly rather than being the first thing everyone
          scrolls through. */}
      <button
        type="button"
        onClick={() => setShowTechnical(v => !v)}
        className="btn btn-ghost"
        style={{ fontSize: '0.78rem', marginBottom: showTechnical ? '0.75rem' : '1.25rem', width: '100%', justifyContent: 'space-between' }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Settings2 size={13} /> Technical Details</span>
        {showTechnical ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {showTechnical && (
      <>
      {/* Routing */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <Send size={16} color="var(--accent)" /> Event Source
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle}>Data Source</label>
            <input style={readOnlyMonoInputStyle} value={routing.target_source_topic || routing.source_topic || 'Default'} disabled />
          </div>
        </div>
      </div>

      {/* Grouping */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <Layers size={16} color="var(--success)" /> Grouping Keys
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {grouping.keys && grouping.keys.length > 0 ? grouping.keys.map((k, i) => (
            <span key={i} style={chipStyle}>{k === '__GLOBAL__' ? k : fieldLabel(k)}</span>
          )) : (
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No grouping keys</p>
          )}
        </div>
      </div>

      {/* Windowing */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <Clock size={16} color="var(--warning)" /> Windowing
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label style={fieldLabelStyle}>Type</label>
            <input style={readOnlyInputStyle} value={windowing.type === 'SLIDING' ? 'Rolling' : windowing.type === 'TUMBLING' ? 'Fixed' : (windowing.type || 'N/A')} disabled />
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label style={fieldLabelStyle}>Size</label>
            <input style={readOnlyInputStyle} value={formatMs(windowing.size_ms)} disabled />
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label style={fieldLabelStyle}>Slide</label>
            <input style={readOnlyInputStyle} value={formatMs(windowing.slide_ms)} disabled />
          </div>
          <div style={{ flex: 1, minWidth: '120px' }}>
            <label style={fieldLabelStyle}>Lateness</label>
            <input style={readOnlyInputStyle} value={formatMs(windowing.allowed_lateness_ms)} disabled />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={fieldLabelStyle}>Timing Mode</label>
            <input style={readOnlyInputStyle} value={windowing.time_type === 'EVENT_TIME' ? 'Event Time' : windowing.time_type === 'PROCESSING_TIME' ? 'System Time' : (windowing.time_type || 'N/A')} disabled />
          </div>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={fieldLabelStyle}>Timestamp Field</label>
            <input style={readOnlyMonoInputStyle} value={windowing.timestamp_field ? fieldLabel(windowing.timestamp_field) : 'N/A'} disabled />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={fieldLabelStyle}>Message Arrival Time</label>
            <input style={readOnlyInputStyle} value={windowing.use_kafka_timestamp ? 'Yes' : 'No'} disabled />
          </div>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={fieldLabelStyle}>Alignment (IST)</label>
            <input style={{ ...readOnlyMonoInputStyle }} value={formatAlignment(windowing.alignment_offset_ms)} disabled />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <Filter size={16} color="var(--primary)" /> Filters
        </div>
        {filters && (filters.type === 'group' ? (
          renderFilterTree(filters)
        ) : Array.isArray(filters) && filters.length > 0 ? (
          filters.map((f, i) => (
            <div key={i}>{renderFilterTree(f)}</div>
          ))
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No filters applied</p>
        ))}
        {!filters && <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No filters applied</p>}
      </div>

      {/* Aggregations */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <BarChart3 size={16} color="var(--accent)" /> Aggregations
        </div>
        {aggregations.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: 'var(--text-muted)', fontWeight: 500 }}>Alias</th>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: 'var(--text-muted)', fontWeight: 500 }}>Field</th>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: 'var(--text-muted)', fontWeight: 500 }}>Function</th>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0.5rem', color: 'var(--text-muted)', fontWeight: 500 }}>Cardinality</th>
                </tr>
              </thead>
              <tbody>
                {aggregations.map((a, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'monospace', color: 'var(--violet-light)' }}>{a.alias}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'monospace' }}>{fieldLabel(a.field)}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{a.function}</td>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{a.cardinality_hint || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No aggregations defined</p>
        )}
      </div>

      {/* Thresholds */}
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <AlertTriangle size={16} color="var(--danger)" /> Thresholds
        </div>
        <div style={{ padding: '0.6rem', background: 'var(--surface-3)', borderRadius: 'var(--radius-xs)', fontFamily: 'monospace', color: 'var(--violet-light)', fontSize: '0.85rem' }}>
          {thresholds.expression || 'No threshold expression'}
        </div>
      </div>
      </>
      )}

      {/* Section 3 — Actions */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '0.5rem' }}>

        {/* Publish/Pause/Resume all require rules:publish and are hidden
            entirely (not shown-disabled) for a role that lacks it — e.g.
            RULE_EDITOR and READ_ONLY_ANALYST never see any of them, on any
            status. Edit requires rules:update and is likewise hidden rather
            than disabled for READ_ONLY_ANALYST. */}

        {/* DRAFT: Publish + Edit */}
        {meta.status === 'DRAFT' && (
          <>
            <RequirePermission permission={PERMISSIONS.RULES_PUBLISH}>
              <button
                className="btn btn-accent"
                style={{ flex: 1, justifyContent: 'center', fontSize: '0.9rem' }}
                onClick={() => publishRule(meta.rule_id)}
                disabled={isActioning}
                title="Makes this rule live — it will start evaluating real traffic."
              >
                <Send size={16} /> {isActioning ? 'Publishing…' : 'Publish Rule'}
              </button>
            </RequirePermission>
            <RequirePermission permission={PERMISSIONS.RULES_UPDATE}>
              <button
                className="btn"
                style={{ background: 'rgba(var(--violet-rgb),0.2)', border: '1px solid rgba(var(--violet-rgb),0.4)', color: 'var(--violet-light)', flex: 1, justifyContent: 'center', fontSize: '0.9rem' }}
                onClick={() => navigateToEdit && navigateToEdit(rule)}
              >
                <Pencil size={15} /> Edit Rule
              </button>
            </RequirePermission>
          </>
        )}

        {/* ACTIVE: Pause (to enable editing) */}
        {meta.status === 'ACTIVE' && (
          <RequirePermission permission={PERMISSIONS.RULES_PUBLISH}>
            <button
              className="btn"
              style={{ background: 'var(--warning)', color: 'var(--gray-1)', flex: 1, justifyContent: 'center', fontSize: '0.9rem' }}
              onClick={() => updateStatus(meta.rule_id, 'PAUSED')}
              title="Pausing the rule brings it back to draft, enabling editing."
              disabled={isActioning}
            >
              <PauseCircle size={16} /> {isActioning ? 'Pausing…' : 'Pause'}
            </button>
          </RequirePermission>
        )}

        {/* PAUSED: Resume + Edit */}
        {meta.status === 'PAUSED' && (
          <>
            <RequirePermission permission={PERMISSIONS.RULES_PUBLISH}>
              <button
                className="btn"
                style={{ background: 'var(--success)', color: 'var(--gray-1)', flex: 1, justifyContent: 'center', fontSize: '0.9rem' }}
                onClick={() => updateStatus(meta.rule_id, 'ACTIVE')}
                disabled={isActioning}
              >
                <PlayCircle size={16} /> {isActioning ? 'Resuming…' : 'Resume'}
              </button>
            </RequirePermission>
            <RequirePermission permission={PERMISSIONS.RULES_UPDATE}>
              <button
                className="btn"
                style={{ background: 'rgba(var(--violet-rgb),0.2)', border: '1px solid rgba(var(--violet-rgb),0.4)', color: 'var(--violet-light)', flex: 1, justifyContent: 'center', fontSize: '0.9rem' }}
                onClick={() => navigateToEdit && navigateToEdit(rule)}
              >
                <Pencil size={15} /> Edit Rule
              </button>
            </RequirePermission>
          </>
        )}

        {/* rules:delete allows deleting any rule; rules:delete_draft (RULE_EDITOR)
            only covers a rule still in DRAFT — matches the backend's DeleteRule
            check (internal/handlers/rules.go), which is the real boundary. */}
        <RequirePermission anyOf={meta.status === 'DRAFT' ? [PERMISSIONS.RULES_DELETE, PERMISSIONS.RULES_DELETE_DRAFT] : [PERMISSIONS.RULES_DELETE]}>
          <button
            className="btn"
            style={{ background: 'var(--danger)', color: 'var(--gray-1)', flex: 1, justifyContent: 'center', fontSize: '0.9rem' }}
            onClick={() => deleteRule(meta.rule_id)}
            disabled={isActioning}
          >
            <Trash2 size={16} /> {isActioning ? 'Deleting…' : 'Delete'}
          </button>
        </RequirePermission>
      </div>
    </div>
  );
}
