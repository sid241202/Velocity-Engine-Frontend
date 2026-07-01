import React, { useState, useMemo, useCallback, useRef } from 'react';
import { History, Loader2, ArrowUpDown, Database, XCircle } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer
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

// formatTime: always display timestamps in IST
function formatTime(ts) {
  return formatISTDateTime(ts);
}

export default function HistoricalAnalysis({ rules, selectedRuleIds }) {
  // Initialize datetime-local values in IST (not browser local time)
  const [startTs, setStartTs] = useState(() => toISTDatetimeLocal(Date.now() - 24 * 60 * 60 * 1000));
  const [endTs, setEndTs] = useState(() => toISTDatetimeLocal(Date.now()));
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortCol, setSortCol] = useState('totalValue');
  const [sortDir, setSortDir] = useState('desc');
  const abortRef = useRef(null);

  const selectedRulesArr = useMemo(
    () => rules.filter(r => selectedRuleIds.has(r.rule_metadata.rule_id)),
    [rules, selectedRuleIds]
  );

  /* Historical analysis: one rule at a time. Use dropdown to pick from selected rules. */
  const [chosenRuleId, setChosenRuleId] = useState('');

  /* Auto-select the first selected rule */
  const effectiveRuleId = useMemo(() => {
    if (chosenRuleId && selectedRuleIds.has(chosenRuleId)) return chosenRuleId;
    if (selectedRulesArr.length > 0) return selectedRulesArr[0].rule_metadata.rule_id;
    return '';
  }, [chosenRuleId, selectedRuleIds, selectedRulesArr]);

  const selectedRule = useMemo(
    () => rules.find(r => r.rule_metadata.rule_id === effectiveRuleId),
    [rules, effectiveRuleId]
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

    try {
      const res = await fetch(
        `/api/rules/historical-analysis?start_ts=${encodeURIComponent(sFormatted)}&end_ts=${encodeURIComponent(eFormatted)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(selectedRule),
          signal: controller.signal,
        }
      );
      if (res.ok) {
        const json = await res.json();
        setData(json.results || []);
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.detail || 'Server returned an error. Check backend logs.');
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        setError('');
        // loading already cleared below
      } else {
        console.error('Historical fetch error:', e);
        setError('Network error fetching data.');
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [selectedRule, startTs, endTs]);

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLoading(false);
    setError('');
  }, []);

  /* ───── Derived data ───── */
  const totalMatches = data.length;
  const uniqueGroupKeys = useMemo(() => new Set(data.map(r => r.groupKey)).size, [data]);

  /* Area chart: aggregation values over time */
  const areaChartData = useMemo(() => {
    const timeMap = {};
    for (const row of data) {
      const ts = row.window_start;
      if (!timeMap[ts]) timeMap[ts] = { window_start: ts };
      for (const alias of aggAliases) {
        const existing = timeMap[ts][alias] || 0;
        timeMap[ts][alias] = existing + (row[alias] || 0);
      }
    }
    return Object.values(timeMap).sort((a, b) => new Date(a.window_start) - new Date(b.window_start));
  }, [data, aggAliases]);

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

  const ruleColor = selectedRule ? getRuleColor(rules, effectiveRuleId) : '#3b82f6';
  const hasData = data.length > 0;

  const thStyle = {
    textAlign: 'left', padding: '0.5rem 0.6rem', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.75rem',
    textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', userSelect: 'none',
    borderBottom: '1px solid var(--glass-border)',
  };
  const tdStyle = { padding: '0.45rem 0.6rem', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.04)' };

  /* ───── Empty state: no selected rules ───── */
  if (selectedRuleIds.size === 0) {
    return (
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '500px', gap: '1.5rem' }}>
        <History size={64} color="var(--text-muted)" style={{ opacity: 0.3 }} />
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-2)', fontSize: '1rem', fontWeight: 600, margin: '0 0 0.4rem' }}>Select a rule to begin</p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0, maxWidth: 380 }}>
            Choose a rule from the sidebar, pick a time range, and run a historical query against Iceberg to see how that rule would have performed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="glass-panel" style={{ paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Database size={16} color="#fff" strokeWidth={2.2} />
          </div>
          <h2 style={{ color: 'var(--text-1)', margin: 0, fontSize: '0.95rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Historical Rule Replay</h2>
        </div>
        <p style={{ color: 'var(--text-3)', fontSize: '0.73rem', margin: 0 }}>
          Replay a rule against historical data from ClickHouse to see how it would have performed. Max lookback: 7 days.
        </p>
      </div>

      {/* Rule Picker + Date Range */}
      <div className="date-picker-row">
        {selectedRulesArr.length > 1 && (
          <div className="form-group" style={{ flex: 1.5, marginBottom: 0, minWidth: 200 }}>
            <label className="form-label">Select Rule to Replay</label>
            <select value={effectiveRuleId} onChange={e => setChosenRuleId(e.target.value)}>
              {selectedRulesArr.map(r => (
                <option key={r.rule_metadata.rule_id} value={r.rule_metadata.rule_id}>
                  {r.rule_metadata.rule_name}
                </option>
              ))}
            </select>
          </div>
        )}
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
            Select a time range and click <strong>Run Replay</strong> to query historical data from ClickHouse.
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
              {data.length} matched rows returned
            </span>
          </div>

          {/* Metric Cards */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="metric-card" style={{ flex: 1, minWidth: 140 }}>
              <h3>Matched Rows</h3>
              <div className="value">{totalMatches.toLocaleString()}</div>
            </div>
            <div className="metric-card" style={{ flex: 1, minWidth: 140 }}>
              <h3>Unique Groups</h3>
              <div className="value">{uniqueGroupKeys.toLocaleString()}</div>
            </div>
            {aggAliases.map((alias, ai) => {
              const total = data.reduce((s, r) => s + (r[alias] || 0), 0);
              return (
                <div key={alias} className="metric-card" style={{ flex: 1, minWidth: 140 }}>
                  <h3>Σ {alias}</h3>
                  <div className="value">{typeof total === 'number' ? total.toLocaleString() : total}</div>
                </div>
              );
            })}
          </div>

          {/* Aggregation Values Area Chart */}
          <div className="chart-container">
            <div className="chart-title">Aggregation Values Over Time</div>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={areaChartData}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="window_start" stroke={AXIS_STROKE} tick={{ fontSize: 11 }} tickFormatter={formatTime} />
                <YAxis stroke={AXIS_STROKE} tick={{ fontSize: 11 }} />
                <Tooltip {...TOOLTIP_STYLE} labelFormatter={formatTime} />
                <Legend />
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

          {/* Two side-by-side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Left: Top Group Keys Bar Chart */}
            <div className="chart-container">
              <div className="chart-title">Top Group Keys by Matches</div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={groupBarData} layout="vertical">
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis type="number" stroke={AXIS_STROKE} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="groupKey" stroke={AXIS_STROKE} tick={{ fontSize: 10 }} width={130} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="matches" fill={ruleColor} radius={[0, 4, 4, 0]} name="Matched Windows" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Right: Aggregation per alias bar chart */}
            <div className="chart-container">
              <div className="chart-title">Aggregation Totals by Group</div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={groupBarData} layout="vertical">
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis type="number" stroke={AXIS_STROKE} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="groupKey" stroke={AXIS_STROKE} tick={{ fontSize: 10 }} width={130} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="totalAgg" fill={RULE_COLORS[1]} radius={[0, 4, 4, 0]} name="Total Agg Value" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Group Keys Table */}
          <div className="chart-container">
            <div className="chart-title">Group Key Details</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle} onClick={() => handleSort('groupKey')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Group Key <ArrowUpDown size={12} /></span>
                    </th>
                    <th style={thStyle} onClick={() => handleSort('count')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Matched Windows <ArrowUpDown size={12} /></span>
                    </th>
                    <th style={thStyle} onClick={() => handleSort('totalValue')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Total Agg Value <ArrowUpDown size={12} /></span>
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
        </>
      )}
    </div>
  );
}
