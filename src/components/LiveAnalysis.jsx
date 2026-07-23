import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Activity, ArrowUpDown, TrendingUp, TrendingDown, Minus, Clock, AlertTriangle, Zap, Shield, BarChart2, Fingerprint, Layers, ArrowRight } from 'lucide-react';
import {
  ComposedChart, AreaChart, Area, BarChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Brush, Cell, Scatter
} from 'recharts';
import { getRuleColor } from '../constants';
import { formatISTTime } from '../utils/istUtils';
import { MockLiveTicker } from '../simulation/mockEngine';
import { Modal, Drawer, RuleLink } from './ui/Overlay';

// ─── Design System ────────────────────────────────────────────────────────────
// Reads from the shared token system (src/index.css) instead of a duplicate,
// local palette — Live Stream's charts/markers/tooltips stay in lockstep with
// the rest of the app's neutral scale + violet/teal/danger/warning/success set.

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'rgba(19,22,25,0.97)', // var(--surface-2), opaque for chart overlays
    border: '1px solid var(--border-2)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-1)',
    fontSize: 'var(--fs-sm)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    backdropFilter: 'blur(12px)',
  },
  labelStyle: { color: 'var(--violet-light)', fontWeight: 700, marginBottom: '0.4rem', fontSize: 'var(--fs-xs)' },
  itemStyle: { color: 'var(--text-2)' },
};

const AXIS_STROKE = 'var(--gray-7)';
const GRID_PROPS = { strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.05)', vertical: false };
const DASH_PATTERNS = ['', '5 5', '8 4', '3 6', '10 3', '4 4 2 4'];

// Semantic colors — sourced from the shared danger/warning/success + violet/teal tokens
const BREACH_RED   = 'var(--danger)';
const BREACH_AMBER = 'var(--warning)';
const SAFE_GREEN   = 'var(--success)';
const ACCENT_BLUE  = 'var(--violet)';
const ACCENT_CYAN  = 'var(--teal)';

