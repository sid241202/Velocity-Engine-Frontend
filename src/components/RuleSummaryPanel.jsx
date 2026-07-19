import React from 'react';
import { Send, PlayCircle, PauseCircle, Trash2, Shield, Clock, Filter, Layers, BarChart3, AlertTriangle, Zap, Pencil } from 'lucide-react';
import { API_BASE } from '../config/appConfig';

export default function RuleSummaryPanel({ rule, fetchRules, navigateToEdit }) {
  const [isActioning, setIsActioning] = React.useState(false);

  // No auth/identity layer on this branch — every route is reachable with
  // no headers at all (see this repo's CLAUDE.md).
  const publishRule = async (id) => {
    if (isActioning) return;
    setIsActioning(true);
    try {
      const res = await fetch(`${API_BASE}/rules/${id}/prod`, { method: 'POST' });
      if (res.ok) { alert('Rule published successfully!'); fetchRules(); }
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
        headers: { 'Content-Type': 'application/json' },
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
      const res = await fetch(`${API_BASE}/rules/${id}`, { method: 'DELETE' });
      if (res.ok) { alert('Rule deleted successfully.'); fetchRules(); }
      else { alert('Failed to delete. Check backend logs.'); }
    } catch (e) { console.error(e); alert('Network error.'); }
    finally { setIsActioning(false); }
  };

  if (!rule) {
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

  const statusColor = meta.status === 'ACTIVE' ? 'var(--success)' : meta.status === 'PAUSED' ? 'var(--warning)' : '#475569';

  const formatMs = (ms) => {
    if (!ms && ms !== 0) return 'N/A';
    if (ms < 1000) return `${ms} ms`;
    const totalSeconds = ms / 1000;
    if (totalSeconds < 60) {
      return Number.isInteger(totalSeconds) ? `${totalSeconds} seconds` : `${totalSeconds.toFixed(1)} seconds`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60);
    if (minutes < 60) return seconds > 0 ? `${minutes} min ${seconds} sec` : `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const remainMinutes = minutes % 60;
    return `${hours}h ${remainMinutes}m`;
  };

  const formatTtl = (seconds) => {
    if (!seconds) return 'N/A';
    if (seconds < 60)   return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
    if (seconds < 86400) {
      const h = Math.floor(seconds / 3600);
      const m = Math.round((seconds % 3600) / 60);
      return m > 0 ? `${h}h ${m}m` : `${h} hour${h > 1 ? 's' : ''}`;
    }
    const d = Math.floor(seconds / 86400);
    const h = Math.round((seconds % 86400) / 3600);
    return h > 0 ? `${d}d ${h}h` : `${d} day${d > 1 ? 's' : ''}`;
  };

  const formatAlignment = (ms) => {
    if (!ms && ms !== 0) return '00:00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  const severityColorMap = {
    CRITICAL: { bg: 'rgba(239,68,68,0.2)', color: '#fca5a5' },
    HIGH: { bg: 'rgba(245,158,11,0.2)', color: '#fcd34d' },
    MEDIUM: { bg: 'rgba(59,130,246,0.2)', color: '#93c5fd' },
    LOW: { bg: 'rgba(16,185,129,0.2)', color: '#6ee7b7' }
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
    color: 'white',
    fontSize: '1rem',
    fontWeight: 600,
    marginBottom: '0.75rem'
  };

  const readOnlyInputStyle = {
    width: '100%',
    padding: '0.5rem',
    borderRadius: '6px',
    border: '1px solid var(--glass-border)',
    background: 'rgba(59,130,246,0.05)',
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

  const fieldRowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.35rem 0',
    fontSize: '0.9rem'
  };

  const fieldLabelStyle = { color: 'var(--text-muted)', fontSize: '0.85rem' };
  const fieldValueStyle = { color: 'var(--text-main)', fontWeight: 500 };

  const chipStyle = {
    display: 'inline-block',
    padding: '0.2rem 0.6rem',
    borderRadius: '12px',
    background: 'rgba(59, 130, 246, 0.2)',
    border: '1px solid rgba(59, 130, 246, 0.3)',
    color: '#93c5fd',
    fontSize: '0.8rem',
    marginRight: '0.4rem',
    marginBottom: '0.3rem'
  };

  const renderFilterTree = (node, depth = 0) => {
    if (!node) return null;
    if (node.type === 'group') {
      return (
        <div style={{ borderLeft: '2px solid var(--primary)', marginLeft: depth > 0 ? '1rem' : '0', paddingLeft: '0.75rem', marginTop: '0.3rem', marginBottom: '0.3rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#93c5fd', textTransform: 'uppercase' }}>{node.logic || 'AND'}</span>
          {node.conditions && node.conditions.map((child, i) => (
            <div key={i}>{renderFilterTree(child, depth + 1)}</div>
          ))}
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '0.35rem 0.6rem', borderRadius: '4px', marginTop: '0.25rem', fontSize: '0.85rem' }}>
        <span style={{ color: '#93c5fd', fontFamily: 'monospace' }}>{node.field}</span>
        <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{node.operator}</span>
        <span style={{ color: 'var(--text-main)', fontFamily: 'monospace' }}>{Array.isArray(node.value) ? node.value.join(', ') : String(node.value ?? '')}</span>
      </div>
    );
  };

  const generateSummary = (rule) => {
    const meta = rule.rule_metadata;
    const grouping = rule.grouping || {};
    const windowing = rule.windowing || {};
    const aggs = rule.aggregations || [];
    const having = rule.having_thresholds;
    const filters = rule.filters;

    // Guard: grouping.keys may be undefined on older rules
    const keys = grouping.keys || [];
    const isGlobal = keys.length === 1 && keys[0] === '__GLOBAL__';
    const groupDesc = isGlobal ? 'all events globally (no grouping)' : `events grouped by ${keys.map(k => k).join(' + ')}`;

    let windowDesc;
    const isNoWindow = !windowing.type || windowing.type === 'NONE';
    if (isNoWindow) {
      windowDesc = 'real-time stateless event evaluation (no aggregation window)';
    } else if (windowing.size_ms >= 315360000000) {
      windowDesc = 'a continuous (never-resetting) counter';
    } else {
      const slide = windowing.type === 'SLIDING' && windowing.slide_ms
        ? `, sliding by ${formatMs(windowing.slide_ms)}`
        : '';
      windowDesc = `a ${windowing.type === 'SLIDING' ? 'rolling' : 'fixed'} window of ${formatMs(windowing.size_ms)}${slide}`;
    }

    const timeDesc = windowing.time_type === 'EVENT_TIME'
      ? (windowing.use_kafka_timestamp ? 'message arrival timestamps' : `event timestamps from ${windowing.timestamp_field}`)
      : 'system time';

    const aggDescs = aggs.map(a => {
      const funcName = a.function === 'COUNT_DISTINCT' ? `distinct count (${a.cardinality_hint} cardinality)` : a.function.toLowerCase();
      return `${funcName} of ${a.field} as "${a.alias}"`;
    });

    let filterDesc = '';
    if (filters && filters.conditions && filters.conditions.length > 0) {
      filterDesc = ' Only events passing the defined filters are included.';
    }

    const thresholdDesc = having?.expression
      ? `An alert fires when: ${having.expression.replace(/&&/g, 'AND').replace(/\|\|/g, 'OR')}.`
      : 'No alert threshold is defined (data-only rule).';

    const aggPart = aggDescs.length > 0
      ? `, it computes: ${aggDescs.join('; ')}.`
      : '.';

    return `This rule monitors ${groupDesc}. Using ${windowDesc} based on ${timeDesc}${aggPart}${filterDesc} ${thresholdDesc} Severity: ${meta.severity_level}. After a breach, the same entity won't trigger another alert for ${formatTtl(meta.penalty_ttl_seconds)} (its cooldown period).`;
  };

  return (
    <div className="glass-panel" style={{ maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
      {/* Top Section — Header */}
      <div style={{ ...sectionStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ color: 'white', margin: 0, marginBottom: '0.75rem', fontSize: '1.4rem' }}>{meta.rule_name || 'Unnamed Rule'}</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem', borderRadius: '4px', background: statusColor, color: 'white', fontWeight: 600 }}>
              {meta.status || 'UNKNOWN'}
            </span>
            <span style={{ fontSize: '0.8rem', padding: '0.25rem 0.6rem', borderRadius: '4px', background: sevStyle.bg, color: sevStyle.color, fontWeight: 600 }}>
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
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '1rem', fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: 1.7 }}>
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
            <span key={i} style={chipStyle}>{k}</span>
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
            <input style={readOnlyMonoInputStyle} value={windowing.timestamp_field || 'N/A'} disabled />
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
                    <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'monospace', color: '#93c5fd' }}>{a.alias}</td>
                    <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'monospace' }}>{a.field}</td>
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
        <div style={{ padding: '0.6rem', background: 'rgba(0,0,0,0.4)', borderRadius: '4px', fontFamily: 'monospace', color: '#a78bfa', fontSize: '0.85rem' }}>
          {thresholds.expression || 'No threshold expression'}
        </div>
      </div>

      {/* Section 3 — Actions */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '0.5rem' }}>

        {/* DRAFT: Publish + Edit */}
        {meta.status === 'DRAFT' && (
          <>
            <button
              className="btn btn-accent"
              style={{ flex: 1, justifyContent: 'center', fontSize: '0.9rem' }}
              onClick={() => publishRule(meta.rule_id)}
              disabled={isActioning}
              title="Makes this rule live — it will start evaluating real traffic."
            >
              <Send size={16} /> {isActioning ? 'Publishing…' : 'Publish Rule'}
            </button>
            <button
              className="btn"
              style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', flex: 1, justifyContent: 'center', fontSize: '0.9rem' }}
              onClick={() => navigateToEdit && navigateToEdit(rule)}
            >
              <Pencil size={15} /> Edit Rule
            </button>
          </>
        )}

        {/* ACTIVE: Pause (to enable editing) */}
        {meta.status === 'ACTIVE' && (
          <button
            className="btn"
            style={{ background: 'var(--warning)', flex: 1, justifyContent: 'center', fontSize: '0.9rem' }}
            onClick={() => updateStatus(meta.rule_id, 'PAUSED')}
            title="Pausing the rule brings it back to draft, enabling editing."
            disabled={isActioning}
          >
            <PauseCircle size={16} /> {isActioning ? 'Pausing…' : 'Pause'}
          </button>
        )}

        {/* PAUSED: Resume + Edit */}
        {meta.status === 'PAUSED' && (
          <>
            <button className="btn" style={{ background: 'var(--success)', flex: 1, justifyContent: 'center', fontSize: '0.9rem' }} onClick={() => updateStatus(meta.rule_id, 'ACTIVE')} disabled={isActioning}>
              <PlayCircle size={16} /> {isActioning ? 'Resuming…' : 'Resume'}
            </button>
            <button
              className="btn"
              style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc', flex: 1, justifyContent: 'center', fontSize: '0.9rem' }}
              onClick={() => navigateToEdit && navigateToEdit(rule)}
            >
              <Pencil size={15} /> Edit Rule
            </button>
          </>
        )}

        <button
          className="btn"
          style={{ background: 'var(--danger)', flex: 1, justifyContent: 'center', fontSize: '0.9rem' }}
          onClick={() => deleteRule(meta.rule_id)}
          disabled={isActioning}
        >
          <Trash2 size={16} /> {isActioning ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}
