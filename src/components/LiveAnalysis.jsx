import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Activity, ArrowUpDown, TrendingUp, TrendingDown, Minus, Clock, AlertTriangle, Zap, Shield, BarChart2 } from 'lucide-react';
import {
  ComposedChart, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Brush, ReferenceLine, ReferenceDot, ReferenceArea, Cell, ScatterChart, Scatter
} from 'recharts';
import { getRuleColor } from '../constants';
import { formatISTTime, formatISTDateTime } from '../utils/istUtils';
import { MockLiveTicker, MOCK_RULE_ID } from '../simulation/mockEngine';

// ─── Design System ────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'rgba(8,12,28,0.97)',
    border: '1px solid rgba(99,102,241,0.3)',
    borderRadius: '10px',
    color: '#e2e8f0',
    fontSize: '0.8rem',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    backdropFilter: 'blur(12px)',
  },
  labelStyle: { color: '#a5b4fc', fontWeight: 700, marginBottom: '0.4rem', fontSize: '0.78rem' },
  itemStyle: { color: '#cbd5e1' },
};

const AXIS_STROKE = '#334155';
const GRID_PROPS = { strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.05)', vertical: false };
const DASH_PATTERNS = ['', '5 5', '8 4', '3 6', '10 3', '4 4 2 4'];

// Semantic colors
const BREACH_RED   = '#ef4444';
const BREACH_AMBER = '#f97316';
const SAFE_GREEN   = '#10b981';
const ACCENT_BLUE  = '#6366f1';
const ACCENT_CYAN  = '#06b6d4';

const STATUS_COLORS = {
  connected:    SAFE_GREEN,
  reconnecting: '#f59e0b',
  disconnected: BREACH_RED,
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAsIST(ts) {
  if (!ts) return null;
  const raw = String(ts).replace(' ', 'T');
  const d = new Date(raw.includes('+') || raw.endsWith('Z') ? raw : raw + '+05:30');
  return isNaN(d.getTime()) ? null : d;
}

function formatTime(ts) { return formatISTTime(ts); }

function formatTimeShort(ts) {
  const d = parseAsIST(ts);
  if (!d) return ts ? String(ts) : '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function timeAgo(ts) {
  if (!ts) return 'N/A';
  const d = parseAsIST(ts);
  if (!d) return 'N/A';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return 'Just now';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function parseMetricValues(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function isBreached(row) {
  return row.thresholdMet === true || row.thresholdMet === 1
    || row.thresholdBreached === true || row.thresholdBreached === 1;
}

function normalizeRow(row) {
  if (!row) return row;
  const r = { ...row };
  if (!r.ruleId && r.id) r.ruleId = r.id;
  if (!r.groupKey && r.entityValue) r.groupKey = r.entityValue;
  if (!r.aggregationResults && r.aggResult) {
    r.aggregationResults = typeof r.aggResult === 'string'
      ? (() => { try { return JSON.parse(r.aggResult); } catch { return {}; } })()
      : r.aggResult;
  }
  if (!r.evaluatedAt && r.producedAt) r.evaluatedAt = r.producedAt;
  return r;
}

function getEventCount(row) {
  if (row.eventCount != null) return Number(row.eventCount) || 0;
  const aggObj = row.aggResult && typeof row.aggResult === 'object' ? row.aggResult
    : row.aggregationResults && typeof row.aggregationResults === 'object' ? row.aggregationResults
    : null;
  if (aggObj) {
    for (const alias of ['count', 'eventCount', 'event_count', 'txnCount', 'total']) {
      if (aggObj[alias] != null) return Number(aggObj[alias]) || 0;
    }
    let sum = 0;
    for (const val of Object.values(aggObj)) { const n = Number(val); if (!isNaN(n)) sum += n; }
    if (sum > 0) return sum;
  }
  const mv = parseMetricValues(row.metricValues);
  if (mv.eventCount != null) return Number(mv.eventCount) || 0;
  if (mv.event_count != null) return Number(mv.event_count) || 0;
  if (mv.count != null) return Number(mv.count) || 0;
  return 0;
}

// ─── Custom SVG Dot — only renders on breach points ───────────────────────────
function BreachDot(props) {
  const { cx, cy, payload, ruleId } = props;
  if (!payload || !isBreached(payload) || cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill="rgba(239,68,68,0.18)" />
      <circle cx={cx} cy={cy} r={5} fill={BREACH_RED} stroke="#fff" strokeWidth={1.5} />
    </g>
  );
}

// ─── Custom Tooltip for Event Volume chart ────────────────────────────────────
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
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 2 }}>
          <span style={{ color: '#94a3b8' }}>Events</span>
          <span style={{ color: p.stroke || '#e2e8f0', fontWeight: 700 }}>{p.value}</span>
        </div>
      ))}
      {breached && (
        <div style={{ marginTop: 6, padding: '4px 8px', background: 'rgba(239,68,68,0.12)', borderRadius: 4, fontSize: '0.72rem', color: BREACH_RED, textAlign: 'center', fontWeight: 700 }}>
          Threshold Exceeded
        </div>
      )}
    </div>
  );
}

