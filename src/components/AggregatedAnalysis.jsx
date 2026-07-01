import React, { useState, useMemo, useCallback } from 'react';
import { BarChart3, ArrowUpDown, Loader2, TrendingUp, AlertTriangle, Target, Activity, RefreshCw } from 'lucide-react';

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
  istDatetimeLocalToEpochMs,
  formatISTDateTime,
} from '../utils/istUtils';
import { generateHistoricalData } from '../simulation/mockEngine';

function isBreached(row) {
  return row.thresholdBreached === 1 || row.thresholdBreached === true
    || row.thresholdMet === 1 || row.thresholdMet === true;
}

/**
 * Extract event count from a row — supports both old and new Flink schema.
 * New Flink schema: aggResult = {"alias": value}, e.g. {"count": 5, "txnAmount": 2500}
 * Old schema: eventCount field directly on the row.
 */
function getRowEventCount(row) {
  if (row.eventCount != null) return Number(row.eventCount) || 0;
  const aggObj = row.aggResult && typeof row.aggResult === 'object' ? row.aggResult
    : row.aggregationResults && typeof row.aggregationResults === 'object' ? row.aggregationResults
    : null;
  if (aggObj) {
    // Try standard count aliases first
    for (const alias of ['count', 'eventCount', 'event_count', 'txnCount', 'total']) {
      if (aggObj[alias] != null) return Number(aggObj[alias]) || 0;
    }
    // Fall back to sum of all numeric values in the agg map
    let sum = 0;
    for (const val of Object.values(aggObj)) {
      const n = Number(val);
      if (!isNaN(n)) sum += n;
    }
    if (sum > 0) return sum;
  }
  return 0;
}

/**
 * Normalize aggregation results — supports both old schema (aggregationResults)
 * and new schema (aggResult). Backend pre-parses JSON strings, so both may be
 * plain objects already.
 */
function getAggResults(row) {
  if (row.aggResult && typeof row.aggResult === 'object') return row.aggResult;
  if (row.aggregationResults && typeof row.aggregationResults === 'object') return row.aggregationResults;
  return {};
}

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'rgba(13,17,23,0.97)',
    border: '1px solid rgba(88,101,242,0.3)',
    borderRadius: '10px',
    color: '#e6edf3',
    fontSize: '0.79rem',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  },
  labelStyle: { color: '#8b949e', marginBottom: '0.25rem', fontWeight: 600 },
};

const AXIS_STROKE = '#545d68';
const GRID_PROPS = { strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.06)' };
const DASH_PATTERNS = ['', '5 5', '8 4', '3 6', '10 3', '4 4 2 4'];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// formatTime: always display timestamps in IST (short form for chart axes)
function formatTime(ts) {
  return formatISTDateTime(ts);
}

function getISTHour(ts) {
  if (!ts) return 0;
  const raw = String(ts).replace(' ', 'T');
  const d = new Date(raw.includes('+') || raw.endsWith('Z') ? raw : raw + '+05:30');
  if (isNaN(d.getTime())) return 0;
  // Use UTC offset trick to get IST hour without relying on browser timezone
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return ist.getUTCHours();
}

function getBreachColor(rate) {
  if (rate < 5)   return '#3fb950';
  if (rate <= 20) return '#e3a008';
  if (rate <= 50) return '#ff7b72';
  return '#f85149';
}

function getSeverityBadge(sev) {
  const s = String(sev || '').toUpperCase();
  if (s === 'CRITICAL') return { bg: 'rgba(248,81,73,0.15)', color: '#f85149', border: 'rgba(248,81,73,0.3)' };
  if (s === 'HIGH')     return { bg: 'rgba(255,123,114,0.12)', color: '#ff7b72', border: 'rgba(255,123,114,0.25)' };
  if (s === 'MEDIUM')   return { bg: 'rgba(227,160,8,0.12)', color: '#e3a008', border: 'rgba(227,160,8,0.25)' };
  return { bg: 'rgba(45,212,191,0.1)', color: '#2dd4bf', border: 'rgba(45,212,191,0.2)' };
}