const STATUS_COLORS = {
  connected:    SAFE_GREEN,
  reconnecting: 'var(--warning)',
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
  // parseAsIST returns a Date whose absolute instant is correct, but its
  // getUTC* accessors read the UTC wall clock, not IST — reading them
  // directly showed UTC time mislabeled as IST. Shift by IST_OFFSET_MS first
  // (same double-shift pattern as getISTHour/epochToISTWall) so getUTC*
  // recovers the true IST wall-clock digits.
  const d = parseAsIST(ts);
  if (!d) return ts ? String(ts) : '';
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}`;
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
  // Explicit field (old schema / ClickHouse rows)
  if (row.eventCount != null && row.eventCount !== undefined) return Number(row.eventCount) || 0;

  // New Flink schema: aggResult contains the alias→value map, e.g. {"count": 5, "txnAmount": 2500}
  // The first numeric value in aggResult is used as the canonical event count for visualization.
  // For multi-aggregation rules we sum all values as a rough proxy.
  const aggObj = row.aggResult && typeof row.aggResult === 'object' ? row.aggResult
    : row.aggregationResults && typeof row.aggregationResults === 'object' ? row.aggregationResults
    : null;
  if (aggObj) {
    // Try known count aliases first
    for (const alias of ['count', 'eventCount', 'event_count', 'txnCount', 'total']) {
      if (aggObj[alias] != null) return Number(aggObj[alias]) || 0;
    }
    // Fall back to sum of all numeric values
    let sum = 0;
    for (const val of Object.values(aggObj)) {
      const n = Number(val);
      if (!isNaN(n)) sum += n;
    }
    if (sum > 0) return sum;
  }

  // Legacy metricValues field
  const mv = parseMetricValues(row.metricValues);
  if (mv.eventCount != null) return Number(mv.eventCount) || 0;
  if (mv.event_count != null) return Number(mv.event_count) || 0;
  if (mv.count != null) return Number(mv.count) || 0;
  return 0;
}

// ─── Custom Tooltip for Event Volume chart ────────────────────────────────────
function EventVolumeTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const breached = payload.some(p => p.payload && isBreached(p.payload));
  return (
    <div style={{
      ...TOOLTIP_STYLE.contentStyle,
      minWidth: 180,
      borderColor: breached ? 'rgba(248,81,73,0.5)' : 'rgba(88,101,242,0.3)',
    }}>
      <div style={{ ...TOOLTIP_STYLE.labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
        {breached && <Zap size={12} color={BREACH_RED} fill={BREACH_RED} />}
        {formatTime(label)}
        {breached && <span style={{ color: BREACH_RED, fontSize: 'var(--fs-3xs)', fontWeight: 700, marginLeft: 4 }}>BREACH</span>}
      </div>
      {payload.map((p, i) => {
        if (p.dataKey === 'breachMarker') return null;
        let label = 'Events';
        if (p.dataKey.startsWith('evt_')) label = 'Events';
        else if (p.dataKey.startsWith('agg_')) label = 'Metric Value';
        return (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 2 }}>
            <span style={{ color: 'var(--text-3)' }}>{label}</span>
            <span style={{ color: p.stroke || p.fill || 'var(--text-1)', fontWeight: 700 }}>{p.value}</span>
          </div>
        );
      })}
      {breached && (
        <div style={{ marginTop: 6, padding: '4px 8px', background: 'var(--danger-subtle)', borderRadius: 'var(--radius-xs)', fontSize: 'var(--fs-xs)', color: BREACH_RED, textAlign: 'center', fontWeight: 700 }}>
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

// ─── Custom XAxis Tick for Event Volume ───────────────────────────────────────
const CustomXAxisTick = (props) => {
  const { x, y, payload, breachTs } = props;
  const isBreach = breachTs && breachTs.includes(payload.value);
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={16} textAnchor="middle" fill={isBreach ? BREACH_RED : 'var(--text-3)'} fontSize={11} fontWeight={isBreach ? 700 : 400}>
        {formatTime(payload.value)}
      </text>
    </g>
  );
};

// ─── Panel header — matches the header style used on Analytics / Historical ──
function LiveHeader() {
  return (
    <div className="glass-panel" style={{ paddingBottom: '1rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg, var(--violet), var(--teal))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Activity size={17} color="#fff" strokeWidth={2.2} />
        </div>
        <h2 style={{ color: 'var(--text-1)', margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700, letterSpacing: '-0.02em' }}>Live Stream</h2>
      </div>
      <p style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)', margin: 0 }}>
        Watch the selected rule evaluate authentication traffic as it happens — this updates automatically, no need to refresh.
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LiveAnalysis({ rules, selectedRuleId, allSelectedRuleId, simulationMode, onRuleClick }) {
  const [data, setData] = useState({});
  const [sortCol, setSortCol] = useState('breaches');
  const [sortDir, setSortDir] = useState('desc');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [hiddenSeries, setHiddenSeries] = useState({});
  const [selectedGroup, setSelectedGroup] = useState('__ALL__');

  // ── Click-to-detail overlay state ────────────────────────────────────────
  // A single overlay slot shared by every clickable surface on this panel —
  // clicking a new target simply replaces it, so drilling from a window into
  // one of its entities (or vice versa) never stacks dialogs.
  const [overlay, setOverlay] = useState(null); // { type: 'entity'|'window'|'breachList', ...payload } | null
  const openEntityDetail = useCallback((groupKey) => setOverlay({ type: 'entity', groupKey }), []);
  const openWindowDetail = useCallback((windowStart) => setOverlay({ type: 'window', windowStart }), []);
  const openBreachList   = useCallback(() => setOverlay({ type: 'breachList' }), []);
  const closeOverlay     = useCallback(() => setOverlay(null), []);
  const handleRuleClick  = useCallback((ruleId) => { closeOverlay(); onRuleClick && onRuleClick(ruleId); }, [onRuleClick, closeOverlay]);

  // A rule change should reset any group filter (and any open overlay) left over from the previous rule.
  useEffect(() => { setSelectedGroup('__ALL__'); setOverlay(null); }, [selectedRuleId]);

  const handleLegendClick = useCallback((e) => {
    const key = e.dataKey;
    if (key) setHiddenSeries(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const tableRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const fallbackIntervalRef = useRef(null);
  const usingFallbackRef = useRef(false);
  const mockTickerRef = useRef(null);

  // ─── Live throughput tracking ───────────────────────────────────────────
  // Counts every delta pushed from the server (partial + final ticks both
  // count — this measures update throughput, not distinct windows). Batched
  // into a ref and flushed on a timer instead of setState-per-delta so a
  // bursty rule doesn't trigger a re-render on every single message.
  const deltaCountRef = useRef(0);
  const [throughputHistory, setThroughputHistory] = useState([]);
  const THROUGHPUT_BUCKET_SEC = 2;

  useEffect(() => {
    const interval = setInterval(() => {
      const count = deltaCountRef.current;
      deltaCountRef.current = 0;
      const rate = count / THROUGHPUT_BUCKET_SEC;
      setThroughputHistory(prev => [...prev, { t: Date.now(), rate }].slice(-30));
    }, THROUGHPUT_BUCKET_SEC * 1000);
    return () => clearInterval(interval);
  }, []);

  const currentThroughput = throughputHistory.length > 0
    ? throughputHistory[throughputHistory.length - 1].rate
    : 0;

  const selectedRules = useMemo(
    () => rules.filter(r => r.rule_metadata.rule_id === selectedRuleId),
    [rules, selectedRuleId]
  );
  const currentRule = selectedRules[0] || null;

  const handleDelta = useCallback((ruleId, row) => {
    deltaCountRef.current += 1;
    const normRow = normalizeRow(row);
    setData(prev => {
      const next = { ...prev };
      const existing = next[ruleId] || [];
      // Upsert by (groupKey, windowStart): a Flink early-fire (partial) row and
      // the eventual final row for the same window share that key, so the
      // later tick replaces the row in place instead of piling up a duplicate
      // entry per partial tick — mirrors LiveStore.Add on the backend.
      const idx = existing.findIndex(
        r => r.groupKey === normRow.groupKey && r.windowStart === normRow.windowStart
      );
      if (idx >= 0) {
        const updated = [...existing];
        updated[idx] = normRow;
        next[ruleId] = updated;
      } else {
        next[ruleId] = [...existing, normRow];
      }
      const cutoffEpoch = Date.now() - 24 * 60 * 60 * 1000;
      const istWall = new Date(cutoffEpoch + IST_OFFSET_MS);
      const pad = (n) => String(n).padStart(2, '0');
      const cutoff = `${istWall.getUTCFullYear()}-${pad(istWall.getUTCMonth()+1)}-${pad(istWall.getUTCDate())} ${pad(istWall.getUTCHours())}:${pad(istWall.getUTCMinutes())}:${pad(istWall.getUTCSeconds())}`;
      next[ruleId] = next[ruleId].filter(r => (r.windowStart || '') >= cutoff);
      return next;
    });
  }, []);

  const fetchDataHttp = useCallback(async () => {
    if (!selectedRuleId) return;
    try {
      const res = await fetch(`/api/rules/live-analysis?rule_ids=${selectedRuleId}&hours=24`);
      if (res.ok) {
        const json = await res.json();
        setData(json.results || {});
      }
    } catch (e) {
      console.error('Live fetch error:', e);
    }
  }, [selectedRuleId]);

  const closeWebSocket = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
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
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!selectedRuleId) return;

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
        ws.send(JSON.stringify({ type: 'subscribe', rule_ids: [selectedRuleId] }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'bootstrap') {
            setData(msg.data || {});
          } else if (msg.type === 'delta') {
            handleDelta(msg.rule_id, msg.row);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        reconnectAttemptRef.current += 1;

        if (reconnectAttemptRef.current >= 3) {
          startFallbackPolling();
          return;
        }

        setConnectionStatus('reconnecting');
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
        reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      reconnectAttemptRef.current += 1;
      if (reconnectAttemptRef.current >= 3) {
        startFallbackPolling();
      } else {
        setConnectionStatus('reconnecting');
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
        reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
      }
    }
  }, [selectedRuleId, closeWebSocket, stopFallbackPolling, startFallbackPolling, handleDelta]);

  // ── Simulation mode: MockLiveTicker replaces the WebSocket ──────────────────
  // Runs entirely in-browser: bootstraps the last 10 completed windows, then
  // emits early-fire partials + a settled final tick every IST minute,
  // exercising the exact same handleDelta upsert-by-key path the real
  // WebSocket delta would.
  useEffect(() => {
    if (!simulationMode) return;
    if (mockTickerRef.current) { mockTickerRef.current.stop(); mockTickerRef.current = null; }
    if (!selectedRuleId) { setData({}); setConnectionStatus('disconnected'); return; }

    setConnectionStatus('connected');
    const ticker = new MockLiveTicker(
      (ruleId, rows) => setData(prev => ({ ...prev, [ruleId]: rows.map(r => normalizeRow(r)) })),
      (ruleId, row) => handleDelta(ruleId, row),
    );
    ticker.start();
    mockTickerRef.current = ticker;
    return () => { ticker.stop(); mockTickerRef.current = null; };
  }, [simulationMode, selectedRuleId, handleDelta]);

  // ── Real WebSocket / HTTP fallback (only when NOT in simulation mode) ───────
  useEffect(() => {
    if (simulationMode) return;
    if (!selectedRuleId) {
      setData({});
      closeWebSocket();
      stopFallbackPolling();
      setConnectionStatus('disconnected');
      return;
    }

    if (usingFallbackRef.current) {
      stopFallbackPolling();
      startFallbackPolling();
    } else if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', rule_ids: [selectedRuleId] }));
    } else {
      reconnectAttemptRef.current = 0;
      connectWebSocket();
    }

    return () => {
      closeWebSocket();
      stopFallbackPolling();
    };
  }, [simulationMode, selectedRuleId, connectWebSocket, closeWebSocket, stopFallbackPolling, startFallbackPolling]);

  const getRuleName = useCallback((ruleId) => {
    const match = rules.find(rule => rule.rule_metadata.rule_id === ruleId);
    return match ? match.rule_metadata.rule_name : ruleId;
  }, [rules]);

  // ─── Data derivations ──────────────────────────────────────────────────────

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
  // up in the data so far (new ones appear automatically as they arrive).
  // Selecting a group narrows the charts below to just that group; the "Top
  // Groups" table further down intentionally stays unfiltered so it can still
  // be used to compare across groups.
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

  const totalWindows = chartRows.length;
  const breachCount = useMemo(() => chartRows.filter(r => isBreached(r)).length, [chartRows]);
  const breachRate = totalWindows > 0 ? ((breachCount / totalWindows) * 100).toFixed(1) : '0.0';
  const uniqueGroups = useMemo(() => new Set(chartRows.map(r => r.groupKey)).size, [chartRows]);

  const lastBreachInfo = useMemo(() => {
    const breachRows = chartRows.filter(r => isBreached(r));
    if (breachRows.length === 0) return { text: 'None', color: 'var(--text-3)' };
    let latest = null;
    for (const row of breachRows) {
      const d = parseAsIST(row.evaluatedAt || row.windowEnd || row.windowStart);
      if (d && (!latest || d.getTime() > latest.getTime())) latest = d;
    }
    if (!latest) return { text: 'None', color: 'var(--text-3)' };
    const diffMin = (Date.now() - latest.getTime()) / 60000;
    return {
      text: timeAgo(latest.toISOString()),
      color: diffMin > 10 ? SAFE_GREEN : diffMin >= 2 ? 'var(--warning)' : BREACH_RED,
    };
  }, [chartRows]);

  const breachTrend = useMemo(() => {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const twoHoursAgo = now - 7200000;
    let lastHour = 0, prevHour = 0;
    for (const row of chartRows.filter(r => isBreached(r))) {
      // Use parseAsIST — naive new Date() on space-separated IST strings is browser-dependent
      const d = parseAsIST(row.windowStart || row.evaluatedAt);
      if (!d) continue;
      const ts = d.getTime();
      if (ts >= oneHourAgo && ts <= now) lastHour++;
      else if (ts >= twoHoursAgo && ts < oneHourAgo) prevHour++;
    }
    if (lastHour === 0 && prevHour === 0) return { text: '— Stable', color: 'var(--text-3)', Icon: Minus };
    if (lastHour > prevHour) return { text: 'Rising', color: BREACH_RED, Icon: TrendingUp };
    if (lastHour < prevHour) return { text: 'Declining', color: SAFE_GREEN, Icon: TrendingDown };
    return { text: 'Stable', color: 'var(--warning)', Icon: Minus };
  }, [chartRows]);

  // Chart 1: Event Volume — bakes in agg metric values AND breach markers
  const { comboData, breachTs } = useMemo(() => {
    const timeMap = {};
    for (const row of chartRows) {
      const ts = row.windowStart;
      if (!ts) continue;
      if (!timeMap[ts]) timeMap[ts] = { windowStart: ts, _tsMs: new Date(ts).getTime(), _breached: false };

      const evtKey = `evt_${row.ruleId}`;
      timeMap[ts][evtKey] = (timeMap[ts][evtKey] || 0) + getEventCount(row);

      if (isBreached(row)) {
        timeMap[ts]._breached = true;
        timeMap[ts].thresholdBreached = true;
        timeMap[ts].thresholdMet = true;
        timeMap[ts].breachMarker = getEventCount(row);
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
      // Also read from legacy metricValues field
      const mv = parseMetricValues(row.metricValues);
      for (const [alias, val] of Object.entries(mv)) {
        const numVal = Number(val);
        if (!isNaN(numVal)) timeMap[ts][`agg_${row.ruleId}__${alias}`] = numVal;
      }
    }
    const sorted = Object.values(timeMap).sort((a, b) => a._tsMs - b._tsMs);
    const breachTimestamps = sorted.filter(pt => pt._breached).map(pt => pt.windowStart);
    return { comboData: sorted, breachTs: breachTimestamps };
  }, [chartRows]);

  // Derive agg line descriptors from the selected rule's raw data (for legend
  // labels in the consolidated chart) — these are metric names, not chart
  // values, so they're intentionally not narrowed by the group filter.
  const aggLineDescriptors = useMemo(() => {
    const lines = [];
    if (!selectedRuleId) return lines;
    const ruleId = selectedRuleId;
    const rows = data[ruleId] || [];
    if (!rows.length) return lines;
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
    return lines;
  }, [data, selectedRuleId, getRuleName]);

  // Chart 2: Cumulative Breaches — area gradient with incremental dot markers
  const cumulativeData = useMemo(() => {
    const perRule = {};
    for (const ruleId of (selectedRuleId ? [selectedRuleId] : [])) {
      const ruleRows = chartRows.filter(r => r.ruleId === ruleId);
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
  }, [chartRows, selectedRuleId]);

  // Chart 3: Event count bars colored by breach status
  const breachBarData = useMemo(() => {
    const timeMap = {};
    for (const row of chartRows) {
      const ts = row.windowStart;
      if (!ts) continue;
      if (!timeMap[ts]) timeMap[ts] = { windowStart: ts, count: 0, breached: false };
      timeMap[ts].count += getEventCount(row);
      if (isBreached(row)) timeMap[ts].breached = true;
    }
    return Object.values(timeMap).sort((a, b) => new Date(a.windowStart) - new Date(b.windowStart));
  }, [chartRows]);

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
      if (d.getTime() === latestTs.getTime() && isBreached(row)) {
        set.add(`${row.groupKey}||${row.ruleId}`);
      }
    }
    return set;
  }, [allRows]);

  const groupTableData = useMemo(() => {
    const groupMap = {};
    for (const row of allRows) {
      const gk = row.groupKey || 'N/A';
      const key = `${gk}||${row.ruleId}`;
      if (!groupMap[key]) {
        groupMap[key] = {
          groupKey: gk,
          entityName: row.entityName || '',
          ruleId: row.ruleId,
          totalEvents: 0,
          breaches: 0,
          windows: 0,
          lastWindow: row.windowEnd || row.windowStart,
          liveNow: row.isFinal === false,
        };
      }
      groupMap[key].totalEvents += getEventCount(row);
      groupMap[key].windows += 1;
      if (isBreached(row)) groupMap[key].breaches += 1;
      const rowEnd = row.windowEnd || row.windowStart;
      if (rowEnd >= groupMap[key].lastWindow) {
        groupMap[key].lastWindow = rowEnd;
        // Only the row currently holding the latest window can still be partial —
        // every earlier window has already closed on the Flink side.
        groupMap[key].liveNow = row.isFinal === false;
      }
    }
    const arr = Object.values(groupMap).map(g => ({
      ...g,
      breachRate: g.windows > 0 ? ((g.breaches / g.windows) * 100).toFixed(1) : '0.0',
    }));

    arr.sort((a, b) => {
      const aVal = a[sortCol];
      const bVal = b[sortCol];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        const result = sortDir === 'desc' ? bVal - aVal : aVal - bVal;
        if (result !== 0) return result;
        if (sortCol !== 'breaches') return b.breaches - a.breaches;
        return b.totalEvents - a.totalEvents;
      }
      const result = sortDir === 'desc'
        ? String(bVal).localeCompare(String(aVal))
        : String(aVal).localeCompare(String(bVal));
      if (result !== 0) return result;
      return b.breaches - a.breaches;
    });
    return arr.slice(0, 20);
  }, [allRows, sortCol, sortDir]);

  // ─── Entity Detail drawer data — every window this entity has produced,
  // regardless of the group filter above (the drawer is the "show me
  // everything about this one entity" escape hatch from that filter). ───────
  const entityDetail = useMemo(() => {
    if (!overlay || overlay.type !== 'entity') return null;
    const raw = allRows.filter(r => r.groupKey === overlay.groupKey);
    const sortedDesc = [...raw].sort((a, b) => new Date(b.windowStart) - new Date(a.windowStart));
    const totalEvents = raw.reduce((s, r) => s + getEventCount(r), 0);
    const breaches = raw.filter(isBreached).length;
    const windows = raw.length;
    const breachRate = windows > 0 ? ((breaches / windows) * 100).toFixed(1) : '0.0';
    return {
      groupKey: overlay.groupKey,
      entityName: sortedDesc[0]?.entityName || '',
      severity: sortedDesc[0]?._entitySeverity || null,
      totalEvents, breaches, windows, breachRate,
      timeline: [...sortedDesc].reverse().map(r => ({ windowStart: r.windowStart, count: getEventCount(r), breached: isBreached(r) })),
      history: sortedDesc.slice(0, 15),
    };
  }, [overlay, allRows]);

  // ─── Window Detail modal data — every entity's row for one specific
  // window, independent of the group filter, so a click always shows the
  // full picture of what happened in that window. ───────────────────────────
  const windowDetail = useMemo(() => {
    if (!overlay || overlay.type !== 'window') return null;
    const rows = allRows
      .filter(r => r.windowStart === overlay.windowStart)
      .sort((a, b) => getEventCount(b) - getEventCount(a));
    const totalCount = rows.reduce((s, r) => s + getEventCount(r), 0);
    const breachedCount = rows.filter(isBreached).length;
    return { windowStart: overlay.windowStart, windowEnd: rows[0]?.windowEnd, rows, totalCount, breachedCount };
  }, [overlay, allRows]);

  // ─── Breach List modal data — respects the group filter, so the count
  // shown here always matches the "Breaches" KPI tile that opened it. ───────
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

  const statusColor = STATUS_COLORS[connectionStatus] || STATUS_COLORS.disconnected;
  const statusLabel = usingFallbackRef.current ? 'Polling (fallback)' : connectionStatus;

  // ─── Empty State ───────────────────────────────────────────────────────────

  if (!selectedRuleId) {
    // Check if a DRAFT rule was selected (allSelectedRuleId is set but selectedRuleId
    // isn't, since DRAFT rules are filtered out by the parent before reaching here)
    const hasDraftOnly = !!allSelectedRuleId && !selectedRuleId;
    return (
      <>
        <LiveHeader />
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '500px', gap: '1.5rem' }}>
          <Activity size={64} color="var(--text-muted)" style={{ opacity: 0.4 }} />
          {hasDraftOnly ? (
            <>
              <p style={{ color: 'var(--warning)', fontSize: '1rem', textAlign: 'center', maxWidth: 440, fontWeight: 600 }}>The selected rule is still in Draft</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', maxWidth: 440 }}>Draft rules aren&apos;t live yet, so there&apos;s no real-time traffic to show. Publish the rule to make it Active, or use Historical Replay to test it against past data first.</p>
            </>
          ) : (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', textAlign: 'center', maxWidth: 400 }}>Select a rule from the sidebar to see it running live</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', opacity: 0.7, textAlign: 'center' }}>Updates arrive automatically · showing the last 24 hours</p>
            </>
          )}
        </div>
      </>
    );
  }

  // ─── Idle State: rule(s) selected, connected, but no events yet ────────────
  // Distinct from "no rule selected" above — the connection is live, we're
  // just genuinely waiting for the first event. A shimmering skeleton in the
  // exact shape of the real dashboard keeps this feeling active/premium
  // instead of looking broken, and avoids a layout jump when data arrives.
  if (totalWindows === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <LiveHeader />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
            background: statusColor, boxShadow: `0 0 6px ${statusColor}`,
            animation: connectionStatus === 'connected' ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: '0.75rem', color: statusColor, textTransform: 'capitalize', fontWeight: 600 }}>{statusLabel}</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: 4 }}>· waiting for the first live event…</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="metric-card" style={{ flex: 1, minWidth: 130 }}>
              <div className="skeleton" style={{ height: 11, width: '55%', marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 22, width: '40%' }} />
            </div>
          ))}
        </div>
        <div className="chart-container" style={{ height: 'auto' }}>
          <div className="skeleton" style={{ height: 14, width: 240, marginBottom: '1.25rem' }} />
          <div className="skeleton" style={{ width: '100%', height: 380 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1rem' }}>
          <div className="chart-container">
            <div className="skeleton" style={{ height: 14, width: 160, marginBottom: '1.25rem' }} />
            <div className="skeleton" style={{ width: '100%', height: 240 }} />
          </div>
          <div className="chart-container">
            <div className="skeleton" style={{ height: 14, width: 160, marginBottom: '1.25rem' }} />
            <div className="skeleton" style={{ width: '100%', height: 240 }} />
          </div>
        </div>
      </div>
    );
  }

  const thStyle = {
    textAlign: 'left', padding: '0.6rem 0.8rem', color: 'var(--text-muted)', fontWeight: 600,
    fontSize: 'var(--fs-2xs)', textTransform: 'uppercase', letterSpacing: '0.08em',
    cursor: 'pointer', userSelect: 'none', borderBottom: '1px solid var(--glass-border)',
    whiteSpace: 'nowrap',
  };
  const tdStyle = { padding: '0.55rem 0.8rem', fontSize: 'var(--fs-sm)', borderBottom: '1px solid rgba(255,255,255,0.04)', verticalAlign: 'middle' };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <LiveHeader />

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

      {/* ── Group-by filter — only shown for rules that group by a non-global key ── */}
      {showGroupFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Select Entity</label>
          <select
            value={selectedGroup}
            onChange={e => setSelectedGroup(e.target.value)}
            style={{ maxWidth: 260 }}
            title="Filter the charts below to a single entity. Tables further down always show every entity."
          >
            <option value="__ALL__">All Entities (Overview)</option>
            {availableGroups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {/* Total Windows */}
        <div className="metric-card" style={{ flex: 1, minWidth: 130 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><BarChart2 size={13} style={{ opacity: 0.7 }} /> Checks Performed</h3>
          <div className="value">{totalWindows.toLocaleString()}</div>
        </div>

        {/* Breach Count — clickable when there's something to break down */}
        <div
          className={`metric-card ${breachCount > 0 ? 'breach-glow' : ''}`}
          style={{ flex: 1, minWidth: 130, cursor: breachCount > 0 ? 'pointer' : 'default' }}
          onClick={breachCount > 0 ? openBreachList : undefined}
          title={breachCount > 0 ? 'View every breach in this range' : undefined}
        >
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={13} style={{ opacity: 0.7 }} /> Breaches</h3>
          <div className="value" style={breachCount > 0 ? { background: `linear-gradient(135deg, ${BREACH_RED}, ${BREACH_AMBER})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } : undefined}>
            {breachCount.toLocaleString()}
          </div>
        </div>

        {/* Breach Rate */}
        <div className="metric-card" style={{ flex: 1, minWidth: 130 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Shield size={13} style={{ opacity: 0.7 }} /> Breach Rate</h3>
          <div className="value" style={{
            color: parseFloat(breachRate) > 50 ? BREACH_RED : parseFloat(breachRate) > 25 ? 'var(--warning)' : SAFE_GREEN,
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

        {/* Live Throughput — updates/sec with an inline sparkline, fed by every
            delta pushed from the server (partial + final ticks both count). */}
        <div className="metric-card" style={{ flex: 1, minWidth: 150 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={13} style={{ opacity: 0.7 }} /> Updates Per Second</h3>
          <div className="value" style={{ fontSize: '1.1rem' }}>{currentThroughput.toFixed(1)} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>updates/sec</span></div>
          <div style={{ width: '100%', height: 28, marginTop: 2 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={throughputHistory} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <Area type="monotone" dataKey="rate" stroke={ACCENT_CYAN} strokeWidth={1.5} fill={ACCENT_CYAN} fillOpacity={0.15} isAnimationActive={false} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          Chart 1: Event Volume — area + agg metric lines + precise breach markers
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="chart-container" style={{ marginBottom: '-15px', height: 'auto' }}>
        <div className="chart-title" style={{ marginBottom: '1.25rem' }}>
          Event Volume, Aggregation Metrics, and Breaches
        </div>
        {/* Fixed height gives the Brush room without overlapping siblings */}
        <div style={{ width: '100%', height: 420 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={comboData} margin={{ top: 10, right: 24, bottom: 45, left: 12 }}>
              <ChartGradientDefs />
              <CartesianGrid {...GRID_PROPS} />

              <XAxis
                dataKey="windowStart"
                stroke={AXIS_STROKE}
                tick={<CustomXAxisTick breachTs={breachTs} />}
                minTickGap={40}
                dy={8}
              />
              <YAxis
                stroke={AXIS_STROKE}
                tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                allowDecimals={false}
                width={44}
                label={{ value: 'Events / Window', angle: -90, position: 'insideLeft', offset: 12, style: { fill: 'var(--text-3)', fontSize: 10 } }}
              />

              <Tooltip content={<EventVolumeTooltip getRuleName={getRuleName} />} />

              <Legend
                verticalAlign="top"
                wrapperStyle={{ paddingBottom: '0.75rem', fontSize: 'var(--fs-xs)', cursor: 'pointer' }}
                onClick={handleLegendClick}
                formatter={(value) => {
                  if (value.startsWith('evt_')) return 'Events';
                  if (value.startsWith('agg_')) return 'Metric Value';
                  if (value === 'breachMarker') return 'Breaches';
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

      {/* ═══════════════════════════════════════════════════════════════════════
          Chart row: Window Intensity + Cumulative Breaches
          -8px top margin enforces the 0.1 cm gap from the chart above.
          ═══════════════════════════════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1rem', marginTop: '-8px' }}>

        {/* Chart 2: Window Intensity — colored bar per window */}
        <div className="chart-container">
          <div className="chart-title" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
            Window Intensity
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)', fontWeight: 400, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: BREACH_RED, display: 'inline-block' }} /> breach
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: ACCENT_BLUE, display: 'inline-block' }} /> normal
              </span>
              <span>· click a bar for details</span>
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
                  tick={{ fontSize: 10, fill: 'var(--text-3)' }}
                  tickFormatter={formatTime}
                  minTickGap={40}
                  dy={6}
                />
                <YAxis stroke={AXIS_STROKE} tick={{ fontSize: 10, fill: 'var(--text-3)' }} width={36} allowDecimals={false} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  labelFormatter={formatTime}
                  formatter={(value, name, props) => {
                    const breached = props.payload?.breached;
                    return [value, breached ? 'Events (BREACH)' : 'Events'];
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
                  tick={{ fontSize: 10, fill: 'var(--text-3)' }}
                  tickFormatter={formatTime}
                  minTickGap={40}
                  dy={6}
                />
                <YAxis stroke={AXIS_STROKE} tick={{ fontSize: 10, fill: 'var(--text-3)' }} width={36} allowDecimals={false} />
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
                            <circle cx={cx} cy={cy} r={10} fill="rgba(248,81,73,0.15)" />
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

      {/* ═══════════════════════════════════════════════════════════════════════
          Table: Top Groups by Breach Activity
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="chart-container" style={{ height: 'auto' }}>
        <div className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
          <AlertTriangle size={15} style={{ opacity: 0.7 }} />
          Top Groups by Breach Activity
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>· click a row for the entity&apos;s full history</span>
        </div>
        <div ref={tableRef} style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'rgba(19,22,25,0.95)', zIndex: 1 }}>
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
                    onClick={() => openEntityDetail(g.groupKey)}
                    style={isCurrentlyBreaching
                      ? { borderLeft: `3px solid ${BREACH_RED}`, background: 'rgba(248,81,73,0.07)', cursor: 'pointer' }
                      : { borderLeft: `3px solid ${color}`, cursor: 'pointer' }
                    }
                  >
                    <td style={{ ...tdStyle, color: 'var(--text-muted)', width: 32 }}>{i + 1}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--violet-light)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        {(isCurrentlyBreaching || g.liveNow) && (
                          <span
                            title={isCurrentlyBreaching ? 'Currently breaching' : 'Live — window still updating'}
                            style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: isCurrentlyBreaching ? BREACH_RED : ACCENT_CYAN,
                              boxShadow: `0 0 6px ${isCurrentlyBreaching ? BREACH_RED : ACCENT_CYAN}`,
                              animation: 'pulse-dot 1.5s ease-in-out infinite', flexShrink: 0,
                            }}
                          />
                        )}
                        <span>
                          {g.entityName && g.entityName !== 'group' && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'block' }}>{g.entityName}</span>}
                          {g.groupKey}
                        </span>
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-2)' }}>
                      <RuleLink ruleName={getRuleName(g.ruleId)} ruleId={g.ruleId} onRuleClick={handleRuleClick} />
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{g.totalEvents.toLocaleString()}</td>
                    <td style={{ ...tdStyle, color: g.breaches > 0 ? BREACH_RED : 'var(--text-muted)', fontWeight: g.breaches > 0 ? 700 : 400 }}>
                      {g.breaches > 0
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Zap size={11} color={BREACH_RED} fill={BREACH_RED} />{g.breaches}</span>
                        : g.breaches}
                    </td>
                    <td style={{ ...tdStyle }}>
                      {/* Inline progress bar for breach rate */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                          <div style={{
                            height: '100%',
                            width: `${Math.min(100, br)}%`,
                            background: br > 50 ? `linear-gradient(90deg, ${BREACH_RED}, ${BREACH_AMBER})` : br > 20 ? 'var(--warning)' : SAFE_GREEN,
                            borderRadius: 3,
                            transition: 'width 0.4s ease',
                          }} />
                        </div>
                        <span style={{ color: br > 50 ? BREACH_RED : br > 20 ? 'var(--warning)' : SAFE_GREEN, fontWeight: 600, fontSize: '0.8rem', minWidth: 42, textAlign: 'right' }}>
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

      {/* ═══════════════════════════════════════════════════════════════════════
          Click-to-detail overlays — Entity Detail drawer, Window Detail modal,
          Breach List modal. One shared `overlay` slot (see state above) drives
          all three, so drilling entity→window or window→entity just swaps
          which one is showing instead of stacking dialogs.
          ═══════════════════════════════════════════════════════════════════════ */}

      <Drawer
        open={overlay?.type === 'entity'}
        onClose={closeOverlay}
        icon={Fingerprint}
        title={entityDetail?.groupKey || ''}
        subtitle={entityDetail?.entityName ? `${entityDetail.entityName} · Live Stream` : 'Live Stream · Entity Snapshot'}
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
            {entityDetail.severity && (
              <span className={`badge ${
                entityDetail.severity === 'CRITICAL' || entityDetail.severity === 'HIGH' ? 'badge-danger'
                  : entityDetail.severity === 'MEDIUM' ? 'badge-warning' : 'badge-teal'
              }`} style={{ alignSelf: 'flex-start' }}>
                {entityDetail.severity} severity
              </span>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="metric-card">
                <h3>Total Events</h3>
                <div className="value">{entityDetail.totalEvents.toLocaleString()}</div>
              </div>
              <div className="metric-card">
                <h3>Windows Tracked</h3>
                <div className="value">{entityDetail.windows.toLocaleString()}</div>
              </div>
              <div className={`metric-card ${entityDetail.breaches > 0 ? 'breach-glow' : ''}`}>
                <h3>Breaches</h3>
                <div className="value" style={{ color: entityDetail.breaches > 0 ? BREACH_RED : undefined }}>{entityDetail.breaches.toLocaleString()}</div>
              </div>
              <div className="metric-card">
                <h3>Breach Rate</h3>
                <div className="value" style={{ color: parseFloat(entityDetail.breachRate) > 50 ? BREACH_RED : parseFloat(entityDetail.breachRate) > 25 ? 'var(--warning)' : SAFE_GREEN }}>
                  {entityDetail.breachRate}%
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                Activity Timeline
              </div>
              <div style={{ width: '100%', height: 130 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={entityDetail.timeline} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                    <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={14}>
                      {entityDetail.timeline.map((e, i) => (
                        <Cell key={i} fill={e.breached ? BREACH_RED : ACCENT_BLUE} opacity={e.breached ? 1 : 0.55} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                Recent Windows <span style={{ textTransform: 'none', fontWeight: 400 }}>· click one for details</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {entityDetail.history.map((r, i) => (
                  <div
                    key={i}
                    onClick={() => openWindowDetail(r.windowStart)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.6rem',
                      background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: '0.78rem', cursor: 'pointer',
                      borderLeft: `3px solid ${isBreached(r) ? BREACH_RED : 'transparent'}`,
                    }}
                  >
                    <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>{formatTimeShort(r.windowStart)}</span>
                    <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{getEventCount(r)} events</span>
                    {isBreached(r) && <Zap size={11} color={BREACH_RED} />}
                    {r.isFinal === false && <span style={{ fontSize: '0.63rem', color: ACCENT_CYAN, fontWeight: 600 }}>LIVE</span>}
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
        title={windowDetail ? `${formatTimeShort(windowDetail.windowStart)} – ${formatTimeShort(windowDetail.windowEnd)} IST` : ''}
        subtitle={windowDetail ? `${windowDetail.rows.length} entit${windowDetail.rows.length !== 1 ? 'ies' : 'y'} active in this window` : ''}
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
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Per-Entity Breakdown <span style={{ textTransform: 'none', fontWeight: 400 }}>· click one for its full history</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {windowDetail.rows.map((r, i) => {
                const breached = isBreached(r);
                const count = getEventCount(r);
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
                    <span style={{ fontFamily: 'monospace', color: 'var(--violet-light)', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.groupKey}</span>
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
        subtitle={showGroupFilter && selectedGroup !== '__ALL__' ? `Filtered to ${selectedGroup}` : 'All entities · current view'}
        width={580}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {breachListRows.length === 0 && (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem' }}>No breaches yet.</p>
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
              <span style={{ color: 'var(--text-3)', fontSize: '0.75rem', flexShrink: 0, minWidth: 56 }}>{formatTimeShort(r.windowStart)}</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--violet-light)', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.groupKey}</span>
              <span style={{ fontWeight: 700 }}>{getEventCount(r)} events</span>
              <Zap size={13} color={BREACH_RED} />
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}