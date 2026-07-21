import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart3, ArrowUpDown, Loader2, TrendingUp, AlertTriangle, Target, Activity, RefreshCw, Repeat, Timer, Fingerprint, Layers, ArrowRight, Zap } from 'lucide-react';

import {
  AreaChart, Area, BarChart, Bar, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Brush, Cell, Scatter, PieChart, Pie
} from 'recharts';
import { getRuleColor } from '../constants';
import {
  toISTDatetimeLocal,
  toISTDatetimeLocalFromOffset,
  istDatetimeLocalToBackendStr,
  istDatetimeLocalToEpochMs,
  formatISTDateTime,
  parseISTStringToEpochMs,
} from '../utils/istUtils';
import { generateHistoricalData } from '../simulation/mockEngine';
import { Modal, Drawer, RuleLink } from './ui/Overlay';

// ─── Data helpers (schema-agnostic) ─────────────────────────────────────────

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

// ─── Design System ─────────────────────────────────────────────────────────

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
  // Recharts renders each tooltip row with an inline color pulled from that
  // series' resolved stroke/fill. The Window Intensity bars use per-cell
  // gradient fills (url(#gradBarBreachAgg) / url(#gradBarNormalAgg)), which
  // Recharts can't resolve to a text color, so it silently falls back to
  // black — unreadable against the dark tooltip background. itemStyle
  // overrides that per-row color explicitly for every Tooltip using
  // TOOLTIP_STYLE in this file.
  itemStyle: { color: '#e6edf3' },
};

const AXIS_STROKE = '#545d68';
const GRID_PROPS = { strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.06)' };
const DASH_PATTERNS = ['', '5 5', '8 4', '3 6', '10 3', '4 4 2 4'];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Semantic colors — exact match to test-simulation branch
const BREACH_RED   = '#f85149';
const BREACH_AMBER = '#ff7b72';
const SAFE_GREEN   = '#3fb950';
const ACCENT_BLUE  = '#5865f2';
const ACCENT_CYAN  = '#2dd4bf';

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

// ─── Custom Tooltip for the ComposedChart ──────────────────────────────────

function EventVolumeTooltip({ active, payload, label, getRuleName }) {
  if (!active || !payload || !payload.length) return null;
  const breached = payload.some(p => p.payload && isBreached(p.payload));
  return (
    <div style={{
      ...TOOLTIP_STYLE.contentStyle,
      minWidth: 180,
      borderColor: breached ? 'rgba(239,68,68,0.5)' : 'rgba(99,102,241,0.3)',
    }}>
      <div style={{ ...TOOLTIP_STYLE.labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
        {breached && <span style={{ color: BREACH_RED, fontSize: '0.85rem' }}>⚡</span>}
        {formatTime(label)}
        {breached && <span style={{ color: BREACH_RED, fontSize: '0.7rem', fontWeight: 700, marginLeft: 4 }}>BREACH</span>}
      </div>
      {payload.map((p, i) => {
        if (p.dataKey === 'breachMarker') return null;
        let label = 'Events';
        if (p.dataKey.startsWith('evt_')) label = 'Events';
        else if (p.dataKey.startsWith('agg_')) label = 'Metric Value';
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 2 }}>
            <span style={{ color: '#94a3b8' }}>{label}</span>
            <span style={{ color: p.stroke || p.fill || '#e2e8f0', fontWeight: 700 }}>{p.value}</span>
          </div>
        );
      })}
      {breached && (
        <div style={{ marginTop: 6, padding: '4px 8px', background: 'rgba(239,68,68,0.12)', borderRadius: 4, fontSize: '0.72rem', color: BREACH_RED, textAlign: 'center', fontWeight: 700 }}>
          Threshold Exceeded
        </div>
      )}
    </div>
  );
}