function formatHourRange(hour) {
  const pad = (n) => String(n).padStart(2, '0');
  const nextHour = (hour + 1) % 24;
  return `${pad(hour)}:00–${pad(nextHour)}:00`;
}

export default function AggregatedAnalysis({ rules, selectedRuleIds, allSelectedRuleIds, simulationMode }) {
  // Initialize datetime-local values in IST (not browser local time)
  const [startTs, setStartTs] = useState(() => toISTDatetimeLocal(Date.now() - 24 * 60 * 60 * 1000));
  const [endTs, setEndTs] = useState(() => toISTDatetimeLocal(Date.now()));
  const [data, setData] = useState({});
  const [anomalyData, setAnomalyData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortCol, setSortCol] = useState('breachRate');
  const [sortDir, setSortDir] = useState('desc');
  const [showAnomalyFeed, setShowAnomalyFeed] = useState(true);

  const selectedRules = useMemo(
    () => rules.filter(r => selectedRuleIds.has(r.rule_metadata.rule_id)),
    [rules, selectedRuleIds]
  );

  // min = 7 days ago, no max — users may query into the future (returns empty results).
  const minDate = toISTDatetimeLocalFromOffset(-7 * 24 * 60 * 60 * 1000);

  // Validate: start must be within the 7-day lookback window, and start must be before end.
  // Future end dates are allowed — ClickHouse will simply return no rows.
  const validate = () => {
    const startEpoch = istDatetimeLocalToEpochMs(startTs);
    const endEpoch   = istDatetimeLocalToEpochMs(endTs);
    const nowEpoch   = Date.now();
    if (isNaN(startEpoch) || isNaN(endEpoch)) return 'Invalid date format.';
    if (startEpoch >= endEpoch) return 'Start time must be before end time.';
    if (startEpoch < nowEpoch - 7 * 24 * 60 * 60 * 1000) return 'Start cannot be more than 7 days ago.';
    return '';
  };

  const fetchData = useCallback(async () => {
    if (selectedRuleIds.size === 0) {
      setError('Please select at least one rule from the sidebar on the left.');
      return;
    }
    const validationErr = validate();
    if (validationErr) {
      setError(validationErr);
      return;
    }
    setError('');
    setLoading(true);

    // ── SIMULATION MODE: generate data in-browser ─────────────────────────
    if (simulationMode) {
      // Small artificial delay for realism
      await new Promise(resolve => setTimeout(resolve, 600));
      const { results, anomalyResults } = generateHistoricalData(startTs, endTs);
      setData(results);
      setAnomalyData(anomalyResults);
      setLoading(false);
      return;
    }

    // ── REAL MODE: fetch from backend ────────────────────────────────────
    const ids = [...selectedRuleIds].join(',');
    const sFormatted = istDatetimeLocalToBackendStr(startTs);
    const eFormatted = istDatetimeLocalToBackendStr(endTs);
    try {
      const [aggRes, anomalyRes] = await Promise.allSettled([
        fetch(`/api/rules/agg-analysis?rule_ids=${ids}&start_ts=${encodeURIComponent(sFormatted)}&end_ts=${encodeURIComponent(eFormatted)}`),
        fetch(`/api/rules/anomaly-analysis?rule_ids=${ids}&limit=500`),
      ]);

      if (aggRes.status === 'fulfilled' && aggRes.value.ok) {
        const json = await aggRes.value.json();
        setData(json.results || {});
      } else if (aggRes.status === 'fulfilled') {
        const errJson = await aggRes.value.json().catch(() => ({}));
        setError(errJson.detail || 'Failed to load aggregated data. Please check the backend.');
      }

      if (anomalyRes.status === 'fulfilled' && anomalyRes.value.ok) {
        const json = await anomalyRes.value.json();
        setAnomalyData(json.results || []);
      }
    } catch (e) {
      console.error('Agg fetch error:', e);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [simulationMode, selectedRuleIds, startTs, endTs]);

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
  const totalEvents = useMemo(() => allRows.reduce((s, r) => s + getRowEventCount(r), 0), [allRows]);

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
      // Use IST-correct hour extraction (same UTC-offset trick as peakHour)
      const h = getISTHour(row.windowStart);
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
      timeMap[ts][row.ruleId] = (timeMap[ts][row.ruleId] || 0) + getRowEventCount(row);
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
        const h = getISTHour(row.windowStart);
        hourMap[h].breaches += 1;
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
      // Collect alias union from ALL rows (not just rows[0]) so we don't miss
      // aliases when the first row has an empty aggResult.
      const aliasSet = new Set();
      for (const row of rows) {
        for (const alias of Object.keys(getAggResults(row))) {
          aliasSet.add(alias);
        }
      }
      const aliases = [...aliasSet];
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
        for (const [alias, val] of Object.entries(getAggResults(row))) {
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
      groupMap[gk].totalEvents += getRowEventCount(row);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #5865f2, #2dd4bf)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BarChart3 size={16} color="#fff" strokeWidth={2.2} />
          </div>
          <h2 style={{ color: 'var(--text-1)', margin: 0, fontSize: '0.95rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Aggregated Rule Analysis</h2>
        </div>
        <p style={{ color: 'var(--text-3)', fontSize: '0.73rem', margin: 0 }}>
          Query up to 7 days of ClickHouse data. Breach events from the anomaly feed are overlaid on all charts (red markers).
        </p>
      </div>

      {/* Controls */}
      <div className="date-picker-row">
        <div className="form-group" style={{ flex: 1, marginBottom: 0, minWidth: 200 }}>
          <label className="form-label">From (IST)</label>
          <input
            type="datetime-local"
            value={startTs}
            onChange={(e) => setStartTs(e.target.value)}
            min={minDate}
          />
        </div>
        <div className="form-group" style={{ flex: 1, marginBottom: 0, minWidth: 200 }}>
          <label className="form-label">To (IST)</label>
          <input
            type="datetime-local"
            value={endTs}
            onChange={(e) => setEndTs(e.target.value)}
            min={minDate}
          />
        </div>
        <button
          className="btn btn-accent"
          onClick={fetchData}
          disabled={loading}
          style={{ height: 40, minWidth: 155, justifyContent: 'center', gap: '0.4rem' }}
        >
          {loading ? (
            <>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
              Querying…
            </>
          ) : <><RefreshCw size={14} /> Load Analytics</>}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '0.75rem', flexDirection: 'column' }}>
          <Loader2 size={32} color="var(--violet)" style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ color: 'var(--text-2)', fontSize: '0.88rem', fontWeight: 500 }}>Querying ClickHouse & anomaly feed…</span>
          <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>This may take a moment for large time ranges</span>
        </div>
      )}

      {!loading && !hasData && !error && (
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '0.875rem' }}>
          <BarChart3 size={52} color="var(--text-muted)" style={{ opacity: 0.2 }} />
          <div style={{ textAlign: 'center' }}>
            {allSelectedRuleIds && allSelectedRuleIds.size > 0 && selectedRuleIds.size === 0 ? (
              <>
                <p style={{ color: 'var(--amber)', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.3rem' }}>Selected rules are in DRAFT status</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: 0, maxWidth: 360 }}>
                  DRAFT rules have not been published to Flink and have no aggregated data in ClickHouse.
                  Publish the rule to ACTIVE status, or use Historical Analysis to test it against raw event data.
                </p>
              </>
            ) : (
              <>
                <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.3rem' }}>No data yet</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: 0, maxWidth: 320 }}>
                  Select one or more rules from the sidebar, pick a time range, and click "Load Analytics" to query results from ClickHouse.
                </p>
              </>
            )}
          </div>
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
              <TrendingUp size={18} color="var(--violet-light)" />
              <span style={{ color: 'var(--text-1)', fontSize: '0.9rem', fontWeight: 700, letterSpacing: '-0.01em' }}>Intelligent Insights</span>
              <span style={{ marginLeft: 'auto', padding: '0.1rem 0.55rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.05em', background: 'rgba(88,101,242,0.15)', color: 'var(--violet-light)', border: '1px solid rgba(88,101,242,0.3)' }}>Auto-generated</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {/* 1. Peak Breach Period */}
              <div style={insightCardStyle}>
                <div style={insightLabelStyle}>
                  <AlertTriangle size={13} color="var(--danger)" />
                  Peak Breach Window (IST)
                </div>
                <div style={insightValueStyle}>
                  {peakBreachPeriod ? (
                    <span><span style={{ color: 'var(--danger)', fontWeight: 700 }}>{formatHourRange(peakBreachPeriod.hour)} IST</span> — {peakBreachPeriod.count} breach{peakBreachPeriod.count !== 1 ? 'es' : ''}</span>
                  ) : (
                    <span style={{ color: 'var(--success)' }}>✓ No breach spikes detected</span>
                  )}
                </div>
              </div>

              {/* 2. Most At-Risk Entity */}
              <div style={insightCardStyle}>
                <div style={insightLabelStyle}>
                  <Target size={13} color="var(--amber)" />
                  Highest-Risk Entity
                </div>
                <div style={insightValueStyle}>
                  {mostAtRiskGroup && mostAtRiskGroup.breaches > 0 ? (
                    <span><span style={{ fontFamily: 'monospace', color: 'var(--teal)', fontWeight: 700 }}>{mostAtRiskGroup.groupKey}</span> — {(mostAtRiskGroup.rate * 100).toFixed(0)}% breach rate ({mostAtRiskGroup.breaches}/{mostAtRiskGroup.total} windows)</span>
                  ) : (
                    <span style={{ color: 'var(--text-3)' }}>No high-risk entities found</span>
                  )}
                </div>
              </div>

              {/* 3. Overall Breach Density */}
              <div style={insightCardStyle}>
                <div style={insightLabelStyle}>
                  <Activity size={13} color={getBreachColor(breachRate)} />
                  Overall Breach Density
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
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>
                    of windows breached ({totalBreaches}/{totalWindows})
                  </span>
                </div>
              </div>

              {/* 4. Rule Performance Comparison */}
              <div style={insightCardStyle}>
                <div style={insightLabelStyle}>
                  <BarChart3 size={13} color="var(--violet-light)" />
                  Rule Performance
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {ruleComparisons.length > 0 ? ruleComparisons.map(rc => (
                    <div key={rc.ruleId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: rc.color, flexShrink: 0 }} />
                      <span style={{ color: 'var(--text-1)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rc.ruleName}</span>
                      <span style={{ color: getBreachColor(rc.rate), fontWeight: 700, fontSize: '0.73rem', flexShrink: 0 }}>{rc.rate.toFixed(1)}%</span>
                    </div>
                  )) : (
                    <span style={{ color: 'var(--text-3)', fontSize: '0.78rem' }}>No comparison data available</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Anomaly Feed Section */}
          {anomalyData.length > 0 && (
            <div style={{ background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.2)', borderRadius: '12px', overflow: 'hidden' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.875rem 1.125rem', borderBottom: '1px solid rgba(248,81,73,0.15)', cursor: 'pointer' }}
                onClick={() => setShowAnomalyFeed(v => !v)}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', boxShadow: '0 0 6px rgba(248,81,73,0.6)', animation: 'pulse-dot 1.5s ease-in-out infinite', flexShrink: 0 }} />
                <span style={{ color: 'var(--danger)', fontSize: '0.83rem', fontWeight: 600 }}>Live Anomaly Feed</span>
                <span style={{ marginLeft: '0.5rem', padding: '0.1rem 0.55rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, background: 'rgba(248,81,73,0.15)', color: 'var(--danger)', border: '1px solid rgba(248,81,73,0.25)' }}>
                  {anomalyData.length} breach event{anomalyData.length !== 1 ? 's' : ''}
                </span>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', marginLeft: 'auto' }}>{showAnomalyFeed ? '▲ Hide' : '▼ Show'}</span>
              </div>
              {showAnomalyFeed && (
                <div style={{ maxHeight: 280, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {anomalyData.slice(0, 30).map((ev, i) => {
                    const ruleId = ev.ruleId || ev.id || 'unknown';
                    const entity = ev.entityValue || ev.groupKey || ev.entity || '—';
                    const ts     = ev.timestamp || ev.producedAt || ev.detectedAt || ev.windowEnd || '';
                    const sev    = ev.severity || ev.severityLevel || '';
                    const rColor = getRuleColor(rules, ruleId);
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', borderLeft: `3px solid ${rColor}`, fontSize: '0.78rem' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ color: 'var(--text-3)', fontSize: '0.67rem' }}>{getRuleName(ruleId)}</div>
                          <div style={{ color: 'var(--teal)', fontFamily: 'monospace', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entity}</div>
                        </div>
                        {sev && (
                          <span style={{ padding: '0.1rem 0.45rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0, background: 'rgba(248,81,73,0.15)', color: 'var(--danger)', border: '1px solid rgba(248,81,73,0.25)' }}>
                            {sev}
                          </span>
                        )}
                        <span style={{ color: 'var(--text-3)', fontSize: '0.7rem', flexShrink: 0 }}>{formatISTDateTime(ts)}</span>
                      </div>
                    );
                  })}
                  {anomalyData.length > 30 && (
                    <p style={{ color: 'var(--text-3)', fontSize: '0.73rem', textAlign: 'center', margin: '0.25rem 0 0' }}>+ {anomalyData.length - 30} more breach events</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Row 1: KPI Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.875rem' }}>
            <div className="metric-card" style={{ minWidth: 0 }}>
              <h3>Total Windows</h3>
              <div className="value">{totalWindows.toLocaleString()}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>Evaluation periods</div>
            </div>
            <div className={`metric-card ${totalBreaches > 0 ? 'breach-glow' : ''}`} style={{ minWidth: 0 }}>
              <h3>Threshold Breaches</h3>
              <div className="value" style={totalBreaches > 0 ? { background: 'linear-gradient(135deg, #f85149, #ff7b72)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } : undefined}>{totalBreaches.toLocaleString()}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{totalBreaches > 0 ? 'Rule conditions triggered' : 'No breaches'}</div>
            </div>
            <div className="metric-card" style={{ minWidth: 0 }}>
              <h3>Breach Rate</h3>
              <div className="value" style={{ color: getBreachColor(breachRate) }}>{breachRate.toFixed(1)}%</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>Windows that breached</div>
            </div>
            <div className="metric-card" style={{ minWidth: 0 }}>
              <h3>Unique Entities</h3>
              <div className="value">{uniqueGroups.toLocaleString()}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>Distinct group keys</div>
            </div>
            <div className="metric-card" style={{ minWidth: 0 }}>
              <h3>Peak Activity Hour</h3>
              <div className="value" style={{ fontSize: '1.2rem' }}>{peakHour ? `${String(peakHour.hour).padStart(2,'0')}:00` : '—'}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{peakHour ? `IST · ${peakHour.count} windows` : ''}</div>
            </div>
            <div className="metric-card" style={{ minWidth: 0 }}>
              <h3>Avg Events / Window</h3>
              <div className="value">{avgEventsPerWindow}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>Mean event rate</div>
            </div>
          </div>

          {/* Event Volume Area Chart */}
          <div className="chart-container">
            <div className="chart-title">Event Volume Over Time</div>
            <div style={{ fontSize: '0.71rem', color: 'var(--text-3)', marginBottom: '0.75rem' }}>Total events processed per evaluation window. <span style={{ color: '#f85149' }}>Red markers</span> indicate threshold breaches.</div>
            {/* height:430 + bottom:70 = room for Brush(24) + X-axis labels + gap */}
            <ResponsiveContainer width="100%" height={430}>
              <AreaChart data={eventVolumeData} margin={{ top: 10, right: 20, left: 10, bottom: 70 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="windowStart" stroke={AXIS_STROKE} tick={{ fontSize: 11 }} tickFormatter={formatTime} minTickGap={30} dy={10} />
                <YAxis stroke={AXIS_STROKE} tick={{ fontSize: 11 }} width={48} />
                <Tooltip {...TOOLTIP_STYLE} labelFormatter={ts => `Window: ${formatTime(ts)} IST`} formatter={(value, name) => [value?.toLocaleString() + ' events', getRuleName(name)]} />
                <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '8px' }} formatter={(value) => getRuleName(value)} />
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
                {/* Brush auto-positioned by Recharts within the bottom margin */}
                <Brush dataKey="windowStart" height={24} stroke="#3b82f6" fill="rgba(15,23,42,0.8)" tickFormatter={formatTime} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Breach Density by Hour */}
          <div className="chart-container">
            <div className="chart-title">Breach Density by Hour (IST)</div>
            <div style={{ fontSize: '0.71rem', color: 'var(--text-3)', marginBottom: '0.75rem' }}>Number of threshold breaches per hour of day. Identifies when anomalous activity peaks.</div>
            {/* height:260 + bottom:60 ensures angled labels (-35deg) don't clip under chart edge */}
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={breachHeatmapData} margin={{ top: 10, right: 20, left: 10, bottom: 60 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="label" stroke={AXIS_STROKE} tick={{ fontSize: 10 }} interval={0} angle={-35} textAnchor="end" />
                <YAxis stroke={AXIS_STROKE} tick={{ fontSize: 11 }} allowDecimals={false} width={40} />
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

          {/* Aggregation Metric Values Chart */}
          {aggLines.length > 0 && (
          <div className="chart-container">
            <div className="chart-title">Computed Metric Values Over Time</div>
            <div style={{ fontSize: '0.71rem', color: 'var(--text-3)', marginBottom: '0.75rem' }}>The aggregated metric values (counts, sums, averages) your rules computed for each window.</div>
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={aggData} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="windowStart" stroke={AXIS_STROKE} tick={{ fontSize: 11 }} tickFormatter={formatTime} minTickGap={30} dy={10} />
                <YAxis stroke={AXIS_STROKE} tick={{ fontSize: 11 }} width={48} />
                <Tooltip {...TOOLTIP_STYLE} labelFormatter={ts => `Window: ${formatTime(ts)} IST`} />
                <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '8px', fontSize: '0.75rem' }} />
                {breachTimestamps.slice(0, 50).map((ts, idx) => (
                  <ReferenceLine key={`aref-${idx}`} x={ts} stroke="#f85149" strokeDasharray="4 3" strokeOpacity={0.4} strokeWidth={1.5} />
                ))}
                {aggLines.map(line => (
                  <Line key={line.key} type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} strokeDasharray={line.dashArray} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          )}

          {/* Entity Breach Ranking Table */}
          <div className="chart-container">
            <div className="chart-title">Entity Breach Ranking</div>
            <div style={{ fontSize: '0.71rem', color: 'var(--text-3)', marginBottom: '0.75rem' }}>Top 20 tracked entities ranked by breach rate. Click column headers to sort.</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle} onClick={() => handleSort('groupKey')}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Entity ID <ArrowUpDown size={12} /></span>
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
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Last Active <ArrowUpDown size={12} /></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groupTableData.map((g, i) => {
                    const color = getRuleColor(rules, g.ruleId);
                    const rateColor = getBreachColor(g.breachRate);
                    return (
                      <tr key={g.groupKey + g.ruleId} style={{ borderLeft: `3px solid ${g.breaches > 0 ? color : 'transparent'}` }}>
                        <td style={tdStyle}>{i + 1}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--teal)', fontWeight: 600 }}>{g.groupKey}</td>
                        <td style={tdStyle}>{getRuleName(g.ruleId)}</td>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{g.totalEvents.toLocaleString()}</td>
                        <td style={{ ...tdStyle, color: g.breaches > 0 ? 'var(--danger)' : 'var(--text-3)', fontWeight: g.breaches > 0 ? 700 : 400 }}>{g.breaches}</td>
                        <td style={tdStyle}>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.1rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: `${rateColor}20`,
                            color: rateColor,
                            border: `1px solid ${rateColor}40`,
                          }}>
                            {g.breachRate.toFixed(1)}%
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatISTDateTime(g.lastSeen)}</td>
                      </tr>
                    );
                  })}
                  {groupTableData.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-3)', padding: '2.5rem' }}>
                        No entity data available for the selected rules and time range.
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
