import React, { useState, useMemo, useCallback } from 'react';
import { BarChart3, ArrowUpDown, Loader2, TrendingUp, AlertTriangle, Clock, Target } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Brush, ReferenceLine, Cell
} from 'recharts';
import { getRuleColor } from '../constants';
import {
  toISTDatetimeLocal,
  toISTDatetimeLocalFromOffset,
  istDatetimeLocalToBackendStr,
  validateISTRange,
  formatISTDateTime,
} from '../utils/istUtils';

function isBreached(row) {
  return row.thresholdBreached === 1 || row.thresholdBreached === true
    || row.thresholdMet === 1 || row.thresholdMet === true;
}

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
const DASH_PATTERNS = ['', '5 5', '8 4', '3 6', '10 3', '4 4 2 4'];

// formatTime: always display timestamps in IST
function formatTime(ts) {
  return formatISTDateTime(ts);
}

function getBreachColor(rate) {
  if (rate < 10) return '#22c55e';
  if (rate <= 30) return '#f59e0b';
  return '#ef4444';
}

function formatHourRange(hour) {
  const pad = (n) => String(n).padStart(2, '0');
  const nextHour = (hour + 1) % 24;
  return `${pad(hour)}:00–${pad(nextHour)}:00`;
}

export default function AggregatedAnalysis({ rules, selectedRuleIds }) {
  // Initialize datetime-local values in IST (not browser local time)
  const [startTs, setStartTs] = useState(() => toISTDatetimeLocal(Date.now() - 24 * 60 * 60 * 1000));
  const [endTs, setEndTs] = useState(() => toISTDatetimeLocal(Date.now()));
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortCol, setSortCol] = useState('breachRate');
  const [sortDir, setSortDir] = useState('desc');

  const selectedRules = useMemo(
    () => rules.filter(r => selectedRuleIds.has(r.rule_metadata.rule_id)),
    [rules, selectedRuleIds]
  );

  // min/max for datetime-local inputs — computed in IST
  const minDate = toISTDatetimeLocalFromOffset(-7 * 24 * 60 * 60 * 1000);
  const maxDate = toISTDatetimeLocal(Date.now());

  const validate = () => validateISTRange(startTs, endTs);

  const fetchData = useCallback(async () => {
    if (selectedRuleIds.size === 0) {
      setError('Select at least one rule from the sidebar.');
      return;
    }
    const validationErr = validate();
    if (validationErr) {
      setError(validationErr);
      return;
    }
    setError('');
    setLoading(true);
    const ids = [...selectedRuleIds].join(',');
    // Send naive IST strings to ClickHouse via backend — parseDateTimeBestEffort handles them
    // correctly as IST when the ClickHouse table uses 'Asia/Kolkata' timezone.
    // DO NOT convert to UTC ISO — that shifts the window by 5.5 hours.
    const sFormatted = istDatetimeLocalToBackendStr(startTs);
    const eFormatted = istDatetimeLocalToBackendStr(endTs);
    try {
      const res = await fetch(
        `/api/rules/agg-analysis?rule_ids=${ids}&start_ts=${encodeURIComponent(sFormatted)}&end_ts=${encodeURIComponent(eFormatted)}`
      );
      if (res.ok) {
        const json = await res.json();
        setData(json.results || {});
      } else {
        const errJson = await res.json().catch(() => ({}));
        setError(errJson.detail || 'Server returned an error. Check backend logs.');
      }
    } catch (e) {
      console.error('Agg fetch error:', e);
      setError('Network error fetching data.');
    } finally {
      setLoading(false);
    }
  }, [selectedRuleIds, startTs, endTs]);

  const getRuleName = useCallback((ruleId) => {
    const match = rules.find(rule => rule.rule_metadata.rule_id === ruleId);
    return match ? match.rule_metadata.rule_name : ruleId;
  }, [rules]);

  /* ───── Compute derived data ───── */
  const allRows = useMemo(() => {
    const rows = [];
    for (const [ruleId, arr] of Object.entries(data)) {
      if (!selectedRuleIds.has(ruleId)) continue;
      (arr || []).forEach(row => rows.push({ ...row, ruleId }));
    }
    return rows;
  }, [data, selectedRuleIds]);

  const totalWindows = useMemo(() => allRows.length, [allRows]);
  const totalBreaches = useMemo(() => allRows.filter(r => isBreached(r)).length, [allRows]);
  const breachRate = useMemo(() => totalWindows > 0 ? (totalBreaches / totalWindows * 100) : 0, [totalBreaches, totalWindows]);
  const uniqueGroups = useMemo(() => new Set(allRows.map(r => r.groupKey)).size, [allRows]);
  const totalEvents = useMemo(() => allRows.reduce((s, r) => s + (r.eventCount || 0), 0), [allRows]);
  const avgEventsPerWindow = useMemo(() => totalWindows > 0 ? (totalEvents / totalWindows).toFixed(1) : '0.0', [totalEvents, totalWindows]);

  /* ───── Peak Hour (most activity) ───── */
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const peakHour = useMemo(() => {
    if (allRows.length === 0) return null;
    const hourMap = {};
    for (const row of allRows) {
      // Parse space-separated IST string as IST by appending +05:30
      const raw = String(row.windowStart || '').replace(' ', 'T');
      const d = new Date(raw.includes('+') || raw.endsWith('Z') ? raw : raw + '+05:30');
      if (isNaN(d.getTime())) continue;
      // Extract IST hour using UTC offset trick
      const istWall = new Date(d.getTime() + IST_OFFSET_MS);
      const h = istWall.getUTCHours();
      hourMap[h] = (hourMap[h] || 0) + 1;
    }
    let maxH = 0;
    let maxCount = 0;
    for (const [h, count] of Object.entries(hourMap)) {
      if (count > maxCount) {
        maxCount = count;
        maxH = parseInt(h, 10);
      }
    }
    return { hour: maxH, count: maxCount };
  }, [allRows]);

  /* ───── Breach timestamps for reference lines ───── */
  const breachTimestamps = useMemo(() => {
    const set = new Set();
    for (const row of allRows) {
      if (isBreached(row)) {
        set.add(row.windowStart);
      }
    }
    return [...set];
  }, [allRows]);

  /* ───── Auto-Insights ───── */
  const peakBreachPeriod = useMemo(() => {
    const breachRows = allRows.filter(r => isBreached(r));
    if (breachRows.length === 0) return null;
    const hourMap = {};
    for (const row of breachRows) {
      const d = new Date(row.windowStart);
      if (isNaN(d.getTime())) continue;
      const h = d.getHours();
      hourMap[h] = (hourMap[h] || 0) + 1;
    }
    let peakH = 0;
    let peakCount = 0;
    for (const [h, count] of Object.entries(hourMap)) {
      if (count > peakCount) {
        peakCount = count;
        peakH = parseInt(h, 10);
      }
    }
    return { hour: peakH, count: peakCount };
  }, [allRows]);

  const mostAtRiskGroup = useMemo(() => {
    if (allRows.length === 0) return null;
    const groupMap = {};
    for (const row of allRows) {
      const gk = row.groupKey || 'N/A';
      if (!groupMap[gk]) groupMap[gk] = { total: 0, breaches: 0 };
      groupMap[gk].total += 1;
      if (isBreached(row)) groupMap[gk].breaches += 1;
    }
    let bestGroup = null;
    let bestRate = -1;
    for (const [gk, stats] of Object.entries(groupMap)) {
      if (stats.total === 0) continue;
      const rate = stats.breaches / stats.total;
      if (rate > bestRate) {
        bestRate = rate;
        bestGroup = { groupKey: gk, breaches: stats.breaches, total: stats.total, rate };
      }
    }
    return bestGroup;
  }, [allRows]);

  const ruleComparisons = useMemo(() => {
    const comparisons = [];
    for (const ruleId of [...selectedRuleIds]) {
      const rows = (data[ruleId] || []);
      if (rows.length === 0) continue;
      const breaches = rows.filter(r => isBreached(r)).length;
      const total = rows.length;
      const rate = total > 0 ? (breaches / total * 100) : 0;
      const groupBreachMap = {};
      for (const row of rows) {
        if (isBreached(row)) {
          const gk = row.groupKey || 'N/A';
          groupBreachMap[gk] = (groupBreachMap[gk] || 0) + 1;
        }
      }
      let mostAffected = 'N/A';
      let maxBreaches = 0;
      for (const [gk, count] of Object.entries(groupBreachMap)) {
        if (count > maxBreaches) {
          maxBreaches = count;
          mostAffected = gk;
        }
      }
      comparisons.push({
        ruleId,
        ruleName: getRuleName(ruleId),
        breaches,
        total,
        rate,
        mostAffected,
        color: getRuleColor(rules, ruleId),
      });
    }
    return comparisons;
  }, [data, selectedRuleIds, getRuleName, rules]);

  /* ───── Event Volume chart data ───── */
  const eventVolumeData = useMemo(() => {
    const timeMap = {};
    for (const row of allRows) {
      const ts = row.windowStart;
      if (!timeMap[ts]) timeMap[ts] = { windowStart: ts };
      timeMap[ts][row.ruleId] = (timeMap[ts][row.ruleId] || 0) + row.eventCount;
    }
    return Object.values(timeMap).sort((a, b) => new Date(a.windowStart) - new Date(b.windowStart));
  }, [allRows]);

  /* ───── Breach Density Heatmap Data (by hour) ───── */
  const breachHeatmapData = useMemo(() => {
    const hourMap = {};
    for (let h = 0; h < 24; h++) {
      hourMap[h] = { hour: h, label: formatHourRange(h), breaches: 0 };
    }
    for (const row of allRows) {
      if (isBreached(row)) {
        const d = new Date(row.windowStart);
        if (!isNaN(d.getTime())) {
          const h = d.getHours();
          hourMap[h].breaches += 1;
        }
      }
    }
    return Object.values(hourMap);
  }, [allRows]);

  const maxHourlyBreaches = useMemo(() => {
    return Math.max(1, ...breachHeatmapData.map(d => d.breaches));
  }, [breachHeatmapData]);

  /* ───── Aggregation values chart data ───── */
  const { aggData, aggLines } = useMemo(() => {
    const lines = [];
    const timeMap = {};

    for (const ruleId of [...selectedRuleIds]) {
      const rows = data[ruleId] || [];
      if (rows.length === 0) continue;
      const aliases = Object.keys(rows[0].aggregationResults || {});
      const rName = getRuleName(ruleId);
      const rColor = getRuleColor(rules, ruleId);

      aliases.forEach((alias, ai) => {
        const lineKey = `${ruleId}__${alias}`;
        lines.push({
          key: lineKey,
          name: `${rName} — ${alias}`,
          color: rColor,
          dashArray: DASH_PATTERNS[ai % DASH_PATTERNS.length],
        });
      });

      for (const row of rows) {
        const ts = row.windowStart;
        if (!timeMap[ts]) timeMap[ts] = { windowStart: ts };
        for (const [alias, val] of Object.entries(row.aggregationResults || {})) {
          timeMap[ts][`${ruleId}__${alias}`] = val;
        }
      }
    }

    return {
      aggData: Object.values(timeMap).sort((a, b) => new Date(a.windowStart) - new Date(b.windowStart)),
      aggLines: lines,
    };
  }, [data, selectedRuleIds, getRuleName, rules]);

  /* ───── Top group keys table ───── */
  const groupTableData = useMemo(() => {
    const groupMap = {};
    for (const row of allRows) {
      const gk = row.groupKey || 'N/A';
      if (!groupMap[gk]) {
        groupMap[gk] = { groupKey: gk, ruleId: row.ruleId, totalEvents: 0, breaches: 0, totalWindows: 0, lastSeen: row.windowEnd };
      }
      groupMap[gk].totalEvents += row.eventCount || 0;
      groupMap[gk].totalWindows += 1;
      if (isBreached(row)) groupMap[gk].breaches += 1;
      if (row.windowEnd > groupMap[gk].lastSeen) groupMap[gk].lastSeen = row.windowEnd;
    }
    const arr = Object.values(groupMap).map(g => ({
      ...g,
      breachRate: g.totalWindows > 0 ? (g.breaches / g.totalWindows * 100) : 0,
    }));
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
  }, [allRows, sortCol, sortDir]);

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  const hasData = allRows.length > 0;

  const thStyle = {
    textAlign: 'left', padding: '0.5rem 0.6rem', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.75rem',
    textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', userSelect: 'none',
    borderBottom: '1px solid var(--glass-border)',
  };
  const tdStyle = { padding: '0.45rem 0.6rem', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.04)' };

  const insightCardStyle = {
    background: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    padding: '1rem 1.2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  };

  const insightLabelStyle = {
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#94a3b8',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
  };

  const insightValueStyle = {
    fontSize: '0.85rem',
    color: '#e2e8f0',
    lineHeight: 1.5,
  };

  function getHeatmapColor(breaches, max) {
    if (breaches === 0) return 'rgba(34,197,94,0.25)';
    const ratio = breaches / max;
    if (ratio < 0.33) return '#22c55e';
    if (ratio < 0.66) return '#f59e0b';
    return '#ef4444';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="glass-panel" style={{ paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
          <BarChart3 size={24} color="#60a5fa" />
          <h2 style={{ color: 'white', margin: 0, fontSize: '1.3rem' }}>Aggregated &amp; Rule Violation Analysis</h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
          Query ClickHouse results within a custom time range (max 7 days)
        </p>
      </div>

      {/* Date Picker */}
      <div className="date-picker-row">
        <div className="form-group" style={{ flex: 1, marginBottom: 0, minWidth: 200 }}>
          <label>Start Time (IST)</label>
          <input
            type="datetime-local"
            value={startTs}
            onChange={(e) => setStartTs(e.target.value)}
            min={minDate}
            max={maxDate}
          />
        </div>
        <div className="form-group" style={{ flex: 1, marginBottom: 0, minWidth: 200 }}>
          <label>End Time (IST)</label>
          <input
            type="datetime-local"
            value={endTs}
            onChange={(e) => setEndTs(e.target.value)}
            min={minDate}
            max={maxDate}
          />
        </div>
        <button
          className="btn btn-accent"
          onClick={fetchData}
          disabled={loading}
          style={{ height: 40, minWidth: 140, justifyContent: 'center' }}
        >
          {loading ? (
            <>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Loading...
            </>
          ) : 'Load Data'}
        </button>
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
          <span style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Querying ClickHouse...</span>
        </div>
      )}

      {!loading && !hasData && !error && (
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '1rem' }}>
          <BarChart3 size={48} color="var(--text-muted)" style={{ opacity: 0.4 }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
            Select rules and a time range, then click &quot;Load Data&quot; to query ClickHouse.
          </p>
        </div>
      )}

      {!loading && hasData && (
        <>
          {/* Auto-Insights Panel */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '16px',
            padding: '1.25rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <TrendingUp size={18} color="#60a5fa" />
              <span style={{ color: '#e2e8f0', fontSize: '0.95rem', fontWeight: 600 }}>Auto-Insights</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* 1. Peak Breach Period */}
              <div style={insightCardStyle}>
                <div style={insightLabelStyle}>
                  <AlertTriangle size={13} color="#ef4444" />
                  Peak Breach Period
                </div>
                <div style={insightValueStyle}>
                  {peakBreachPeriod ? (
                    <span>🔴 Peak: {formatHourRange(peakBreachPeriod.hour)} IST ({peakBreachPeriod.count} breaches)</span>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>No breaches detected</span>
                  )}
                </div>
              </div>

              {/* 2. Most At-Risk Group */}
              <div style={insightCardStyle}>
                <div style={insightLabelStyle}>
                  <Target size={13} color="#f59e0b" />
                  Most At-Risk Group
                </div>
                <div style={insightValueStyle}>
                  {mostAtRiskGroup && mostAtRiskGroup.breaches > 0 ? (
                    <span>⚠️ Most at-risk: <span style={{ fontFamily: 'monospace', color: '#93c5fd' }}>{mostAtRiskGroup.groupKey}</span> — {(mostAtRiskGroup.rate * 100).toFixed(0)}% breach rate ({mostAtRiskGroup.breaches}/{mostAtRiskGroup.total} windows)</span>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>No at-risk groups found</span>
                  )}
                </div>
              </div>

              {/* 3. Breach Density */}
              <div style={insightCardStyle}>
                <div style={insightLabelStyle}>
                  <Clock size={13} color="#22c55e" />
                  Breach Density
                </div>
                <div style={{ ...insightValueStyle, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '0.15rem 0.6rem',
                    borderRadius: '9999px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    background: `${getBreachColor(breachRate)}22`,
                    color: getBreachColor(breachRate),
                    border: `1px solid ${getBreachColor(breachRate)}44`,
                  }}>
                    {breachRate.toFixed(1)}%
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                    ({totalBreaches} breaches / {totalWindows} windows)
                  </span>
                </div>
              </div>

              {/* 4. Rule Comparison */}
              <div style={insightCardStyle}>
                <div style={insightLabelStyle}>
                  <BarChart3 size={13} color="#8b5cf6" />
                  Rule Comparison
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {ruleComparisons.length > 0 ? ruleComparisons.map(rc => (
                    <div key={rc.ruleId} style={{
                      borderLeft: `3px solid ${rc.color}`,
                      paddingLeft: '0.6rem',
                      fontSize: '0.78rem',
                      color: '#e2e8f0',
                      lineHeight: 1.4,
                    }}>
                      <span style={{ fontWeight: 600 }}>{rc.ruleName}</span>
                      <span style={{ color: '#94a3b8' }}> — {rc.breaches} breaches, {rc.rate.toFixed(1)}% rate</span>
                      {rc.breaches > 0 && (
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}> · Top: <span style={{ fontFamily: 'monospace', color: '#93c5fd' }}>{rc.mostAffected}</span></span>
                      )}
                    </div>
                  )) : (
                    <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>No rule data available</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Row 1: 6 Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '1rem' }}>
            <div className="metric-card" style={{ minWidth: 0 }}>
              <h3>Total Windows</h3>
              <div className="value">{totalWindows.toLocaleString()}</div>
            </div>
            <div className={`metric-card ${totalBreaches > 0 ? 'breach-glow' : ''}`} style={{ minWidth: 0 }}>
              <h3>Breach Count</h3>
              <div className="value" style={totalBreaches > 0 ? { background: 'linear-gradient(135deg, #ef4444, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } : undefined}>{totalBreaches.toLocaleString()}</div>
            </div>
            <div className="metric-card" style={{ minWidth: 0 }}>
              <h3>Breach Rate %</h3>
              <div className="value" style={{ color: getBreachColor(breachRate) }}>{breachRate.toFixed(1)}%</div>
            </div>
            <div className="metric-card" style={{ minWidth: 0 }}>
              <h3>Unique Groups</h3>
              <div className="value">{uniqueGroups.toLocaleString()}</div>
            </div>
            <div className="metric-card" style={{ minWidth: 0 }}>
              <h3>Peak Hour</h3>
              <div className="value" style={{ fontSize: '1.2rem' }}>{peakHour ? formatHourRange(peakHour.hour) : '—'}</div>
            </div>
            <div className="metric-card" style={{ minWidth: 0 }}>
              <h3>Avg Events/Window</h3>
              <div className="value">{avgEventsPerWindow}</div>
            </div>
          </div>

          {/* Row 2: Event Volume Area Chart (full width, 350px) */}
          <div className="chart-container">
            <div className="chart-title">Event Volume Over Time</div>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={eventVolumeData}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="windowStart" stroke={AXIS_STROKE} tick={{ fontSize: 11 }} tickFormatter={formatTime} />
                <YAxis stroke={AXIS_STROKE} tick={{ fontSize: 11 }} />
                <Tooltip {...TOOLTIP_STYLE} labelFormatter={formatTime} formatter={(value, name) => [value?.toLocaleString(), getRuleName(name)]} />
                <Legend formatter={(value) => getRuleName(value)} />
                {breachTimestamps.map((ts, idx) => (
                  <ReferenceLine key={`breach-ref-${idx}`} x={ts} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.3} />
                ))}
                {selectedRules.map(r => {
                  const id = r.rule_metadata.rule_id;
                  const color = getRuleColor(rules, id);
                  return (
                    <Area key={id} type="monotone" dataKey={id} stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} name={id} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  );
                })}
                <Brush dataKey="windowStart" height={28} stroke="#3b82f6" fill="rgba(15,23,42,0.8)" tickFormatter={formatTime} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Row 3: Breach Density by Hour Heatmap (full width, 200px) */}
          <div className="chart-container">
            <div className="chart-title">Breach Density by Hour</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={breachHeatmapData}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="label" stroke={AXIS_STROKE} tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" height={50} />
                <YAxis stroke={AXIS_STROKE} tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value) => [value, 'Breaches']}
                  labelFormatter={(label) => `Hour: ${label}`}
                />
                <Bar dataKey="breaches" radius={[4, 4, 0, 0]} name="Breaches">
                  {breachHeatmapData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getHeatmapColor(entry.breaches, maxHourlyBreaches)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Row 4: Aggregation Values Line Chart (full width, 320px) */}
          <div className="chart-container">
            <div className="chart-title">Aggregation Values</div>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={aggData}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="windowStart" stroke={AXIS_STROKE} tick={{ fontSize: 11 }} tickFormatter={formatTime} />
                <YAxis stroke={AXIS_STROKE} tick={{ fontSize: 11 }} />
                <Tooltip {...TOOLTIP_STYLE} labelFormatter={formatTime} />
                <Legend />
                {aggLines.map(line => (
                  <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} strokeDasharray={line.dashArray} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Row 5: Top Group Keys Table */}
          <div className="chart-container">
            <div className="chart-title">Top Group Keys by Breach Rate</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle} onClick={() => handleSort('groupKey')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Group Key <ArrowUpDown size={12} /></span>
                    </th>
                    <th style={thStyle} onClick={() => handleSort('ruleId')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Rule <ArrowUpDown size={12} /></span>
                    </th>
                    <th style={thStyle} onClick={() => handleSort('totalEvents')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Total Events <ArrowUpDown size={12} /></span>
                    </th>
                    <th style={thStyle} onClick={() => handleSort('breaches')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Breaches <ArrowUpDown size={12} /></span>
                    </th>
                    <th style={thStyle} onClick={() => handleSort('breachRate')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Breach Rate <ArrowUpDown size={12} /></span>
                    </th>
                    <th style={thStyle} onClick={() => handleSort('lastSeen')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Last Seen <ArrowUpDown size={12} /></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groupTableData.map((g, i) => {
                    const color = getRuleColor(rules, g.ruleId);
                    const rateColor = getBreachColor(g.breachRate);
                    return (
                      <tr key={g.groupKey + g.ruleId} style={{ borderLeft: `3px solid ${color}` }}>
                        <td style={tdStyle}>{i + 1}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#93c5fd' }}>{g.groupKey}</td>
                        <td style={tdStyle}>{getRuleName(g.ruleId)}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{g.totalEvents.toLocaleString()}</td>
                        <td style={{ ...tdStyle, color: g.breaches > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: g.breaches > 0 ? 600 : 400 }}>{g.breaches}</td>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.1rem 0.5rem',
                            borderRadius: '9999px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: `${rateColor}22`,
                            color: rateColor,
                            border: `1px solid ${rateColor}44`,
                          }}>
                            {g.breachRate.toFixed(1)}%
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatTime(g.lastSeen)}</td>
                      </tr>
                    );
                  })}
                  {groupTableData.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
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