// ─── Gradient defs for charts (matches test-simulation exactly) ─────────────
function ChartGradientDefs() {
  return (
    <defs>
      <linearGradient id="gradEventVolume" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={ACCENT_BLUE} stopOpacity={0.35} />
        <stop offset="100%" stopColor={ACCENT_BLUE} stopOpacity={0.02} />
      </linearGradient>
      <linearGradient id="gradCumBreach" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={BREACH_RED} stopOpacity={0.4} />
        <stop offset="100%" stopColor={BREACH_RED} stopOpacity={0.03} />
      </linearGradient>
      <linearGradient id="gradAggMetric" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={ACCENT_CYAN} stopOpacity={0.3} />
        <stop offset="100%" stopColor={ACCENT_CYAN} stopOpacity={0.02} />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

// ─── Custom XAxis Tick with breach highlighting ─────────────────────────────
const CustomXAxisTick = (props) => {
  const { x, y, payload, breachTs } = props;
  const isBreach = breachTs && breachTs.includes(payload.value);
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={16} textAnchor="middle" fill={isBreach ? BREACH_RED : '#64748b'} fontSize={11} fontWeight={isBreach ? 700 : 400}>
        {formatTime(payload.value)}
      </text>
    </g>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────

export default function AggregatedAnalysis({ rules, selectedRuleId, allSelectedRuleId, onDrillToHistorical, simulationMode, onRuleClick }) {
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
  const [hiddenSeries, setHiddenSeries] = useState({});
  const [selectedGroup, setSelectedGroup] = useState('__ALL__');

  // ── Click-to-detail overlay state — same shared-slot pattern as LiveAnalysis,
  // so entity/window/breach-list detail views never stack on top of each other. ──
  const [overlay, setOverlay] = useState(null); // { type: 'entity'|'window'|'breachList', ...payload } | null
  const openEntityDetail = useCallback((groupKey) => setOverlay({ type: 'entity', groupKey }), []);
  const openWindowDetail = useCallback((bucketKey) => setOverlay({ type: 'window', bucketKey }), []);
  const openBreachList   = useCallback(() => setOverlay({ type: 'breachList' }), []);
  const closeOverlay     = useCallback(() => setOverlay(null), []);
  const handleRuleClick  = useCallback((ruleId) => { closeOverlay(); onRuleClick && onRuleClick(ruleId); }, [onRuleClick, closeOverlay]);

  // A rule change should reset any group filter (and any open overlay) left over from the previous rule.
  useEffect(() => { setSelectedGroup('__ALL__'); setOverlay(null); }, [selectedRuleId]);

  const handleLegendClick = useCallback((e) => {
    const key = e.dataKey;
    if (key) setHiddenSeries(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const selectedRules = useMemo(
    () => rules.filter(r => r.rule_metadata.rule_id === selectedRuleId),
    [rules, selectedRuleId]
  );
  const currentRule = selectedRules[0] || null;

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
    if (!selectedRuleId) {
      setError('Please select a rule from the sidebar on the left.');
      return;
    }
    const validationErr = validate();
    if (validationErr) {
      setError(validationErr);
      return;
    }
    setError('');
    setLoading(true);

    // ── SIMULATION MODE: generate data in-browser, no backend/ClickHouse call ──
    if (simulationMode) {
      await new Promise(resolve => setTimeout(resolve, 600)); // artificial delay for realism
      const { results, anomalyResults } = generateHistoricalData(startTs, endTs);
      setData(results);
      setAnomalyData(anomalyResults);
      setLoading(false);
      return;
    }

    const ids = selectedRuleId;
    // Send naive IST strings to ClickHouse via backend
    const sFormatted = istDatetimeLocalToBackendStr(startTs);
    const eFormatted = istDatetimeLocalToBackendStr(endTs);
    try {
      // Fetch aggregated data and anomaly feed in parallel for richer insights
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
      // Anomaly data failure is non-critical — silently continue
    } catch (e) {
      console.error('Agg fetch error:', e);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [simulationMode, selectedRuleId, startTs, endTs]);

  const getRuleName = useCallback((ruleId) => {
    const match = rules.find(rule => rule.rule_metadata.rule_id === ruleId);
    return match ? match.rule_metadata.rule_name : ruleId;
  }, [rules]);

  /* ───── Compute derived data ───── */
  const allRows = useMemo(() => {
    const rows = [];
    for (const [ruleId, arr] of Object.entries(data)) {
      if (ruleId !== selectedRuleId) continue;
      (arr || []).forEach(row => rows.push({ ...row, ruleId }));
    }
    return rows;
  }, [data, selectedRuleId]);

  // ─── Group-by filter — only offered for rules that actually group by a
  // non-global key, and populated dynamically from whatever groups have shown
  // up in the loaded data (new ones appear automatically as they arrive).
  // Selecting a group narrows the charts below to just that group; the Entity
  // Breach Ranking table and the anomaly feed intentionally stay unfiltered so
  // they can still be used to compare across groups.
  const showGroupFilter = !!(currentRule && Array.isArray(currentRule.grouping?.keys) && currentRule.grouping.keys.length > 0);

  const availableGroups = useMemo(() => {
    const set = new Set();
    for (const row of allRows) {
      if (row.groupKey) set.add(row.groupKey);
    }
    return [...set].sort();
  }, [allRows]);

  const chartRows = useMemo(() => {
    if (selectedGroup === '__ALL__') return allRows;
    return allRows.filter(r => r.groupKey === selectedGroup);
  }, [allRows, selectedGroup]);

  const totalWindows = useMemo(() => chartRows.length, [chartRows]);
  const totalBreaches = useMemo(() => chartRows.filter(r => isBreached(r)).length, [chartRows]);
  const breachRate = useMemo(() => totalWindows > 0 ? (totalBreaches / totalWindows * 100) : 0, [totalBreaches, totalWindows]);
  const uniqueGroups = useMemo(() => new Set(chartRows.map(r => r.groupKey)).size, [chartRows]);
  const totalEvents = useMemo(() => chartRows.reduce((s, r) => s + getRowEventCount(r), 0), [chartRows]);
  const avgEventsPerWindow = useMemo(() => totalWindows > 0 ? (totalEvents / totalWindows).toFixed(1) : '0.0', [totalEvents, totalWindows]);

  /* ───── Peak Hour (most activity) ───── */
  const peakHour = useMemo(() => {
    if (chartRows.length === 0) return null;
    const hourMap = {};
    for (const row of chartRows) {
      // Parse space-separated IST string as IST by appending +05:30
      const raw = String(row.windowStart || '').replace(' ', 'T');
      const d = new Date(raw.includes('+') || raw.endsWith('Z') ? raw : raw + '+05:30');
      if (isNaN(d.getTime())) continue;
      // Extract IST hour using UTC offset trick
      const istWall = new Date(d.getTime() + IST_OFFSET_MS);
      const h = istWall.getUTCHours();
      hourMap[h] = (hourMap[h] || 0) + 1;
    }
    let maxH = 0, maxCount = 0;
    for (const [h, count] of Object.entries(hourMap)) {
      if (count > maxCount) { maxCount = count; maxH = parseInt(h, 10); }
    }
    return { hour: maxH, count: maxCount };
  }, [chartRows]);

  /* ───── Auto-Insights ───── */
  const peakBreachPeriod = useMemo(() => {
    const breachRows = chartRows.filter(r => isBreached(r));
    if (breachRows.length === 0) return null;
    const hourMap = {};
    for (const row of breachRows) {
      // Use IST-correct hour extraction (same UTC-offset trick as peakHour)
      const h = getISTHour(row.windowStart);
      hourMap[h] = (hourMap[h] || 0) + 1;
    }
    let peakH = 0, peakCount = 0;
    for (const [h, count] of Object.entries(hourMap)) {
      if (count > peakCount) { peakCount = count; peakH = parseInt(h, 10); }
    }
    return { hour: peakH, count: peakCount };
  }, [chartRows]);

  // Intentionally reads allRows, not chartRows — this insight is about which
  // group is riskiest, so it stays meaningful (not trivially "the one you
  // already selected") regardless of the group filter above.
  const mostAtRiskGroup = useMemo(() => {
    if (allRows.length === 0) return null;
    const groupMap = {};
    for (const row of allRows) {
      const gk = row.groupKey || 'N/A';
      if (!groupMap[gk]) groupMap[gk] = { total: 0, breaches: 0 };
      groupMap[gk].total += 1;
      if (isBreached(row)) groupMap[gk].breaches += 1;
    }
    let bestGroup = null, bestRate = -1;
    for (const [gk, stats] of Object.entries(groupMap)) {
      if (stats.total === 0) continue;
      const rate = stats.breaches / stats.total;
      if (rate > bestRate) { bestRate = rate; bestGroup = { groupKey: gk, breaches: stats.breaches, total: stats.total, rate }; }
    }
    return bestGroup;
  }, [allRows]);

  const ruleComparisons = useMemo(() => {
    const comparisons = [];
    if (!selectedRuleId) return comparisons;
    const ruleId = selectedRuleId;
    const rows = (data[ruleId] || []);
    if (rows.length === 0) return comparisons;
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
    let mostAffected = 'N/A', maxBreaches = 0;
    for (const [gk, count] of Object.entries(groupBreachMap)) {
      if (count > maxBreaches) { maxBreaches = count; mostAffected = gk; }
    }
    comparisons.push({ ruleId, ruleName: getRuleName(ruleId), breaches, total, rate, mostAffected, color: getRuleColor(rules, ruleId) });
    return comparisons;
  }, [data, selectedRuleId, getRuleName, rules]);

  /* ───── Consolidated Chart Data: Event Volume + Agg Metrics + Breach Markers ─────
     Event-volume/breach rows come from chartRows (group-filtered); the agg metric
     values baked in below intentionally come from the full per-rule data (not
     group-filtered) for the same reason aggLineDescriptors in LiveAnalysis does —
     these are metric series across the whole rule, matching the pre-group-filter
     behavior this consolidated chart has always had for aggregation values. */
  const { comboData, aggLines } = useMemo(() => {
    const timeMap = {};
    const lines = [];

    // Build event-volume + breach-marker rows from chartRows
    for (const row of chartRows) {
      const ts = row.windowStart;
      if (!ts) continue;
      if (!timeMap[ts]) timeMap[ts] = { windowStart: ts, _tsMs: new Date(ts).getTime(), _breached: false };
      const evtKey = `evt_${row.ruleId}`;
      timeMap[ts][evtKey] = (timeMap[ts][evtKey] || 0) + getRowEventCount(row);
      if (isBreached(row)) {
        timeMap[ts]._breached = true;
        timeMap[ts].thresholdBreached = true;
        timeMap[ts].breachMarker = getRowEventCount(row);
      }
    }

    // Bake aggregation metric values into the same row map
    for (const ruleId of (selectedRuleId ? [selectedRuleId] : [])) {
      const rows = data[ruleId] || [];
      if (!rows.length) continue;
      const aliasSet = new Set();
      for (const row of rows) {
        for (const alias of Object.keys(getAggResults(row))) aliasSet.add(alias);
      }
      const rName = getRuleName(ruleId);
      [...aliasSet].forEach((alias, ai) => {
        lines.push({
          key: `agg_${ruleId}__${alias}`,
          name: `${rName} · ${alias}`,
          dashArray: DASH_PATTERNS[(ai + 1) % DASH_PATTERNS.length],
        });
      });
      for (const row of rows) {
        const ts = row.windowStart;
        if (!timeMap[ts]) timeMap[ts] = { windowStart: ts, _tsMs: new Date(ts).getTime(), _breached: false };
        for (const [alias, val] of Object.entries(getAggResults(row))) {
          timeMap[ts][`agg_${ruleId}__${alias}`] = Number(val);
        }
      }
    }

    const sorted = Object.values(timeMap).sort((a, b) => a._tsMs - b._tsMs);
    return { comboData: sorted, aggLines: lines };
  }, [chartRows, data, selectedRuleId, getRuleName, rules]);

  // Breach timestamps for XAxis tick highlighting — derived from comboData
  const breachTimestamps = useMemo(
    () => comboData.filter(pt => pt._breached).map(pt => pt.windowStart),
    [comboData]
  );

  /* ───── Bucketing helper for historical data ─────
     Prevents browser freeze on large queries by grouping raw windows
     into minute / hour / day buckets based on the queried time range. */
  const bucketResolution = useMemo(() => {
    if (!allRows.length) return 'minute';
    const allTs = allRows.map(r => new Date(r.windowStart).getTime()).filter(t => !isNaN(t));
    if (!allTs.length) return 'minute';
    const rangeMs = Math.max(...allTs) - Math.min(...allTs);
    const rangeHours = rangeMs / (1000 * 60 * 60);
    if (rangeHours > 72) return 'day';
    if (rangeHours > 12) return 'hour';
    return 'minute';
  }, [allRows]);

  function getBucketKey(ts, resolution) {
    const raw = String(ts).replace(' ', 'T');
    const d = new Date(raw.includes('+') || raw.endsWith('Z') ? raw : raw + '+05:30');
    if (isNaN(d.getTime())) return ts;
    const istMs = d.getTime() + 5.5 * 60 * 60 * 1000;
    const istDate = new Date(istMs);
    if (resolution === 'day') {
      return `${istDate.getUTCFullYear()}-${String(istDate.getUTCMonth() + 1).padStart(2, '0')}-${String(istDate.getUTCDate()).padStart(2, '0')} 00:00:00`;
    }
    if (resolution === 'hour') {
      return `${istDate.getUTCFullYear()}-${String(istDate.getUTCMonth() + 1).padStart(2, '0')}-${String(istDate.getUTCDate()).padStart(2, '0')} ${String(istDate.getUTCHours()).padStart(2, '0')}:00:00`;
    }
    return ts;
  }

  /* ───── Window Intensity bar data (bucketed) ───── */
  const breachBarData = useMemo(() => {
    const bucketMap = {};
    for (const row of chartRows) {
      const ts = row.windowStart;
      if (!ts) continue;
      const key = getBucketKey(ts, bucketResolution);
      if (!bucketMap[key]) bucketMap[key] = { windowStart: key, count: 0, breached: false };
      bucketMap[key].count += getRowEventCount(row);
      if (isBreached(row)) bucketMap[key].breached = true;
    }
    return Object.values(bucketMap).sort((a, b) => new Date(a.windowStart) - new Date(b.windowStart));
  }, [chartRows, bucketResolution]);

  /* ───── Cumulative Breaches area data (bucketed) ───── */
  const cumulativeData = useMemo(() => {
    const perRule = {};
    for (const ruleId of (selectedRuleId ? [selectedRuleId] : [])) {
      const ruleRows = chartRows.filter(r => r.ruleId === ruleId);
      const bucketMap = {};
      for (const row of ruleRows) {
        const ts = row.windowStart;
        if (!ts) continue;
        const key = getBucketKey(ts, bucketResolution);
        if (!bucketMap[key]) bucketMap[key] = { windowStart: key, breaches: 0 };
        if (isBreached(row)) bucketMap[key].breaches++;
      }
      const sorted = Object.values(bucketMap).sort((a, b) => new Date(a.windowStart) - new Date(b.windowStart));
      let cum = 0;
      for (const entry of sorted) { cum += entry.breaches; entry.cumBreaches = cum; }
      perRule[ruleId] = sorted;
    }
    const allTimestamps = new Set();
    for (const arr of Object.values(perRule)) for (const e of arr) allTimestamps.add(e.windowStart);
    const sortedTs = [...allTimestamps].sort((a, b) => new Date(a) - new Date(b));
    const lastCum = {};
    const merged = sortedTs.map(ts => {
      const point = { windowStart: ts };
      for (const ruleId of (selectedRuleId ? [selectedRuleId] : [])) {
        const entry = (perRule[ruleId] || []).find(e => e.windowStart === ts);
        if (entry) lastCum[ruleId] = entry.cumBreaches;
        point[`cum_${ruleId}`] = lastCum[ruleId] || 0;
      }
      return point;
    });

    // Pre-compute which timestamps had a cumulative breach increment (for dot rendering).
    // Recharts does NOT pass the data array into dot() render props, so we must do
    // this comparison ahead of time and pass it via closure.
    const breachIncrementTs = new Set();
    for (let i = 1; i < merged.length; i++) {
      for (const ruleId of (selectedRuleId ? [selectedRuleId] : [])) {
        const key = `cum_${ruleId}`;
        if ((merged[i][key] || 0) > (merged[i - 1][key] || 0)) {
          breachIncrementTs.add(merged[i].windowStart);
          break;
        }
      }
    }
    return { merged, breachIncrementTs };
  }, [chartRows, selectedRuleId, bucketResolution]);

  const sortedAnomalyData = useMemo(() => {
    return [...anomalyData].sort((a, b) => {
      const tsA = new Date(a.timestamp || a.producedAt || a.detectedAt || a.windowEnd || 0).getTime();
      const tsB = new Date(b.timestamp || b.producedAt || b.detectedAt || b.windowEnd || 0).getTime();
      return tsB - tsA;
    });
  }, [anomalyData]);

  /* ───── Anomaly Insights: repeat offenders, severity mix, rate, TTL countdown ───── */

  // Ticks every 30s purely to force the penalty-TTL countdowns to re-render live.
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const repeatOffenders = useMemo(() => {
    const map = {};
    for (const ev of anomalyData) {
      const ruleId = ev.ruleId || ev.id || 'unknown';
      const entity = ev.entityValue || ev.groupKey || ev.entity || '—';
      const key = `${entity}||${ruleId}`;
      const ts = ev.timestamp || ev.producedAt || ev.detectedAt || ev.windowEnd || '';
      if (!map[key]) {
        map[key] = { entity, ruleId, count: 0, firstSeen: ts, lastSeen: ts, penaltyTtlSeconds: ev.penaltyTtlSeconds };
      }
      map[key].count += 1;
      if (ts && ts > (map[key].lastSeen || '')) { map[key].lastSeen = ts; map[key].penaltyTtlSeconds = ev.penaltyTtlSeconds; }
      if (ts && (!map[key].firstSeen || ts < map[key].firstSeen)) map[key].firstSeen = ts;
    }
    return Object.values(map).filter(g => g.count > 1).sort((a, b) => b.count - a.count).slice(0, 15);
  }, [anomalyData]);

  const severityDistribution = useMemo(() => {
    const counts = {};
    for (const ev of anomalyData) {
      const sev = String(ev.severity || ev.severityLevel || 'UNKNOWN').toUpperCase();
      counts[sev] = (counts[sev] || 0) + 1;
    }
    const colorMap = { CRITICAL: '#f85149', HIGH: '#ff7b72', MEDIUM: '#e3a008', LOW: '#3fb950', UNKNOWN: '#8b949e' };
    return Object.entries(counts).map(([name, value]) => ({ name, value, color: colorMap[name] || '#8b949e' }));
  }, [anomalyData]);

  // Own bucket resolution for the anomaly rate sparkline — anomaly-analysis
  // isn't scoped to the agg query's date range (it's "last N anomalies"), so
  // reusing bucketResolution (derived from allRows) could span a mismatched range.
  const anomalyBucketResolution = useMemo(() => {
    if (!anomalyData.length) return 'minute';
    const allTs = anomalyData
      .map(ev => new Date(ev.timestamp || ev.producedAt || ev.detectedAt || ev.windowEnd || 0).getTime())
      .filter(t => !isNaN(t) && t > 0);
    if (!allTs.length) return 'minute';
    const rangeHours = (Math.max(...allTs) - Math.min(...allTs)) / (1000 * 60 * 60);
    if (rangeHours > 72) return 'day';
    if (rangeHours > 12) return 'hour';
    return 'minute';
  }, [anomalyData]);

  const anomalyRateBuckets = useMemo(() => {
    const bucketMap = {};
    for (const ev of anomalyData) {
      const ts = ev.timestamp || ev.producedAt || ev.detectedAt || ev.windowEnd || '';
      if (!ts) continue;
      const key = getBucketKey(ts, anomalyBucketResolution);
      bucketMap[key] = (bucketMap[key] || 0) + 1;
    }
    return Object.entries(bucketMap)
      .map(([windowStart, count]) => ({ windowStart, count }))
      .sort((a, b) => new Date(a.windowStart) - new Date(b.windowStart));
  }, [anomalyData, anomalyBucketResolution]);

  function formatTtlCountdown(producedAt, penaltyTtlSeconds, now) {
    if (!penaltyTtlSeconds) return null;
    const startEpoch = parseISTStringToEpochMs(producedAt);
    if (isNaN(startEpoch)) return null;
    const remainingMs = (startEpoch + penaltyTtlSeconds * 1000) - now;
    if (remainingMs <= 0) return { text: 'Expired', active: false };
    const mins = Math.ceil(remainingMs / 60000);
    if (mins < 60) return { text: `${mins}m left`, active: true };
    return { text: `${Math.floor(mins / 60)}h ${mins % 60}m left`, active: true };
  }

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

  // ─── Entity Detail drawer data — full per-window history for one entity,
  // independent of the group filter above. ──────────────────────────────────
  const entityDetail = useMemo(() => {
    if (!overlay || overlay.type !== 'entity') return null;
    const raw = allRows.filter(r => r.groupKey === overlay.groupKey);
    const sortedDesc = [...raw].sort((a, b) => new Date(b.windowStart) - new Date(a.windowStart));
    const totalEvents = raw.reduce((s, r) => s + getRowEventCount(r), 0);
    const breaches = raw.filter(isBreached).length;
    const totalWindows = raw.length;
    const breachRate = totalWindows > 0 ? (breaches / totalWindows * 100) : 0;
    return {
      groupKey: overlay.groupKey,
      totalEvents, breaches, totalWindows, breachRate,
      timeline: [...sortedDesc].reverse().map(r => ({ windowStart: r.windowStart, count: getRowEventCount(r), breached: isBreached(r) })),
      history: sortedDesc.slice(0, 15),
    };
  }, [overlay, allRows]);

  // ─── Window Detail modal data — every entity's row within the clicked
  // bucket (bucket-resolution-aware, since Window Intensity here can be
  // bucketed to the hour or day for wide date ranges). ───────────────────────
  const windowDetail = useMemo(() => {
    if (!overlay || overlay.type !== 'window') return null;
    const rows = allRows
      .filter(r => getBucketKey(r.windowStart, bucketResolution) === overlay.bucketKey)
      .sort((a, b) => getRowEventCount(b) - getRowEventCount(a));
    const totalCount = rows.reduce((s, r) => s + getRowEventCount(r), 0);
    const breachedCount = rows.filter(isBreached).length;
    return { bucketKey: overlay.bucketKey, rows, totalCount, breachedCount };
  }, [overlay, allRows, bucketResolution]);

  // ─── Breach List modal data — respects the group filter, matching the
  // "Threshold Breaches" KPI tile that opens it. ─────────────────────────────
  const breachListRows = useMemo(() => {
    if (!overlay || overlay.type !== 'breachList') return [];
    return [...chartRows].filter(isBreached).sort((a, b) => new Date(b.windowStart) - new Date(a.windowStart));
  }, [overlay, chartRows]);

  const currentThreshold = currentRule?.having_thresholds?.[0]?.value;

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
          Analyze up to 7 days of historical results for the selected rule. Breach events are overlaid on every chart as red markers.
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
          <span style={{ color: 'var(--text-2)', fontSize: '0.88rem', fontWeight: 500 }}>Loading results…</span>
          <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>This may take a moment for large time ranges</span>
        </div>
      )}

      {!loading && !hasData && !error && (
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: '0.875rem' }}>
          <BarChart3 size={52} color="var(--text-muted)" style={{ opacity: 0.2 }} />
          <div style={{ textAlign: 'center' }}>
            {allSelectedRuleId && !selectedRuleId ? (
              <>
                <p style={{ color: 'var(--amber)', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.3rem' }}>The selected rule is still in Draft</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: 0, maxWidth: 360 }}>
                  Draft rules aren't live yet, so there's no historical data to show.
                  Publish the rule to make it Active, or use Historical Replay to test it against past traffic instead.
                </p>
              </>
            ) : (
              <>
                <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.3rem' }}>No data yet</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: 0, maxWidth: 320 }}>
                  Select a rule from the sidebar, pick a time range, and click "Load Analytics".
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {!loading && hasData && (
        <>
          {/* Group-by filter — only shown for rules that group by a non-global key */}
          {showGroupFilter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Select Entity</label>
              <select
                value={selectedGroup}
                onChange={e => setSelectedGroup(e.target.value)}
                style={{ maxWidth: 260 }}
                title="Filter the charts below to a single entity. The Entity Breach Ranking table and anomaly feed always show every entity."
              >
                <option value="__ALL__">All Entities (Overview)</option>
                {availableGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          )}

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
                    <span style={{ color: 'var(--success)' }}>✔ No breach spikes detected</span>
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
          {sortedAnomalyData.length > 0 && (
            <div style={{ background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.2)', borderRadius: '12px', overflow: 'hidden' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.875rem 1.125rem', borderBottom: '1px solid rgba(248,81,73,0.15)', cursor: 'pointer' }}
                onClick={() => setShowAnomalyFeed(v => !v)}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', boxShadow: '0 0 6px rgba(248,81,73,0.6)', animation: 'pulse-dot 1.5s ease-in-out infinite', flexShrink: 0 }} />
                <span style={{ color: 'var(--danger)', fontSize: '0.83rem', fontWeight: 600 }}>Breach Events</span>
                <span style={{ marginLeft: '0.5rem', padding: '0.1rem 0.55rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, background: 'rgba(248,81,73,0.15)', color: 'var(--danger)', border: '1px solid rgba(248,81,73,0.25)' }}>
                  {sortedAnomalyData.length} breach event{sortedAnomalyData.length !== 1 ? 's' : ''}
                </span>
                <span style={{ color: 'var(--text-3)', fontSize: '0.72rem', marginLeft: 'auto' }}>{showAnomalyFeed ? '▲ Hide' : '▼ Show'}</span>
              </div>
              {showAnomalyFeed && (
                <>
                  {/* Anomaly Insights: severity mix, rate sparkline, repeat-offender count */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', padding: '0.875rem 1.125rem 0' }}>
                    <div style={insightCardStyle}>
                      <div style={insightLabelStyle}><AlertTriangle size={13} color="var(--danger)" /> Severity Mix</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 56, height: 56, flexShrink: 0 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={severityDistribution} dataKey="value" nameKey="name" innerRadius={16} outerRadius={27} paddingAngle={2} isAnimationActive={false}>
                                {severityDistribution.map((s, i) => <Cell key={i} fill={s.color} />)}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          {severityDistribution.map(s => (
                            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem' }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                              <span style={{ color: 'var(--text-2)' }}>{s.name}</span>
                              <span style={{ color: 'var(--text-3)', marginLeft: 'auto' }}>{s.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div style={insightCardStyle}>
                      <div style={insightLabelStyle}><TrendingUp size={13} color="var(--danger)" /> Anomaly Rate</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{anomalyData.length} event{anomalyData.length !== 1 ? 's' : ''} in queried range</div>
                      <div style={{ width: '100%', height: 42 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={anomalyRateBuckets} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                            <Area type="monotone" dataKey="count" stroke={BREACH_RED} fill={BREACH_RED} fillOpacity={0.15} strokeWidth={1.5} isAnimationActive={false} dot={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div style={insightCardStyle}>
                      <div style={insightLabelStyle}><Repeat size={13} color="var(--amber)" /> Repeat Offenders</div>
                      <div style={insightValueStyle}>
                        {repeatOffenders.length > 0
                          ? <span><span style={{ color: 'var(--danger)', fontWeight: 700 }}>{repeatOffenders.length}</span> entit{repeatOffenders.length !== 1 ? 'ies' : 'y'} tripped the same rule more than once</span>
                          : <span style={{ color: 'var(--text-3)' }}>No repeat offenders in this range</span>}
                      </div>
                    </div>
                  </div>

                  {/* Repeat Offenders table */}
                  {repeatOffenders.length > 0 && (
                    <div style={{ padding: '0.75rem 1.125rem 0' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                        Repeat Offenders — Top {repeatOffenders.length}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: 180, overflowY: 'auto' }}>
                        {repeatOffenders.map((g, i) => {
                          const ttl = formatTtlCountdown(g.lastSeen, g.penaltyTtlSeconds, nowTick);
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: '0.76rem' }}>
                              <span
                                onClick={() => openEntityDetail(g.entity)}
                                title="View this entity's full history"
                                style={{ fontFamily: 'monospace', color: 'var(--teal)', fontWeight: 600, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                              >
                                {g.entity}
                              </span>
                              <span style={{ flexShrink: 0, fontSize: '0.72rem' }}>
                                <RuleLink ruleName={getRuleName(g.ruleId)} ruleId={g.ruleId} onRuleClick={handleRuleClick} style={{ color: 'var(--text-3)' }} />
                              </span>
                              <span style={{ color: 'var(--danger)', fontWeight: 700, flexShrink: 0 }}>×{g.count}</span>
                              {ttl && (
                                <span
                                  title="Cooldown remaining — time left before this entity could be flagged again"
                                  style={{
                                    flexShrink: 0, fontSize: '0.66rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: 4,
                                    color: ttl.active ? '#e3a008' : 'var(--text-3)',
                                    background: ttl.active ? 'rgba(227,160,8,0.12)' : 'rgba(255,255,255,0.04)',
                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                  }}
                                >
                                  <Timer size={9} />{ttl.text}
                                </span>
                              )}
                              {onDrillToHistorical && (
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ padding: '0.15rem 0.5rem', fontSize: '0.66rem', flexShrink: 0 }}
                                  onClick={() => onDrillToHistorical(g.ruleId, g.lastSeen)}
                                  title="Jump to Historical Analysis for this rule around this time"
                                >
                                  Investigate →
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
              {showAnomalyFeed && (
                <div style={{ maxHeight: 280, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {sortedAnomalyData.slice(0, 30).map((ev, i) => {
                    const ruleId = ev.ruleId || ev.id || 'unknown';
                    const entity = ev.entityValue || ev.groupKey || ev.entity || '—';
                    const ts     = ev.timestamp || ev.producedAt || ev.detectedAt || ev.windowEnd || '';
                    const sev    = ev.severity || ev.severityLevel || '';
                    const rColor = getRuleColor(rules, ruleId);
                    return (
                      <div
                        key={i}
                        onClick={() => openEntityDetail(entity)}
                        title="View this entity's full history"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', borderLeft: `3px solid ${rColor}`, fontSize: '0.78rem', cursor: 'pointer' }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.67rem' }}><RuleLink ruleName={getRuleName(ruleId)} ruleId={ruleId} onRuleClick={handleRuleClick} style={{ color: 'var(--text-3)' }} /></div>
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
                  {sortedAnomalyData.length > 30 && (
                    <p style={{ color: 'var(--text-3)', fontSize: '0.73rem', textAlign: 'center', margin: '0.25rem 0 0' }}>+ {sortedAnomalyData.length - 30} more breach events</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Row 1: KPI Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.875rem' }}>
            <div className="metric-card" style={{ minWidth: 0 }}>
              <h3>Checks Performed</h3>
              <div className="value">{totalWindows.toLocaleString()}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>Evaluation periods</div>
            </div>
            <div
              className={`metric-card ${totalBreaches > 0 ? 'breach-glow' : ''}`}
              style={{ minWidth: 0, cursor: totalBreaches > 0 ? 'pointer' : 'default' }}
              onClick={totalBreaches > 0 ? openBreachList : undefined}
              title={totalBreaches > 0 ? 'View every breach in this range' : undefined}
            >
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
              <h3>Avg Events per Check</h3>
              <div className="value">{avgEventsPerWindow}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>Mean event rate</div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              Window Intensity + Cumulative Breaches (side-by-side)
              Dynamic bucketing: minute < 12h, hour 12h-3d, day > 3d
              ═══════════════════════════════════════════════════════════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1rem', marginTop: '-8px' }}>

            {/* Window Intensity */}
            <div className="chart-container">
              <div className="chart-title" style={{ marginBottom: '1.25rem' }}>
                Window Intensity
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 10 }}>
                  🟥 breach&nbsp;·&nbsp; 🟦 normal &nbsp;·&nbsp; click a bar for details
                </span>
              </div>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={breachBarData} margin={{ top: 10, right: 16, bottom: 36, left: 12 }} barCategoryGap="20%">
                    <defs>
                      <linearGradient id="gradBarBreachAgg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={BREACH_RED} stopOpacity={0.95} />
                        <stop offset="100%" stopColor="#7f1d1d" stopOpacity={0.8} />
                      </linearGradient>
                      <linearGradient id="gradBarNormalAgg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT_BLUE} stopOpacity={0.9} />
                        <stop offset="100%" stopColor="#1e1b4b" stopOpacity={0.7} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis
                      dataKey="windowStart"
                      stroke={AXIS_STROKE}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={formatTime}
                      minTickGap={40}
                      dy={6}
                    />
                    <YAxis stroke={AXIS_STROKE} tick={{ fontSize: 10, fill: '#64748b' }} width={36} allowDecimals={false} />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      labelFormatter={formatTime}
                      formatter={(value, name, props) => {
                        const breached = props.payload?.breached;
                        return [value, breached ? '⚡ Events (BREACH)' : '📊 Events'];
                      }}
                    />
                    <Bar
                      dataKey="count"
                      name="Events"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={32}
                      cursor="pointer"
                      onClick={(entry) => entry && openWindowDetail(entry.windowStart)}
                    >
                      {breachBarData.map((entry, index) => (
                        <Cell
                          key={`cell_${index}`}
                          fill={entry.breached ? 'url(#gradBarBreachAgg)' : 'url(#gradBarNormalAgg)'}
                          opacity={entry.breached ? 1 : 0.7}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Cumulative Breaches */}
            <div className="chart-container">
              <div className="chart-title" style={{ marginBottom: '1.25rem' }}>Cumulative Breaches</div>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cumulativeData.merged} margin={{ top: 10, right: 16, bottom: 36, left: 12 }}>
                    <defs>
                      <linearGradient id="gradCumBreachAgg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={BREACH_RED} stopOpacity={0.45} />
                        <stop offset="100%" stopColor={BREACH_RED} stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid {...GRID_PROPS} />
                    <XAxis
                      dataKey="windowStart"
                      stroke={AXIS_STROKE}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={formatTime}
                      minTickGap={40}
                      dy={6}
                    />
                    <YAxis stroke={AXIS_STROKE} tick={{ fontSize: 10, fill: '#64748b' }} width={36} allowDecimals={false} />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      labelFormatter={formatTime}
                      formatter={(value, name) => [value, `Cumulative Breaches — ${getRuleName(name.replace('cum_', ''))}`]}
                    />
                    <Legend
                      verticalAlign="top"
                      wrapperStyle={{ paddingBottom: '0.5rem', fontSize: '0.75rem' }}
                      formatter={(value) => getRuleName(value.replace('cum_', ''))}
                    />
                    {selectedRules.map(r => {
                      const id = r.rule_metadata.rule_id;
                      return (
                        <Area
                          key={`cum_${id}`}
                          type="monotone"
                          dataKey={`cum_${id}`}
                          stroke={BREACH_RED}
                          strokeWidth={2.5}
                          fill="url(#gradCumBreachAgg)"
                          name={`cum_${id}`}
                          dot={(props) => {
                            // Show a marker only at timestamps where the cumulative count incremented.
                            // breachIncrementTs is pre-computed in the useMemo above;
                            // we never access props.data here to avoid the Recharts undefined crash.
                            const { cx, cy, payload } = props;
                            if (!payload || cx == null || cy == null) return null;
                            if (!cumulativeData.breachIncrementTs.has(payload.windowStart)) return null;
                            return (
                              <g key={`dot_${payload.windowStart}`}>
                                <circle cx={cx} cy={cy} r={10} fill="rgba(239,68,68,0.15)" />
                                <circle cx={cx} cy={cy} r={5} fill={BREACH_RED} stroke="#fff" strokeWidth={1.5} />
                              </g>
                            );
                          }}
                          activeDot={{ r: 5, fill: BREACH_RED, stroke: '#fff', strokeWidth: 2 }}
                          isAnimationActive={true}
                          animationDuration={900}
                        />
                      );
                    })}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              Consolidated Chart: Detailed Metrics & Anomaly Overlays
              ═══════════════════════════════════════════════════════════════════ */}
          <div className="chart-container" style={{ marginBottom: '-15px', height: 'auto' }}>
            <div className="chart-title" style={{ marginBottom: '1.25rem' }}>
              Detailed Metrics &amp; Anomaly Overlays
            </div>
            <div style={{ width: '100%', height: 420 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={comboData} margin={{ top: 10, right: 24, bottom: 45, left: 12 }}>
                  <ChartGradientDefs />
                  <CartesianGrid {...GRID_PROPS} />

                  <XAxis
                    dataKey="windowStart"
                    stroke={AXIS_STROKE}
                    tick={<CustomXAxisTick breachTs={breachTimestamps} />}
                    minTickGap={40}
                    dy={8}
                  />
                  <YAxis
                    stroke={AXIS_STROKE}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    allowDecimals={false}
                    width={44}
                    label={{ value: 'Events / Window', angle: -90, position: 'insideLeft', offset: 12, style: { fill: '#64748b', fontSize: 10 } }}
                  />

                  <Tooltip content={<EventVolumeTooltip getRuleName={getRuleName} />} />

                  <Legend
                    verticalAlign="top"
                    wrapperStyle={{ paddingBottom: '0.75rem', fontSize: '0.78rem', cursor: 'pointer' }}
                    onClick={handleLegendClick}
                    formatter={(value) => {
                      if (String(value).startsWith('evt_')) return `📊 Events`;
                      if (String(value).startsWith('agg_')) return `〰 Metric Value`;
                      if (value === 'breachMarker') return `🔴 Breaches`;
                      return value;
                    }}
                  />

                  {/* ── Aggregation metric lines (dashed, same Y-axis) ── */}
                  {aggLines.map((line) => (
                    <Line
                      key={line.key}
                      type="monotone"
                      dataKey={line.key}
                      name={line.key}
                      stroke={ACCENT_CYAN}
                      strokeWidth={1.8}
                      strokeDasharray={line.dashArray || '6 3'}
                      dot={false}
                      activeDot={{ r: 4, fill: ACCENT_CYAN, stroke: '#fff', strokeWidth: 1.5 }}
                      isAnimationActive={false}
                      hide={hiddenSeries[line.key]}
                    />
                  ))}

                  {/* ── Event Volume Area with gradient fill ── */}
                  {selectedRules.map(r => {
                    const id = r.rule_metadata.rule_id;
                    return (
                      <Area
                        key={`evt_${id}`}
                        type="monotone"
                        dataKey={`evt_${id}`}
                        stroke={ACCENT_BLUE}
                        strokeWidth={2.5}
                        fill="url(#gradEventVolume)"
                        name={`evt_${id}`}
                        activeDot={{ r: 6, fill: ACCENT_BLUE, stroke: '#fff', strokeWidth: 2 }}
                        isAnimationActive={true}
                        animationDuration={800}
                        hide={hiddenSeries[`evt_${id}`]}
                      />
                    );
                  })}

                  {/* ── Precise Breach Markers (Scatter with red pointer) ── */}
                  <Scatter
                    dataKey="breachMarker"
                    name="breachMarker"
                    fill={BREACH_RED}
                    hide={hiddenSeries['breachMarker']}
                    shape={(props) => {
                      const { cx, cy } = props;
                      if (cx == null || cy == null) return null;
                      return (
                        <g>
                          <circle cx={cx} cy={cy} r={6} fill={BREACH_RED} stroke="#fff" strokeWidth={1.5} />
                          <path d={`M${cx},${cy + 6} L${cx - 4},${cy + 14} L${cx + 4},${cy + 14} Z`} fill={BREACH_RED} />
                        </g>
                      );
                    }}
                    isAnimationActive={false}
                  />

                  <Brush
                    dataKey="windowStart"
                    height={22}
                    stroke="rgba(99,102,241,0.4)"
                    fill="rgba(8,12,28,0.9)"
                    tickFormatter={formatTime}
                    travellerWidth={6}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Entity Breach Ranking Table */}
          <div className="chart-container">
            <div className="chart-title">Entity Breach Ranking</div>
            <div style={{ fontSize: '0.71rem', color: 'var(--text-3)', marginBottom: '0.75rem' }}>Top 20 tracked entities ranked by breach rate. Click column headers to sort, or a row for that entity's full history.</div>
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
                      <tr
                        key={g.groupKey + g.ruleId}
                        onClick={() => openEntityDetail(g.groupKey)}
                        style={{ borderLeft: `3px solid ${g.breaches > 0 ? color : 'transparent'}`, cursor: 'pointer' }}
                      >
                        <td style={tdStyle}>{i + 1}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--teal)', fontWeight: 600 }}>{g.groupKey}</td>
                        <td style={tdStyle}><RuleLink ruleName={getRuleName(g.ruleId)} ruleId={g.ruleId} onRuleClick={handleRuleClick} /></td>
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
                        No entity data available for the selected rule and time range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              Click-to-detail overlays — same shared-slot pattern as Live
              Stream: Entity Detail drawer, Window/Bucket Detail modal,
              Breach List modal.
              ═══════════════════════════════════════════════════════════════ */}

          <Drawer
            open={overlay?.type === 'entity'}
            onClose={closeOverlay}
            icon={Fingerprint}
            title={entityDetail?.groupKey || ''}
            subtitle="Analytics · Entity Snapshot"
            footer={currentRule && (
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => handleRuleClick(currentRule.rule_metadata.rule_id)}
              >
                Watched by {currentRule.rule_metadata.rule_name} <ArrowRight size={14} />
              </button>
            )}
          >
            {entityDetail && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="metric-card">
                    <h3>Total Events</h3>
                    <div className="value">{entityDetail.totalEvents.toLocaleString()}</div>
                  </div>
                  <div className="metric-card">
                    <h3>Windows Tracked</h3>
                    <div className="value">{entityDetail.totalWindows.toLocaleString()}</div>
                  </div>
                  <div className={`metric-card ${entityDetail.breaches > 0 ? 'breach-glow' : ''}`}>
                    <h3>Breaches</h3>
                    <div className="value" style={{ color: entityDetail.breaches > 0 ? BREACH_RED : undefined }}>{entityDetail.breaches.toLocaleString()}</div>
                  </div>
                  <div className="metric-card">
                    <h3>Breach Rate</h3>
                    <div className="value" style={{ color: getBreachColor(entityDetail.breachRate) }}>{entityDetail.breachRate.toFixed(1)}%</div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                    Activity Timeline
                  </div>
                  <div style={{ width: '100%', height: 130 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={entityDetail.timeline} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                        <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={10}>
                          {entityDetail.timeline.map((e, i) => (
                            <Cell key={i} fill={e.breached ? BREACH_RED : ACCENT_BLUE} opacity={e.breached ? 1 : 0.55} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                    Recent Windows <span style={{ textTransform: 'none', fontWeight: 400 }}>· click one for details</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {entityDetail.history.map((r, i) => (
                      <div
                        key={i}
                        onClick={() => openWindowDetail(getBucketKey(r.windowStart, bucketResolution))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.6rem',
                          background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: '0.78rem', cursor: 'pointer',
                          borderLeft: `3px solid ${isBreached(r) ? BREACH_RED : 'transparent'}`,
                        }}
                      >
                        <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{formatTime(r.windowStart)}</span>
                        <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{getRowEventCount(r)} events</span>
                        {isBreached(r) && <Zap size={11} color={BREACH_RED} />}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Drawer>

          <Modal
            open={overlay?.type === 'window'}
            onClose={closeOverlay}
            icon={Layers}
            title={windowDetail ? formatTime(windowDetail.bucketKey) : ''}
            subtitle={windowDetail ? `${windowDetail.rows.length} entit${windowDetail.rows.length !== 1 ? 'ies' : 'y'} active in this ${bucketResolution === 'minute' ? 'window' : bucketResolution}` : ''}
            width={580}
          >
            {windowDetail && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div className="metric-card" style={{ flex: 1, minWidth: 110 }}>
                    <h3>Total Events</h3>
                    <div className="value">{windowDetail.totalCount.toLocaleString()}</div>
                  </div>
                  <div className="metric-card" style={{ flex: 1, minWidth: 110 }}>
                    <h3>Threshold</h3>
                    <div className="value">{currentThreshold ?? '—'}</div>
                  </div>
                  <div className={`metric-card ${windowDetail.breachedCount > 0 ? 'breach-glow' : ''}`} style={{ flex: 1, minWidth: 110 }}>
                    <h3>Breaching Entities</h3>
                    <div className="value" style={{ color: windowDetail.breachedCount > 0 ? BREACH_RED : undefined }}>{windowDetail.breachedCount}</div>
                  </div>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Per-Entity Breakdown <span style={{ textTransform: 'none', fontWeight: 400 }}>· click one for its full history</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {windowDetail.rows.map((r, i) => {
                    const breached = isBreached(r);
                    const count = getRowEventCount(r);
                    const margin = currentThreshold != null ? count - currentThreshold : null;
                    return (
                      <div
                        key={i}
                        onClick={() => openEntityDetail(r.groupKey)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.55rem 0.75rem',
                          background: breached ? 'rgba(248,81,73,0.08)' : 'rgba(255,255,255,0.03)', borderRadius: 8, cursor: 'pointer',
                          borderLeft: `3px solid ${breached ? BREACH_RED : ACCENT_BLUE}`,
                        }}
                      >
                        <span style={{ fontFamily: 'monospace', color: 'var(--teal)', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.groupKey}</span>
                        <span style={{ fontWeight: 700 }}>{count} events</span>
                        {margin != null && (
                          <span style={{ fontSize: '0.7rem', color: breached ? BREACH_RED : SAFE_GREEN, fontWeight: 600, minWidth: 82, textAlign: 'right' }}>
                            {margin >= 0 ? `+${margin}` : margin} vs threshold
                          </span>
                        )}
                        {breached && <Zap size={13} color={BREACH_RED} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Modal>

          <Modal
            open={overlay?.type === 'breachList'}
            onClose={closeOverlay}
            icon={Zap}
            iconColor={BREACH_RED}
            title="Breach Events"
            subtitle={showGroupFilter && selectedGroup !== '__ALL__' ? `Filtered to ${selectedGroup}` : 'All entities · queried range'}
            width={580}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {breachListRows.length === 0 && (
                <p style={{ color: 'var(--text-3)', textAlign: 'center', padding: '1.5rem' }}>No breaches in this range.</p>
              )}
              {breachListRows.map((r, i) => (
                <div
                  key={i}
                  onClick={() => openEntityDetail(r.groupKey)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.55rem 0.75rem',
                    background: 'rgba(248,81,73,0.07)', borderRadius: 8, cursor: 'pointer', borderLeft: `3px solid ${BREACH_RED}`,
                  }}
                >
                  <span style={{ color: 'var(--text-3)', fontSize: '0.75rem', flexShrink: 0, minWidth: 90 }}>{formatTime(r.windowStart)}</span>
                  <span style={{ fontFamily: 'monospace', color: 'var(--teal)', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.groupKey}</span>
                  <span style={{ fontWeight: 700 }}>{getRowEventCount(r)} events</span>
                  <Zap size={13} color={BREACH_RED} />
                </div>
              ))}
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