// ─── Gradient defs for charts ─────────────────────────────────────────────────
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LiveAnalysis({ rules, selectedRuleIds, allSelectedRuleIds, simulationMode }) {
  const [data, setData] = useState({});
  const [sortCol, setSortCol] = useState('breaches');
  const [sortDir, setSortDir] = useState('desc');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const tableRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const fallbackIntervalRef = useRef(null);
  const usingFallbackRef = useRef(false);
  const mockTickerRef = useRef(null);

  const selectedRules = useMemo(
    () => rules.filter(r => selectedRuleIds.has(r.rule_metadata.rule_id)),
    [rules, selectedRuleIds]
  );

  const handleDelta = useCallback((ruleId, row) => {
    const normRow = normalizeRow(row);
    setData(prev => {
      const next = { ...prev };
      if (!next[ruleId]) next[ruleId] = [];
      next[ruleId] = [...next[ruleId], normRow];
      const cutoffEpoch = Date.now() - 24 * 60 * 60 * 1000;
      const istWall = new Date(cutoffEpoch + IST_OFFSET_MS);
      const pad = (n) => String(n).padStart(2, '0');
      const cutoff = `${istWall.getUTCFullYear()}-${pad(istWall.getUTCMonth()+1)}-${pad(istWall.getUTCDate())} ${pad(istWall.getUTCHours())}:${pad(istWall.getUTCMinutes())}:${pad(istWall.getUTCSeconds())}`;
      next[ruleId] = next[ruleId].filter(r => (r.windowStart || '') >= cutoff);
      return next;
    });
  }, []);

  const fetchDataHttp = useCallback(async () => {
    if (selectedRuleIds.size === 0) return;
    const ids = [...selectedRuleIds].join(',');
    try {
      const res = await fetch(`/api/rules/live-analysis?rule_ids=${ids}&hours=24`);
      if (res.ok) {
        const json = await res.json();
        setData(json.results || {});
      }
    } catch (e) { console.error('Live fetch error:', e); }
  }, [selectedRuleIds]);

  const closeWebSocket = useCallback(() => {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (wsRef.current) {
      wsRef.current.onclose = null; wsRef.current.onerror = null;
      wsRef.current.onmessage = null; wsRef.current.close(); wsRef.current = null;
    }
  }, []);

  const startFallbackPolling = useCallback(() => {
    if (usingFallbackRef.current) return;
    usingFallbackRef.current = true;
    setConnectionStatus('disconnected');
    fetchDataHttp();
    fallbackIntervalRef.current = setInterval(fetchDataHttp, 5000);
  }, [fetchDataHttp]);

  const stopFallbackPolling = useCallback(() => {
    usingFallbackRef.current = false;
    if (fallbackIntervalRef.current) { clearInterval(fallbackIntervalRef.current); fallbackIntervalRef.current = null; }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (selectedRuleIds.size === 0) return;
    closeWebSocket();
    stopFallbackPolling();
    setConnectionStatus('reconnecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws/live-analysis`;
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setConnectionStatus('connected');
        ws.send(JSON.stringify({ type: 'subscribe', rule_ids: [...selectedRuleIds] }));
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'bootstrap') setData(msg.data || {});
          else if (msg.type === 'delta') handleDelta(msg.rule_id, msg.row);
        } catch { /* ignore malformed messages */ }
      };
      ws.onclose = () => {
        wsRef.current = null;
        reconnectAttemptRef.current += 1;
        if (reconnectAttemptRef.current >= 3) { startFallbackPolling(); return; }
        setConnectionStatus('reconnecting');
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
        reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
      };
      ws.onerror = () => { ws.close(); };
    } catch {
      reconnectAttemptRef.current += 1;
      if (reconnectAttemptRef.current >= 3) startFallbackPolling();
      else {
        setConnectionStatus('reconnecting');
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
        reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
      }
    }
  }, [selectedRuleIds, closeWebSocket, stopFallbackPolling, startFallbackPolling, handleDelta]);

  // ── Simulation mode: MockLiveTicker replaces WebSocket ──────────────────────
  useEffect(() => {
    if (!simulationMode) return;
    if (mockTickerRef.current) { mockTickerRef.current.stop(); mockTickerRef.current = null; }
    if (selectedRuleIds.size === 0) { setData({}); setConnectionStatus('disconnected'); return; }
    setConnectionStatus('connected');
    const ticker = new MockLiveTicker(
      (ruleId, rows) => setData(prev => ({ ...prev, [ruleId]: rows.map(r => normalizeRow(r)) })),
      (ruleId, row) => handleDelta(ruleId, row),
    );
    ticker.start();
    mockTickerRef.current = ticker;
    return () => { ticker.stop(); mockTickerRef.current = null; };
  }, [simulationMode, selectedRuleIds, handleDelta]);

  // ── Real WebSocket / HTTP fallback (only when NOT in simulation mode) ────────
  useEffect(() => {
    if (simulationMode) return;
    if (selectedRuleIds.size === 0) {
      setData({}); closeWebSocket(); stopFallbackPolling(); setConnectionStatus('disconnected'); return;
    }
    if (usingFallbackRef.current) { stopFallbackPolling(); startFallbackPolling(); }
    else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', rule_ids: [...selectedRuleIds] }));
    } else { reconnectAttemptRef.current = 0; connectWebSocket(); }
    return () => { closeWebSocket(); stopFallbackPolling(); };
  }, [simulationMode, selectedRuleIds, connectWebSocket, closeWebSocket, stopFallbackPolling, startFallbackPolling]);

  const getRuleName = useCallback((ruleId) => {
    const match = rules.find(rule => rule.rule_metadata.rule_id === ruleId);
    return match ? match.rule_metadata.rule_name : ruleId;
  }, [rules]);

  // ─── Data derivations ──────────────────────────────────────────────────────

  const allRows = useMemo(() => {
    const rows = [];
    for (const [ruleId, arr] of Object.entries(data)) {
      if (!selectedRuleIds.has(ruleId)) continue;
      (arr || []).forEach(row => rows.push({ ...row, ruleId }));
    }
    return rows;
  }, [data, selectedRuleIds]);

  const totalWindows = allRows.length;
  const breachCount = useMemo(() => allRows.filter(r => isBreached(r)).length, [allRows]);
  const breachRate = totalWindows > 0 ? ((breachCount / totalWindows) * 100).toFixed(1) : '0.0';
  const uniqueGroups = useMemo(() => new Set(allRows.map(r => r.groupKey)).size, [allRows]);

  const lastBreachInfo = useMemo(() => {
    const breachRows = allRows.filter(r => isBreached(r));
    if (breachRows.length === 0) return { text: 'None', color: '#94a3b8' };
    let latest = null;
    for (const row of breachRows) {
      const d = parseAsIST(row.evaluatedAt || row.windowEnd || row.windowStart);
      if (d && (!latest || d.getTime() > latest.getTime())) latest = d;
    }
    if (!latest) return { text: 'None', color: '#94a3b8' };
    const diffMin = (Date.now() - latest.getTime()) / 60000;
    return {
      text: timeAgo(latest.toISOString()),
      color: diffMin > 10 ? SAFE_GREEN : diffMin >= 2 ? '#f59e0b' : BREACH_RED,
    };
  }, [allRows]);

  const breachTrend = useMemo(() => {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const twoHoursAgo = now - 7200000;
    let lastHour = 0, prevHour = 0;
    for (const row of allRows.filter(r => isBreached(r))) {
      const d = parseAsIST(row.windowStart || row.evaluatedAt);
      if (!d) continue;
      const ts = d.getTime();
      if (ts >= oneHourAgo && ts <= now) lastHour++;
      else if (ts >= twoHoursAgo && ts < oneHourAgo) prevHour++;
    }
    if (lastHour === 0 && prevHour === 0) return { text: '— Stable', color: '#94a3b8', Icon: Minus };
    if (lastHour > prevHour) return { text: 'Rising', color: BREACH_RED, Icon: TrendingUp };
    if (lastHour < prevHour) return { text: 'Declining', color: SAFE_GREEN, Icon: TrendingDown };
    return { text: 'Stable', color: '#f59e0b', Icon: Minus };
  }, [allRows]);

  // Chart 1: Event Volume — also bakes in agg metric values and breach markers
  const { comboData, breachTs } = useMemo(() => {
    const timeMap = {};
    for (const row of allRows) {
      const ts = row.windowStart;
      if (!ts) continue;
      if (!timeMap[ts]) timeMap[ts] = { windowStart: ts, _tsMs: new Date(ts).getTime(), _breached: false };

      const evtKey = `evt_${row.ruleId}`;
      timeMap[ts][evtKey] = (timeMap[ts][evtKey] || 0) + getEventCount(row);

      if (isBreached(row)) {
        timeMap[ts]._breached = true;
        timeMap[ts].thresholdBreached = true;
        timeMap[ts].thresholdMet = true;
      }

      // Also bake in agg metric values (for consolidated view)
      const aggObj = row.aggResult && typeof row.aggResult === 'object' ? row.aggResult
        : row.aggregationResults && typeof row.aggregationResults === 'object' ? row.aggregationResults : null;
      if (aggObj) {
        for (const [alias, val] of Object.entries(aggObj)) {
          const numVal = Number(val);
          if (!isNaN(numVal)) timeMap[ts][`agg_${row.ruleId}__${alias}`] = numVal;
        }
      }
      const mv = parseMetricValues(row.metricValues);
      for (const [alias, val] of Object.entries(mv)) {
        const numVal = Number(val);
        if (!isNaN(numVal)) timeMap[ts][`agg_${row.ruleId}__${alias}`] = numVal;
      }
    }
    const sorted = Object.values(timeMap).sort((a, b) => a._tsMs - b._tsMs);

    // Collect exact breach timestamps (windowStart of each breached window)
    const breachTimestamps = sorted.filter(pt => pt._breached).map(pt => pt.windowStart);

    return { comboData: sorted, breachTs: breachTimestamps };
  }, [allRows]);

  // Derive agg line descriptors from selectedRules / data (for legend labels in consolidated chart)
  const aggLineDescriptors = useMemo(() => {
    const lines = [];
    for (const ruleId of [...selectedRuleIds]) {
      const rows = data[ruleId] || [];
      if (!rows.length) continue;
      const metricKeysSet = new Set();
      for (const row of rows) {
        const aggObj = row.aggResult && typeof row.aggResult === 'object' ? row.aggResult
          : row.aggregationResults && typeof row.aggregationResults === 'object' ? row.aggregationResults : null;
        if (aggObj) for (const k of Object.keys(aggObj)) metricKeysSet.add(k);
        const mv = parseMetricValues(row.metricValues);
        for (const k of Object.keys(mv)) metricKeysSet.add(k);
      }
      const rName = getRuleName(ruleId);
      [...metricKeysSet].forEach((alias, ai) => {
        lines.push({
          key: `agg_${ruleId}__${alias}`,
          name: `${rName} · ${alias}`,
          dashArray: DASH_PATTERNS[(ai + 1) % DASH_PATTERNS.length],
        });
      });
    }
    return lines;
  }, [data, selectedRuleIds, getRuleName]);

  // Chart 2: Cumulative Breaches — area gradient
  const cumulativeData = useMemo(() => {
    const perRule = {};
    for (const ruleId of [...selectedRuleIds]) {
      const ruleRows = allRows.filter(r => r.ruleId === ruleId);
      const timeMap = {};
      for (const row of ruleRows) {
        const ts = row.windowStart;
        if (!ts) continue;
        if (!timeMap[ts]) timeMap[ts] = { windowStart: ts, breaches: 0 };
        if (isBreached(row)) timeMap[ts].breaches++;
      }
      const sorted = Object.values(timeMap).sort((a, b) => new Date(a.windowStart) - new Date(b.windowStart));
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
      for (const ruleId of [...selectedRuleIds]) {
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
      for (const ruleId of [...selectedRuleIds]) {
        const key = `cum_${ruleId}`;
        if ((merged[i][key] || 0) > (merged[i - 1][key] || 0)) {
          breachIncrementTs.add(merged[i].windowStart);
          break;
        }
      }
    }

    return { merged, breachIncrementTs };
  }, [allRows, selectedRuleIds]);

  // Chart 3: Event count bars colored by breach status
  const breachBarData = useMemo(() => {
    const timeMap = {};
    for (const row of allRows) {
      const ts = row.windowStart;
      if (!ts) continue;
      if (!timeMap[ts]) timeMap[ts] = { windowStart: ts, count: 0, breached: false };
      timeMap[ts].count += getEventCount(row);
      if (isBreached(row)) timeMap[ts].breached = true;
    }
    return Object.values(timeMap).sort((a, b) => new Date(a.windowStart) - new Date(b.windowStart));
  }, [allRows]);

  // (aggData / aggLines removed — aggregation metrics are now merged into the primary ComposedChart)

  const currentlyBreaching = useMemo(() => {
    const set = new Set();
    let latestTs = null;
    for (const row of allRows) {
      const d = new Date(row.windowStart);
      if (!isNaN(d.getTime()) && (!latestTs || d > latestTs)) latestTs = d;
    }
    if (!latestTs) return set;
    for (const row of allRows) {
      const d = new Date(row.windowStart);
      if (d.getTime() === latestTs.getTime() && isBreached(row)) set.add(`${row.groupKey}||${row.ruleId}`);
    }
    return set;
  }, [allRows]);

  const groupTableData = useMemo(() => {
    const groupMap = {};
    for (const row of allRows) {
      const gk = row.groupKey || 'N/A';
      const key = `${gk}||${row.ruleId}`;
      if (!groupMap[key]) {
        groupMap[key] = { groupKey: gk, entityName: row.entityName || '', ruleId: row.ruleId, totalEvents: 0, breaches: 0, windows: 0, lastWindow: row.windowEnd || row.windowStart };
      }
      groupMap[key].totalEvents += getEventCount(row);
      groupMap[key].windows += 1;
      if (isBreached(row)) groupMap[key].breaches += 1;
      const rowEnd = row.windowEnd || row.windowStart;
      if (rowEnd > groupMap[key].lastWindow) groupMap[key].lastWindow = rowEnd;
    }
    const arr = Object.values(groupMap).map(g => ({
      ...g, breachRate: g.windows > 0 ? ((g.breaches / g.windows) * 100).toFixed(1) : '0.0',
    }));
    arr.sort((a, b) => {
      const aVal = a[sortCol], bVal = b[sortCol];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        const r = sortDir === 'desc' ? bVal - aVal : aVal - bVal;
        return r !== 0 ? r : (sortCol !== 'breaches' ? b.breaches - a.breaches : b.totalEvents - a.totalEvents);
      }
      const r = sortDir === 'desc' ? String(bVal).localeCompare(String(aVal)) : String(aVal).localeCompare(String(bVal));
      return r !== 0 ? r : b.breaches - a.breaches;
    });
    return arr.slice(0, 20);
  }, [allRows, sortCol, sortDir]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  // ─── Empty State ───────────────────────────────────────────────────────────

  if (selectedRuleIds.size === 0) {
    const hasDraftOnly = allSelectedRuleIds && allSelectedRuleIds.size > 0 && selectedRuleIds.size === 0;
    return (
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '500px', gap: '1.5rem' }}>
        <Activity size={64} color="var(--text-muted)" style={{ opacity: 0.4 }} />
        {hasDraftOnly ? (
          <>
            <p style={{ color: '#f59e0b', fontSize: '1rem', textAlign: 'center', maxWidth: 440, fontWeight: 600 }}>Selected rules are in DRAFT status</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', maxWidth: 440 }}>DRAFT rules are not processed by Flink and cannot stream live data. Publish the rule to make it ACTIVE, or use Historical Analysis to test it against past data.</p>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', textAlign: 'center', maxWidth: 400 }}>Select one or more rules from the sidebar to see live analysis</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', opacity: 0.7, textAlign: 'center' }}>WebSocket streaming · 24-hour rolling window</p>
          </>
        )}
      </div>
    );
  }

  const thStyle = {
    textAlign: 'left', padding: '0.6rem 0.8rem', color: 'var(--text-muted)', fontWeight: 600,
    fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em',
    cursor: 'pointer', userSelect: 'none', borderBottom: '1px solid var(--glass-border)',
    whiteSpace: 'nowrap',
  };
  const tdStyle = { padding: '0.55rem 0.8rem', fontSize: '0.82rem', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle' };

  const statusColor = STATUS_COLORS[connectionStatus] || STATUS_COLORS.disconnected;
  const statusLabel = usingFallbackRef.current ? 'Polling (fallback)' : connectionStatus;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* ── Connection status pill ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{
          display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
          background: statusColor, boxShadow: `0 0 6px ${statusColor}`,
          animation: connectionStatus === 'connected' ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: '0.75rem', color: statusColor, textTransform: 'capitalize', fontWeight: 600 }}>{statusLabel}</span>
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {/* Total Windows */}
        <div className="metric-card" style={{ flex: 1, minWidth: 130 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BarChart2 size={13} style={{ opacity: 0.7 }} /> Total Windows</h3>
          <div className="value">{totalWindows.toLocaleString()}</div>
        </div>

        {/* Breach Count */}
        <div className={`metric-card ${breachCount > 0 ? 'breach-glow' : ''}`} style={{ flex: 1, minWidth: 130 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={13} style={{ opacity: 0.7 }} /> Breaches</h3>
          <div className="value" style={breachCount > 0 ? { background: `linear-gradient(135deg, ${BREACH_RED}, ${BREACH_AMBER})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } : undefined}>
            {breachCount.toLocaleString()}
          </div>
        </div>

        {/* Breach Rate */}
        <div className="metric-card" style={{ flex: 1, minWidth: 130 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Shield size={13} style={{ opacity: 0.7 }} /> Breach Rate</h3>
          <div className="value" style={{
            color: parseFloat(breachRate) > 50 ? BREACH_RED : parseFloat(breachRate) > 25 ? '#f59e0b' : SAFE_GREEN,
          }}>{breachRate}%</div>
        </div>

        {/* Unique Groups */}
        <div className="metric-card" style={{ flex: 1, minWidth: 130 }}>
          <h3>Unique Groups</h3>
          <div className="value">{uniqueGroups.toLocaleString()}</div>
        </div>

        {/* Last Breach */}
        <div className="metric-card" style={{ flex: 1, minWidth: 130 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={13} style={{ opacity: 0.7 }} /> Last Breach</h3>
          <div className="value" style={{ color: lastBreachInfo.color, fontSize: '1.2rem' }}>{lastBreachInfo.text}</div>
        </div>

        {/* Breach Trend */}
        <div className="metric-card" style={{ flex: 1, minWidth: 130 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><breachTrend.Icon size={13} style={{ opacity: 0.7 }} /> Trend</h3>
          <div className="value" style={{ color: breachTrend.color, fontSize: '1.1rem', fontWeight: 700 }}>{breachTrend.text}</div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          Chart 1: Event Volume — area + agg metric lines + precise breach markers
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="chart-container" style={{ paddingBottom: '0.5rem' }}>
        <div className="chart-title" style={{ marginBottom: '1.25rem' }}>
          Event Volume &amp; Breach Markers
          {aggLineDescriptors.length > 0 && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 12 }}>
              · aggregation metrics overlaid as dashed lines
            </span>
          )}
        </div>
        {/* Fixed height + paddingBottom gives the Brush room without overlapping siblings */}
        <div style={{ width: '100%', height: 440, paddingBottom: '8px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={comboData} margin={{ top: 10, right: 24, bottom: 72, left: 12 }}>
              <ChartGradientDefs />
              <CartesianGrid {...GRID_PROPS} />

              <XAxis
                dataKey="windowStart"
                stroke={AXIS_STROKE}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={formatTime}
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
                wrapperStyle={{ paddingBottom: '0.75rem', fontSize: '0.78rem' }}
                formatter={(value) => {
                  if (value.startsWith('evt_')) return `📊 ${getRuleName(value.replace('evt_', ''))}`;
                  if (value.startsWith('agg_')) {
                    // agg_ruleId__alias → extract alias label
                    const parts = value.replace('agg_', '').split('__');
                    return `〰 ${parts[parts.length - 1]}`;
                  }
                  return value;
                }}
              />

              {/* ── Aggregation metric lines (dashed, same Y-axis) ── */}
              {aggLineDescriptors.map((line) => (
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
                    dot={(props) => <BreachDot {...props} />}
                    activeDot={{ r: 6, fill: ACCENT_BLUE, stroke: '#fff', strokeWidth: 2 }}
                    isAnimationActive={true}
                    animationDuration={800}
                  />
                );
              })}

              {/* ── Breach markers: precise vertical ReferenceLine at each breached windowStart ── */}
              {/* Each line marks exactly where the window closed and the threshold was exceeded.  */}
              {/* No area bands — the breach belongs to one point on the timeline, not a span.    */}
              {breachTs.map((ts, i) => (
                <ReferenceLine
                  key={`bl_${i}`}
                  x={ts}
                  stroke={BREACH_RED}
                  strokeWidth={2}
                  strokeOpacity={0.8}
                  strokeDasharray="4 3"
                  label={{
                    value: '⚡',
                    position: 'top',
                    style: { fontSize: 11, fill: BREACH_RED },
                  }}
                />
              ))}

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

      {/* ═══════════════════════════════════════════════════════════════════
          Chart row: Window Intensity + Cumulative Breaches
          50px top margin enforces the 1-2 cm gap from the chart above.
          ═══════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1rem', marginTop: '50px' }}>

        {/* Chart 2: Breach Intensity — colored bar per window */}
        <div className="chart-container">
          <div className="chart-title" style={{ marginBottom: '1.25rem' }}>
            Window Intensity
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 10 }}>
              🟥 breach &nbsp;·&nbsp; 🟦 normal
            </span>
          </div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breachBarData} margin={{ top: 10, right: 16, bottom: 36, left: 12 }} barCategoryGap="20%">
                <defs>
                  <linearGradient id="gradBarBreach" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BREACH_RED} stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#7f1d1d" stopOpacity={0.8} />
                  </linearGradient>
                  <linearGradient id="gradBarNormal" x1="0" y1="0" x2="0" y2="1">
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
                <Bar dataKey="count" name="Events" radius={[3, 3, 0, 0]} maxBarSize={32}>
                  {breachBarData.map((entry, index) => (
                    <Cell
                      key={`cell_${index}`}
                      fill={entry.breached ? 'url(#gradBarBreach)' : 'url(#gradBarNormal)'}
                      opacity={entry.breached ? 1 : 0.7}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Cumulative Breaches — area gradient */}
        <div className="chart-container">
          <div className="chart-title" style={{ marginBottom: '1.25rem' }}>Cumulative Breaches</div>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulativeData.merged} margin={{ top: 10, right: 16, bottom: 36, left: 12 }}>
                <defs>
                  <linearGradient id="gradCumBreachInner" x1="0" y1="0" x2="0" y2="1">
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
                      fill="url(#gradCumBreachInner)"
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

      {/* Standalone Aggregation Metrics chart removed — now merged into Event Volume chart above */}

      {/* ═══════════════════════════════════════════════════════════════════════
          Table: Top Groups by Breach Activity
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="chart-container">
        <div className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
          <AlertTriangle size={15} style={{ opacity: 0.7 }} />
          Top Groups by Breach Activity
        </div>
        <div ref={tableRef} style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'rgba(8,12,28,0.95)', zIndex: 1 }}>
              <tr>
                {[
                  ['#', null],
                  ['Entity', 'groupKey'],
                  ['Rule', 'ruleId'],
                  ['Events', 'totalEvents'],
                  ['Breaches', 'breaches'],
                  ['Breach Rate', 'breachRate'],
                  ['Last Window', 'lastWindow'],
                ].map(([label, col]) => (
                  <th key={label} style={thStyle} onClick={col ? () => handleSort(col) : undefined}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {label}{col && <ArrowUpDown size={11} style={{ opacity: 0.6 }} />}
                      {col === sortCol && <span style={{ color: ACCENT_BLUE, fontSize: '0.6rem' }}>{sortDir === 'desc' ? '▼' : '▲'}</span>}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupTableData.map((g, i) => {
                const color = getRuleColor(rules, g.ruleId);
                const isCurrentlyBreaching = currentlyBreaching.has(`${g.groupKey}||${g.ruleId}`);
                const br = parseFloat(g.breachRate);
                return (
                  <tr
                    key={`${g.groupKey}||${g.ruleId}`}
                    className={isCurrentlyBreaching ? 'breach-glow' : ''}
                    style={isCurrentlyBreaching
                      ? { borderLeft: `3px solid ${BREACH_RED}`, background: 'rgba(239,68,68,0.07)' }
                      : { borderLeft: `3px solid ${color}` }
                    }
                  >
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', width: 32 }}>{i + 1}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#93c5fd' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        {isCurrentlyBreaching && (
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: BREACH_RED, boxShadow: `0 0 6px ${BREACH_RED}`, animation: 'pulse-dot 1.5s ease-in-out infinite', flexShrink: 0 }} />
                        )}
                        <span>
                          {g.entityName && g.entityName !== 'group' && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>{g.entityName}</span>}
                          {g.groupKey}
                        </span>
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-2)' }}>{getRuleName(g.ruleId)}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{g.totalEvents.toLocaleString()}</td>
                    <td style={{ ...tdStyle, color: g.breaches > 0 ? BREACH_RED : 'var(--text-muted)', fontWeight: g.breaches > 0 ? 700 : 400 }}>
                      {g.breaches > 0 ? `⚡ ${g.breaches}` : g.breaches}
                    </td>
                    <td style={{ ...tdStyle }}>
                      {/* Inline progress bar for breach rate */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                          <div style={{
                            height: '100%',
                            width: `${Math.min(100, br)}%`,
                            background: br > 50 ? `linear-gradient(90deg, ${BREACH_RED}, ${BREACH_AMBER})` : br > 20 ? '#f59e0b' : SAFE_GREEN,
                            borderRadius: 3,
                            transition: 'width 0.4s ease',
                          }} />
                        </div>
                        <span style={{ color: br > 50 ? BREACH_RED : br > 20 ? '#f59e0b' : SAFE_GREEN, fontWeight: 600, fontSize: '0.8rem', minWidth: 42, textAlign: 'right' }}>
                          {g.breachRate}%
                        </span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatTimeShort(g.lastWindow)}</td>
                  </tr>
                );
              })}
              {groupTableData.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem' }}>
                    No group data available yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}