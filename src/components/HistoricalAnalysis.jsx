import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { History, Loader2, ArrowUpDown, Database, XCircle, Fingerprint, MapPin, ShieldCheck } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { getRuleColor, RULE_COLORS } from '../constants';
import {
  toISTDatetimeLocal,
  toISTDatetimeLocalFromOffset,
  istDatetimeLocalToEpochMs,
  istDatetimeLocalToBackendStr,
  formatISTDateTime,
} from '../utils/istUtils';

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'rgba(15,23,42,0.95)',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '0.8rem',
  },
  labelStyle: { color: '#94a3b8' },
};

const AXIS_STROKE = '#94a3b8';
const GRID_PROPS = { strokeDasharray: '3 3', stroke: '#334155' };
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const BREACH_RED = '#ef4444';
const ACCENT_BLUE = '#6366f1';
const DONUT_PALETTE = ['#6366f1', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#a855f7'];

// formatTime: always display timestamps in IST
function formatTime(ts) {
  return formatISTDateTime(ts);
}

export default function HistoricalAnalysis({ rules, selectedRuleId, prefill }) {
  // Initialize datetime-local values in IST (not browser local time)
  const [startTs, setStartTs] = useState(() => toISTDatetimeLocal(Date.now() - 24 * 60 * 60 * 1000));
  const [endTs, setEndTs] = useState(() => toISTDatetimeLocal(Date.now()));
  const [data, setData] = useState([]);
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortCol, setSortCol] = useState('totalValue');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedGroup, setSelectedGroup] = useState('__ALL__');
  const abortRef = useRef(null);

  // A rule change should reset any group filter left over from the previous rule.
  useEffect(() => { setSelectedGroup('__ALL__'); }, [selectedRuleId]);

  const selectedRule = useMemo(
    () => rules.find(r => r.rule_metadata.rule_id === selectedRuleId),
    [rules, selectedRuleId]
  );

  // min = 7 days ago, max = now: past-7-day lookback, future dates blocked.
  const minDate = toISTDatetimeLocalFromOffset(-7 * 24 * 60 * 60 * 1000);
  const maxDate = toISTDatetimeLocal(Date.now());

  // Validate: start before end, end not in future, start not older than 7 days.
  const validate = () => {
    const startEpoch = istDatetimeLocalToEpochMs(startTs);
    const endEpoch   = istDatetimeLocalToEpochMs(endTs);
    const nowEpoch   = Date.now();
    if (isNaN(startEpoch) || isNaN(endEpoch)) return 'Invalid date format.';
    if (startEpoch >= endEpoch) return 'Start time must be before end time.';
    if (endEpoch > nowEpoch + 60000) return 'End time cannot be in the future.';
    if (startEpoch < nowEpoch - 7 * 24 * 60 * 60 * 1000) return 'Start cannot be more than 7 days ago.';
    return '';
  };

  /* Get aggregation aliases from the rule's aggregations array */
  const aggAliases = useMemo(() => {
    if (!selectedRule || !selectedRule.aggregations) return [];
    return selectedRule.aggregations.map(a => a.alias);
  }, [selectedRule]);

  const fetchData = useCallback(async () => {
    if (!selectedRule) {
      setError('Select a rule from the sidebar first.');
      return;
    }
    const validationErr = validate();
    if (validationErr) {
      setError(validationErr);
      return;
    }
    setError('');
    setLoading(true);
    setData([]);
    setBreakdown(null);

    // Cancel any previous in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    // Convert IST datetime-local values to naive IST strings that the Go backend
    // parseIST() function expects: "YYYY-MM-DD HH:MM:SS"
    const sFormatted = istDatetimeLocalToBackendStr(startTs);
    const eFormatted = istDatetimeLocalToBackendStr(endTs);
    const qs = `start_ts=${encodeURIComponent(sFormatted)}&end_ts=${encodeURIComponent(eFormatted)}`;

    try {
      // Fetch the windowed replay and the forensic breakdown in parallel —
      // the breakdown is supplementary drill-down context, so its failure
      // shouldn't block the primary replay result from showing.
      const [analysisRes, breakdownRes] = await Promise.allSettled([
        fetch(`/api/rules/historical-analysis?${qs}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(selectedRule),
          signal: controller.signal,
        }),
        fetch(`/api/rules/historical-breakdown?${qs}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(selectedRule),
          signal: controller.signal,
        }),
      ]);

      if (analysisRes.status === 'fulfilled' && analysisRes.value.ok) {
        const json = await analysisRes.value.json();
        setData(json.results || []);
      } else if (analysisRes.status === 'fulfilled') {
        const errJson = await analysisRes.value.json().catch(() => ({}));
        setError(errJson.detail || 'Server returned an error. Check backend logs.');
      } else if (analysisRes.reason?.name !== 'AbortError') {
        console.error('Historical fetch error:', analysisRes.reason);
        setError('Network error fetching data.');
      }

      if (breakdownRes.status === 'fulfilled' && breakdownRes.value.ok) {
        const json = await breakdownRes.value.json();
        setBreakdown(json.result || null);
      }
      // Breakdown failure is non-critical — silently continue with the primary result.
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [selectedRule, startTs, endTs]);

  // Cross-panel drill-through from the Anomaly feed: apply the prefilled
  // date range (rule selection itself is driven by the parent's selectedRuleId,
  // set by the same drill-through action), then auto-run the query exactly once
  // per prefill instance (nonce) once the derived state has actually settled to
  // match — avoids firing on stale startTs/endTs from the previous tab.
  const prefillAppliedNonceRef = useRef(null);

  useEffect(() => {
    if (!prefill) return;
    setStartTs(prefill.startTs);
    setEndTs(prefill.endTs);
  }, [prefill]);

  useEffect(() => {
    if (!prefill) return;
    if (prefillAppliedNonceRef.current === prefill.nonce) return;
    if (selectedRuleId !== prefill.ruleId) return;
    if (startTs !== prefill.startTs || endTs !== prefill.endTs) return;
    prefillAppliedNonceRef.current = prefill.nonce;
    fetchData();
  }, [prefill, selectedRuleId, startTs, endTs, fetchData]);

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLoading(false);
    setError('');
  }, []);

  /* ───── Derived data ───── */

  // ─── Group-by filter — only offered for rules that actually group by a
  // non-global key, and populated dynamically from whatever groups appear in
  // the fetched data. Selecting a group narrows the charts below to just that
  // group; the Entity Details table and the two per-entity bar charts
  // intentionally stay unfiltered so they can still be used to compare across
  // groups. The forensic breakdown panels are computed server-side over the
  // full result set and aren't filterable client-side.
  const showGroupFilter = !!(selectedRule && Array.isArray(selectedRule.grouping?.keys) && selectedRule.grouping.keys.length > 0);

  const availableGroups = useMemo(() => {
    const set = new Set();
    for (const row of data) {
      if (row.groupKey) set.add(row.groupKey);
    }
    return [...set].sort();
  }, [data]);

  const chartRows = useMemo(() => {
    if (selectedGroup === '__ALL__') return data;
    return data.filter(r => r.groupKey === selectedGroup);
  }, [data, selectedGroup]);

  const totalMatches = chartRows.length;
  const uniqueGroupKeys = useMemo(() => new Set(chartRows.map(r => r.groupKey)).size, [chartRows]);

  /* Area chart: aggregation values over time */
  const areaChartData = useMemo(() => {
    const timeMap = {};
    for (const row of chartRows) {
      const ts = row.window_start;
      if (!timeMap[ts]) timeMap[ts] = { window_start: ts };
      for (const alias of aggAliases) {
        const existing = timeMap[ts][alias] || 0;
        timeMap[ts][alias] = existing + (row[alias] || 0);
      }
    }
    return Object.values(timeMap).sort((a, b) => new Date(a.window_start) - new Date(b.window_start));
  }, [chartRows, aggAliases]);

  /* Top group keys table */
  const groupTableData = useMemo(() => {
    const groupMap = {};
    for (const row of data) {
      const gk = row.groupKey || 'N/A';
      if (!groupMap[gk]) {
        groupMap[gk] = { groupKey: gk, totalValue: 0, count: 0, lastSeen: row.window_start };
      }
      groupMap[gk].count += 1;
      for (const alias of aggAliases) {
        groupMap[gk].totalValue += row[alias] || 0;
      }
      if (row.window_start > groupMap[gk].lastSeen) groupMap[gk].lastSeen = row.window_start;
    }
    const arr = Object.values(groupMap);
    arr.sort((a, b) => {
      const aVal = a[sortCol];
      const bVal = b[sortCol];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
      }
      return sortDir === 'desc'
        ? String(bVal).localeCompare(String(aVal))
        : String(aVal).localeCompare(String(bVal));
    });
    return arr.slice(0, 20);
  }, [data, sortCol, sortDir, aggAliases]);

  /* Breach density heatmap: IST day x hour grid. Cell value = matched-window
     count; cell is flagged breached if any window in that hour breached
     (threshold_met, returned by the historical-analysis query). Built
     client-side from data already fetched — no backend dependency. */
  const heatmapData = useMemo(() => {
    const grid = {}; // dayKey -> [{count, breached}] x24
    for (const row of chartRows) {
      const ts = row.window_start;
      if (!ts) continue;
      const raw = String(ts).replace(' ', 'T');
      const d = new Date(raw.includes('+') || raw.endsWith('Z') ? raw : raw + '+05:30');
      if (isNaN(d.getTime())) continue;
      const istDate = new Date(d.getTime() + IST_OFFSET_MS);
      const dayKey = `${istDate.getUTCFullYear()}-${String(istDate.getUTCMonth() + 1).padStart(2, '0')}-${String(istDate.getUTCDate()).padStart(2, '0')}`;
      const hour = istDate.getUTCHours();
      if (!grid[dayKey]) grid[dayKey] = Array.from({ length: 24 }, () => ({ count: 0, breached: false }));
      grid[dayKey][hour].count += 1;
      if (row.threshold_met === true || row.threshold_met === 1) grid[dayKey][hour].breached = true;
    }
    const dayKeys = Object.keys(grid).sort();
    const maxCount = Math.max(1, ...dayKeys.flatMap(dk => grid[dk].map(c => c.count)));
    return { dayKeys, grid, maxCount };
  }, [chartRows]);

  /* Bar chart: group key distribution */
  const groupBarData = useMemo(() => {
    return groupTableData.slice(0, 10).map(g => ({
      groupKey: g.groupKey.length > 20 ? g.groupKey.slice(0, 20) + '...' : g.groupKey,
      matches: g.count,
      totalAgg: g.totalValue,
    }));
  }, [groupTableData]);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  const ruleColor = selectedRule ? getRuleColor(rules, selectedRuleId) : '#3b82f6';
  const hasData = data.length > 0;

  const thStyle = {
    textAlign: 'left', padding: '0.5rem 0.6rem', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.75rem',
    textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', userSelect: 'none',
    borderBottom: '1px solid var(--glass-border)',
  };
  const tdStyle = { padding: '0.45rem 0.6rem', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.04)' };

  /* ───── Empty state: no selected rule ───── */
  if (!selectedRuleId) {
    return (
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '500px', gap: '1.5rem' }}>
        <History size={64} color="var(--text-muted)" style={{ opacity: 0.3 }} />
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-2)', fontSize: '1rem', fontWeight: 600, margin: '0 0 0.4rem' }}>Select a rule to begin</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0, maxWidth: 380 }}>
            Choose a rule from the sidebar, pick a time range, and run a replay to see how that rule would have performed against real past traffic.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div className="glass-panel" style={{ paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Database size={16} color="#fff" strokeWidth={2.2} />
          </div>
          <h2 style={{ color: 'var(--text-1)', margin: 0, fontSize: '0.95rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Historical Rule Replay</h2>
        </div>
        <p style={{ color: 'var(--text-3)', fontSize: '0.73rem', margin: 0 }}>
          Test how this rule would have performed against real past traffic — no need to wait and see it happen live. Max lookback: 7 days.
        </p>
      </div>

      {/* Historical replay always windows/filters by the ingestion timestamp
          column, regardless of a rule's live windowing.timestamp_field — see
          RunHistoricalAnalysis in the backend. Surface that divergence here so
          analysts aren't confused when a custom-timestamp rule's replay doesn't
          match its live behavior. */}
      {selectedRule &&
        selectedRule.windowing?.time_type === 'EVENT_TIME' &&
        !selectedRule.windowing?.use_kafka_timestamp &&
        selectedRule.windowing?.timestamp_field &&
        selectedRule.windowing.timestamp_field !== '_event_timestamp_epoch_ms' && (
        <div style={{
          background: 'rgba(234,179,8,0.1)',
          border: '1px solid rgba(234,179,8,0.3)',
          borderRadius: '8px',
          padding: '0.6rem 1rem',
          color: '#fde68a',
          fontSize: '0.78rem',
        }}>
          Heads up: this rule normally times events using its own <strong>{selectedRule.windowing.timestamp_field}</strong> field,
          but this replay uses the time each event first arrived in our system instead — so results here may differ slightly from what this rule does live.
        </div>
      )}

      {/* Group-by filter — only shown for rules that group by a non-global key */}
      {showGroupFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Select Entity</label>
          <select
            value={selectedGroup}
            onChange={e => setSelectedGroup(e.target.value)}
            style={{ maxWidth: 260 }}
            title="Filter the charts below to a single entity. Entity tables and charts always show every entity."
          >
            <option value="__ALL__">All Entities (Overview)</option>
            {availableGroups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      )}

      {/* Date Range */}
      <div className="date-picker-row">
        <div className="form-group" style={{ flex: 1, marginBottom: 0, minWidth: 200 }}>
          <label className="form-label">From (IST)</label>
          <input type="datetime-local" value={startTs} onChange={e => setStartTs(e.target.value)} min={minDate} max={maxDate} />
        </div>
        <div className="form-group" style={{ flex: 1, marginBottom: 0, minWidth: 200 }}>
          <label className="form-label">To (IST)</label>
          <input type="datetime-local" value={endTs} onChange={e => setEndTs(e.target.value)} min={minDate} max={maxDate} />
        </div>
        <button
          className="btn btn-accent"
          onClick={fetchData}
          disabled={loading}
          style={{ height: 40, minWidth: 145, justifyContent: 'center', gap: '0.4rem' }}
        >
          {loading ? (
            <>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Computing…
            </>
          ) : <><History size={14} /> Run Replay</> }
        </button>
        {loading && (
          <button
            className="btn btn-ghost"
            onClick={handleStop}
            title="Cancel the running query"
            style={{
              height: 40, minWidth: 90, justifyContent: 'center', gap: '0.4rem',
              borderColor: 'var(--danger)', color: 'var(--danger)',
            }}
          >
            <XCircle size={14} /> Stop
          </button>
        )}
      </div>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px',
          padding: '0.6rem 1rem',
          color: '#fca5a5',
          fontSize: '0.85rem',
        }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '0.75rem' }}>
          <Loader2 size={28} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Querying historical data…</span>
        </div>
      )}

      {!loading && !hasData && !error && (
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem' }}>
          <Database size={48} color="var(--text-muted)" style={{ opacity: 0.4 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', textAlign: 'center' }}>
            Select a time range and click <strong>Run Replay</strong> to see how this rule would have performed.
          </p>
        </div>
      )}

      {!loading && hasData && selectedRule && (
        <>
          {/* Rule name banner */}
          <div style={{
            background: `${ruleColor}15`,
            border: `1px solid ${ruleColor}40`,
            borderRadius: '8px',
            padding: '0.6rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
          }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: ruleColor }} />
            <span style={{ color: 'white', fontWeight: 600, fontSize: '1rem' }}>{selectedRule.rule_metadata.rule_name}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: 'auto' }}>
              {data.length} matching events found
            </span>
          </div>

          {/* Metric Cards */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="metric-card" style={{ flex: 1, minWidth: 140 }}>
              <h3>Matching Events</h3>
              <div className="value">{totalMatches.toLocaleString()}</div>
            </div>
            <div className="metric-card" style={{ flex: 1, minWidth: 140 }}>
              <h3>Unique Entities</h3>
              <div className="value">{uniqueGroupKeys.toLocaleString()}</div>
            </div>
            {aggAliases.map((alias, ai) => {
              const total = chartRows.reduce((s, r) => s + (r[alias] || 0), 0);
              return (
                <div key={alias} className="metric-card" style={{ flex: 1, minWidth: 140 }}>
                  <h3>Total {alias}</h3>
                  <div className="value">{typeof total === 'number' ? total.toLocaleString() : total}</div>
                </div>
              );
            })}
          </div>

          {/* Aggregation Values Area Chart */}
          {/* height set explicitly: the shared .chart-container CSS class is a
              fixed 280px, but this chart's ResponsiveContainer is 350px tall —
              left at the CSS default, the chart content overflowed the box and
              visually overlapped the "Top Group Keys" row below it. Spacing
              below this container (and every sibling in this panel) comes
              from the single `gap: '2rem'` on the outer flex column above —
              intentionally not adding a one-off margin here, so every gap in
              the panel stays equal instead of stacking and drifting apart. */}
          <div className="chart-container" style={{ height: 410 }}>
            <div className="chart-title">Metric Trend Over Time</div>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={areaChartData} margin={{ top: 8 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="window_start" stroke={AXIS_STROKE} tick={{ fontSize: 11 }} tickFormatter={formatTime} />
                <YAxis stroke={AXIS_STROKE} tick={{ fontSize: 11 }} />
                <Tooltip {...TOOLTIP_STYLE} labelFormatter={formatTime} />
                <Legend verticalAlign="top" align="left" wrapperStyle={{ paddingBottom: '0.75rem', fontSize: '0.78rem' }} />
                {aggAliases.map((alias, i) => (
                  <Area
                    key={alias}
                    type="monotone"
                    dataKey={alias}
                    stroke={RULE_COLORS[i % RULE_COLORS.length]}
                    fill={RULE_COLORS[i % RULE_COLORS.length]}
                    fillOpacity={0.15}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Two side-by-side — spacing above comes from the outer flex
              column's gap (see comment above), kept equal with every other
              gap in this panel rather than adding a one-off margin here. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Left: Top Group Keys Bar Chart */}
            <div className="chart-container" style={{ height: 340 }}>
              <div className="chart-title">Most Active Entities</div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={groupBarData} layout="vertical">
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis type="number" stroke={AXIS_STROKE} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="groupKey" stroke={AXIS_STROKE} tick={{ fontSize: 10 }} width={130} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="matches" fill={ruleColor} radius={[0, 4, 4, 0]} name="Times Matched" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Right: Aggregation per alias bar chart */}
            <div className="chart-container" style={{ height: 340 }}>
              <div className="chart-title">Total Activity per Entity</div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={groupBarData} layout="vertical">
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis type="number" stroke={AXIS_STROKE} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="groupKey" stroke={AXIS_STROKE} tick={{ fontSize: 10 }} width={130} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="totalAgg" fill={RULE_COLORS[1]} radius={[0, 4, 4, 0]} name="Total Activity" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Group Keys Table — height:'auto' overrides the shared
              .chart-container's fixed 280px so a variable-length table (up to
              20 rows) isn't clipped/overflowed the same way the charts above
              were. Spacing above comes from the outer flex column's gap. */}
          <div className="chart-container" style={{ height: 'auto' }}>
            <div className="chart-title">Entity Details</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle} onClick={() => handleSort('groupKey')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Entity <ArrowUpDown size={12} /></span>
                    </th>
                    <th style={thStyle} onClick={() => handleSort('count')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Times Matched <ArrowUpDown size={12} /></span>
                    </th>
                    <th style={thStyle} onClick={() => handleSort('totalValue')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Total Activity <ArrowUpDown size={12} /></span>
                    </th>
                    <th style={thStyle} onClick={() => handleSort('lastSeen')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Last Seen <ArrowUpDown size={12} /></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groupTableData.map((g, i) => (
                    <tr key={g.groupKey} style={{ borderLeft: `3px solid ${ruleColor}` }}>
                      <td style={tdStyle}>{i + 1}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#93c5fd' }}>{g.groupKey}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{g.count.toLocaleString()}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{typeof g.totalValue === 'number' ? g.totalValue.toLocaleString() : g.totalValue}</td>
                      <td style={{ ...tdStyle, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatTime(g.lastSeen)}</td>
                    </tr>
                  ))}
                  {groupTableData.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                        No group data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Breach Density Heatmap — IST day x hour grid, built client-side
              from the replay data already fetched above. Multi-day queries
              make this far more useful here than on Live's rolling 24h view. */}
          {heatmapData.dayKeys.length > 0 && (
            <div className="chart-container" style={{ height: 'auto' }}>
              <div className="chart-title">
                Breach Density Heatmap
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 10 }}>IST hour of day × date</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '70px repeat(24, 1fr)', gap: 2, minWidth: 620 }}>
                  <div />
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div key={h} style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: 'center' }}>{h}</div>
                  ))}
                  {heatmapData.dayKeys.map(dayKey => (
                    <React.Fragment key={dayKey}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-2)', display: 'flex', alignItems: 'center' }}>{dayKey.slice(5)}</div>
                      {heatmapData.grid[dayKey].map((cell, h) => {
                        const intensity = cell.count > 0 ? 0.15 + 0.75 * (cell.count / heatmapData.maxCount) : 0;
                        const bg = cell.count === 0
                          ? 'rgba(255,255,255,0.03)'
                          : cell.breached
                            ? `rgba(239,68,68,${intensity})`
                            : `rgba(99,102,241,${intensity})`;
                        return (
                          <div
                            key={h}
                            title={`${dayKey} ${String(h).padStart(2, '0')}:00 IST — ${cell.count} matched window${cell.count !== 1 ? 's' : ''}${cell.breached ? ' (breach)' : ''}`}
                            style={{ height: 16, borderRadius: 3, background: bg }}
                          />
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: '0.75rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(99,102,241,0.7)' }} /> Normal</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(239,68,68,0.7)' }} /> Breach present</span>
              </div>
            </div>
          )}

          {/* Forensic Breakdown — modality mix, auth outcome, geographic
              hotspot, fingerprint match-score histogram — computed over the
              exact same matched rows as the replay above, via the
              historical-breakdown endpoint. Supplementary context, so it's
              simply absent (not an error state) if that call didn't return. */}
          {breakdown && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1rem' }}>
              {breakdown.modality_mix && breakdown.modality_mix.length > 0 && (
                <div className="chart-container" style={{ height: 300 }}>
                  <div className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Modality = the authentication method used for the transaction (e.g. fingerprint, iris, OTP, face).">
                    <ShieldCheck size={13} style={{ opacity: 0.7 }} /> Modality Mix
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>(auth method used)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', height: 240 }}>
                    <div style={{ width: 140, height: 140, flexShrink: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={breakdown.modality_mix} dataKey="count" nameKey="label" innerRadius={38} outerRadius={65} paddingAngle={2} isAnimationActive={false}>
                            {breakdown.modality_mix.map((_, i) => <Cell key={i} fill={DONUT_PALETTE[i % DONUT_PALETTE.length]} />)}
                          </Pie>
                          <Tooltip {...TOOLTIP_STYLE} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, overflowY: 'auto', maxHeight: 220 }}>
                      {breakdown.modality_mix.map((m, i) => (
                        <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: DONUT_PALETTE[i % DONUT_PALETTE.length], flexShrink: 0 }} />
                          <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                          <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', fontWeight: 600 }}>{m.count.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {breakdown.auth_outcome && breakdown.auth_outcome.length > 0 && (
                <div className="chart-container" style={{ height: 300 }}>
                  <div className="chart-title">Auth Outcome Breakdown</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={breakdown.auth_outcome} layout="vertical">
                      <CartesianGrid {...GRID_PROPS} />
                      <XAxis type="number" stroke={AXIS_STROKE} tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="label" stroke={AXIS_STROKE} tick={{ fontSize: 10 }} width={100} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Bar dataKey="count" fill={ACCENT_BLUE} radius={[0, 4, 4, 0]} name="Matched Events" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {breakdown.geo_hotspot && breakdown.geo_hotspot.length > 0 && (
                <div className="chart-container" style={{ height: 'auto' }}>
                  <div className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={13} style={{ opacity: 0.7 }} /> Geographic Hotspot — Top States</div>
                  <div style={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={thStyle}>#</th>
                          <th style={thStyle}>State Code</th>
                          <th style={thStyle}>Matched Events</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.geo_hotspot.map((g, i) => (
                          <tr key={g.label}>
                            <td style={tdStyle}>{i + 1}</td>
                            <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#93c5fd' }}>{g.label}</td>
                            <td style={{ ...tdStyle, fontWeight: 600 }}>{g.count.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {breakdown.match_score_histogram && breakdown.match_score_histogram.length > 0 && (
                <div className="chart-container" style={{ height: 300 }}>
                  <div className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="How closely each fingerprint matched the record on file — higher scores mean higher confidence.">
                    <Fingerprint size={13} style={{ opacity: 0.7 }} /> Fingerprint Match Confidence
                  </div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={breakdown.match_score_histogram}>
                      <CartesianGrid {...GRID_PROPS} />
                      <XAxis dataKey="label" stroke={AXIS_STROKE} tick={{ fontSize: 10 }} />
                      <YAxis stroke={AXIS_STROKE} tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Bar dataKey="count" fill={BREACH_RED} radius={[3, 3, 0, 0]} name="Events" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
