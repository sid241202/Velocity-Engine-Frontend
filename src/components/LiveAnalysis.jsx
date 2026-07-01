import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Activity, ArrowUpDown, TrendingUp, TrendingDown, Minus, Clock, AlertTriangle } from 'lucide-react';
import {
  ComposedChart, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Brush, ReferenceLine
} from 'recharts';
import { getRuleColor } from '../constants';
import { formatISTTime, formatISTDateTime } from '../utils/istUtils';

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'rgba(15,23,42,0.95)',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '0.8rem',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)',
  },
  labelStyle: { color: '#94a3b8', fontWeight: 600, marginBottom: '0.3rem' },
};

// UI FIX 1: Removed vertical grid lines to stop clutter
const AXIS_STROKE = '#64748b';
const GRID_PROPS = { strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.1)', vertical: false };
const DASH_PATTERNS = ['', '5 5', '8 4', '3 6', '10 3', '4 4 2 4'];

const STATUS_COLORS = {
  connected: '#10b981',
  reconnecting: '#f59e0b',
  disconnected: '#ef4444',
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function parseAsIST(ts) {
  if (!ts) return null;
  const raw = String(ts).replace(' ', 'T');
  const d = new Date(raw.includes('+') || raw.endsWith('Z') ? raw : raw + '+05:30');
  return isNaN(d.getTime()) ? null : d;
}

function formatTime(ts) {
  return formatISTTime(ts);
}

function formatTimeShort(ts) {
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
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function parseMetricValues(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
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


export default function LiveAnalysis({ rules, selectedRuleIds, allSelectedRuleIds }) {
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
    } catch (e) {
      console.error('Live fetch error:', e);
    }
  }, [selectedRuleIds]);

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
  }, [selectedRuleIds, closeWebSocket, stopFallbackPolling, startFallbackPolling, handleDelta]);

  useEffect(() => {
    if (selectedRuleIds.size === 0) {
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
      wsRef.current.send(JSON.stringify({ type: 'subscribe', rule_ids: [...selectedRuleIds] }));
    } else {
      reconnectAttemptRef.current = 0;
      connectWebSocket();
    }

    return () => {
      closeWebSocket();
      stopFallbackPolling();
    };
  }, [selectedRuleIds, connectWebSocket, closeWebSocket, stopFallbackPolling, startFallbackPolling]);

  const getRuleName = useCallback((ruleId) => {
    const match = rules.find(rule => rule.rule_metadata.rule_id === ruleId);
    return match ? match.rule_metadata.rule_name : ruleId;
  }, [rules]);

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
  const uniqueGroups = useMemo(() => {
    const keys = new Set(allRows.map(r => r.groupKey));
    return keys.size;
  }, [allRows]);

  const lastBreachInfo = useMemo(() => {
    const breachRows = allRows.filter(r => isBreached(r));
    if (breachRows.length === 0) return { text: 'None', color: '#94a3b8' };
    let latest = null;
    for (const row of breachRows) {
      const ts = row.evaluatedAt || row.windowEnd || row.windowStart;
      if (!ts) continue;
      const d = new Date(ts);
      if (isNaN(d.getTime())) continue;
      if (!latest || d.getTime() > latest.getTime()) latest = d;
    }
    if (!latest) return { text: 'None', color: '#94a3b8' };
    const diffMs = Date.now() - latest.getTime();
    const diffMin = diffMs / 60000;
    let color = '#ef4444';
    if (diffMin > 10) color = '#10b981';
    else if (diffMin >= 2) color = '#f59e0b';
    return { text: timeAgo(latest), color };
  }, [allRows]);

  const breachTrend = useMemo(() => {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const twoHoursAgo = now - 7200000;
    const breachRows = allRows.filter(r => isBreached(r));
    let lastHour = 0;
    let prevHour = 0;
    for (const row of breachRows) {
      const ts = new Date(row.windowStart || row.evaluatedAt).getTime();
      if (isNaN(ts)) continue;
      if (ts >= oneHourAgo && ts <= now) lastHour++;
      else if (ts >= twoHoursAgo && ts < oneHourAgo) prevHour++;
    }
    if (lastHour === 0 && prevHour === 0) return { text: '—', color: '#94a3b8', Icon: Minus };
    if (lastHour > prevHour) return { text: '↑ RISING', color: '#ef4444', Icon: TrendingUp };
    if (lastHour < prevHour) return { text: '↓ DECLINING', color: '#10b981', Icon: TrendingDown };
    return { text: '→ STABLE', color: '#f59e0b', Icon: Minus };
  }, [allRows]);

  const { comboData, breachRefLines } = useMemo(() => {
    const timeMap = {};
    for (const row of allRows) {
      const ts = row.windowStart;
      if (!ts) continue;
      const key = ts;
      if (!timeMap[key]) timeMap[key] = { windowStart: ts, _tsMs: new Date(ts).getTime() };

      const evtKey = `evt_${row.ruleId}`;
      timeMap[key][evtKey] = (timeMap[key][evtKey] || 0) + getEventCount(row);

      const brKey = `br_${row.ruleId}`;
      if (isBreached(row)) {
        timeMap[key][brKey] = 1;
      } else if (timeMap[key][brKey] === undefined) {
        timeMap[key][brKey] = 0;
      }
    }
    const sorted = Object.values(timeMap).sort((a, b) => a._tsMs - b._tsMs);

    const refLines = [];
    for (const point of sorted) {
      for (const ruleId of [...selectedRuleIds]) {
        if (point[`br_${ruleId}`] === 1) {
          refLines.push(point.windowStart);
          break;
        }
      }
    }

    return { comboData: sorted, breachRefLines: [...new Set(refLines)] };
  }, [allRows, selectedRuleIds]);

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
      for (const entry of sorted) {
        cum += entry.breaches;
        entry.cumBreaches = cum;
      }
      perRule[ruleId] = sorted;
    }

    const allTimestamps = new Set();
    for (const arr of Object.values(perRule)) {
      for (const entry of arr) allTimestamps.add(entry.windowStart);
    }
    const sortedTs = [...allTimestamps].sort((a, b) => new Date(a) - new Date(b));

    const merged = [];
    const lastCum = {};
    for (const ts of sortedTs) {
      const point = { windowStart: ts };
      for (const ruleId of [...selectedRuleIds]) {
        const ruleEntry = (perRule[ruleId] || []).find(e => e.windowStart === ts);
        if (ruleEntry) {
          lastCum[ruleId] = ruleEntry.cumBreaches;
        }
        point[`cum_${ruleId}`] = lastCum[ruleId] || 0;
      }
      merged.push(point);
    }
    return merged;
  }, [allRows, selectedRuleIds]);

  const { aggData, aggLines } = useMemo(() => {
    const lines = [];
    const timeMap = {};

    for (const ruleId of [...selectedRuleIds]) {
      const rows = data[ruleId] || [];
      if (rows.length === 0) continue;

      const metricKeysSet = new Set();
      for (const row of rows) {
        // New Flink schema: aggResult is the primary metric container
        const aggObj = row.aggResult && typeof row.aggResult === 'object' ? row.aggResult
          : row.aggregationResults && typeof row.aggregationResults === 'object' ? row.aggregationResults
          : null;
        if (aggObj) {
          for (const k of Object.keys(aggObj)) metricKeysSet.add(k);
        }
        // Legacy schema: metricValues
        const mv = parseMetricValues(row.metricValues);
        for (const k of Object.keys(mv)) metricKeysSet.add(k);
      }

      const metricKeys = [...metricKeysSet];
      const rName = getRuleName(ruleId);
      const rColor = getRuleColor(rules, ruleId);

      metricKeys.forEach((alias, ai) => {
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

        // New Flink schema: read from aggResult / aggregationResults
        const aggObj = row.aggResult && typeof row.aggResult === 'object' ? row.aggResult
          : row.aggregationResults && typeof row.aggregationResults === 'object' ? row.aggregationResults
          : null;
        if (aggObj) {
          for (const [alias, val] of Object.entries(aggObj)) {
            const numVal = Number(val);
            if (!isNaN(numVal)) {
              timeMap[ts][`${ruleId}__${alias}`] = numVal;
            }
          }
        }

        // Legacy: metricValues
        const mv = parseMetricValues(row.metricValues);
        for (const [alias, val] of Object.entries(mv)) {
          const numVal = Number(val);
          if (!isNaN(numVal)) {
            timeMap[ts][`${ruleId}__${alias}`] = numVal;
          }
        }
      }
    }

    return {
      aggData: Object.values(timeMap).sort((a, b) => new Date(a.windowStart) - new Date(b.windowStart)),
      aggLines: lines,
    };
  }, [data, selectedRuleIds, getRuleName, rules]);

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
        };
      }
      groupMap[key].totalEvents += getEventCount(row);
      groupMap[key].windows += 1;
      if (isBreached(row)) groupMap[key].breaches += 1;
      const rowEnd = row.windowEnd || row.windowStart;
      if (rowEnd > groupMap[key].lastWindow) groupMap[key].lastWindow = rowEnd;
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

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  if (selectedRuleIds.size === 0) {
    // Check if DRAFT rules were selected (allSelectedRuleIds has entries but selectedRuleIds is empty)
    const hasDraftOnly = allSelectedRuleIds && allSelectedRuleIds.size > 0 && selectedRuleIds.size === 0;
    return (
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '500px', gap: '1.5rem' }}>
        <Activity size={64} color="var(--text-muted)" style={{ opacity: 0.4 }} />
        {hasDraftOnly ? (
          <>
            <p style={{ color: 'var(--amber)', fontSize: '1rem', textAlign: 'center', maxWidth: 440, fontWeight: 600 }}>
              Selected rules are in DRAFT status
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', maxWidth: 440 }}>
              DRAFT rules are not processed by Flink and cannot stream live data.
              Publish the rule to make it ACTIVE, or use Historical Analysis to test it against past data.
            </p>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', textAlign: 'center', maxWidth: 400 }}>
              Select one or more rules from the sidebar to see live analysis
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', opacity: 0.7, textAlign: 'center' }}>
              WebSocket streaming · 24-hour rolling window
            </p>
          </>
        )}
      </div>
    );
  }

  const thStyle = {
    textAlign: 'left', padding: '0.5rem 0.6rem', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.75rem',
    textTransform: 'uppercase', letterSpacing: '0.04em', cursor: 'pointer', userSelect: 'none',
    borderBottom: '1px solid var(--glass-border)',
  };
  const tdStyle = { padding: '0.45rem 0.6rem', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.04)' };

  const statusColor = STATUS_COLORS[connectionStatus] || STATUS_COLORS.disconnected;
  const statusLabel = usingFallbackRef.current ? 'Polling (fallback)' : connectionStatus;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span
          style={{
            display: 'inline-block',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 6px ${statusColor}`,
            animation: connectionStatus === 'connected' ? 'pulse-dot 1.5s ease-in-out infinite' : 'none',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: '0.75rem', color: statusColor, textTransform: 'capitalize' }}>
          {statusLabel}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div className="metric-card" style={{ flex: 1, minWidth: 130 }}>
          <h3>Total Windows</h3>
          <div className="value">{totalWindows.toLocaleString()}</div>
        </div>

        <div className={`metric-card ${breachCount > 0 ? 'breach-glow' : ''}`} style={{ flex: 1, minWidth: 130 }}>
          <h3>Breach Count</h3>
          <div className="value" style={breachCount > 0 ? { background: 'linear-gradient(135deg, #ef4444, #f97316)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } : undefined}>
            {breachCount.toLocaleString()}
          </div>
        </div>

        <div className="metric-card" style={{ flex: 1, minWidth: 130 }}>
          <h3>Breach Rate %</h3>
          <div className="value">{breachRate}%</div>
        </div>

        <div className="metric-card" style={{ flex: 1, minWidth: 130 }}>
          <h3>Unique Groups</h3>
          <div className="value">{uniqueGroups.toLocaleString()}</div>
        </div>

        <div className="metric-card" style={{ flex: 1, minWidth: 130 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={13} style={{ opacity: 0.7 }} />
            Last Breach
          </h3>
          <div className="value" style={{ color: lastBreachInfo.color, fontSize: '1.3rem' }}>
            {lastBreachInfo.text}
          </div>
        </div>

        <div className="metric-card" style={{ flex: 1, minWidth: 130 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <breachTrend.Icon size={13} style={{ opacity: 0.7 }} />
            Breach Trend
          </h3>
          <div className="value" style={{ color: breachTrend.color, fontSize: '1.2rem', fontWeight: 700 }}>
            {breachTrend.text}
          </div>
        </div>
      </div>

      {/* UI FIX 3: Added flexShrink: 0 and strict height to prevent the chart from collapsing */}
      <div className="chart-container" style={{ flexShrink: 0 }}>
        <div className="chart-title">Event Volume &amp; Breach Signal</div>
        <div style={{ width: '100%', height: 400, marginTop: '1rem' }}>
          <ResponsiveContainer width="100%" height="100%">
            {/* UI FIX 2: Added margin to separate the Brush from the X-Axis text */}
            <ComposedChart data={comboData} margin={{ top: 10, right: 20, bottom: 30, left: 0 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                dataKey="windowStart"
                stroke={AXIS_STROKE}
                tick={{ fontSize: 11 }}
                tickFormatter={formatTime}
                minTickGap={30} /* Prevents text squishing */
                dy={10} /* Pushes text down slightly */
              />
              <YAxis
                yAxisId="left"
                stroke={AXIS_STROKE}
                tick={{ fontSize: 11 }}
                allowDecimals={false}
                label={{ value: 'Event Count', angle: -90, position: 'insideLeft', style: { fill: '#94a3b8', fontSize: 11 } }}
              />
              {/* UI FIX 4: Extended domain to 1.1 so the breach line stroke isn't clipped at the absolute top edge */}
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke={AXIS_STROKE}
                tick={{ fontSize: 11 }}
                domain={[-0.1, 1.1]}
                ticks={[0, 1]}
                label={{ value: 'Breach', angle: 90, position: 'insideRight', style: { fill: '#94a3b8', fontSize: 11 } }}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                labelFormatter={formatTime}
                formatter={(value, name) => {
                  if (name.startsWith('evt_')) return [value?.toLocaleString(), `Events: ${getRuleName(name.replace('evt_', ''))}`];
                  if (name.startsWith('br_')) return [value === 1 ? 'BREACH' : 'OK', `Signal: ${getRuleName(name.replace('br_', ''))}`];
                  return [value, name];
                }}
              />
              <Legend wrapperStyle={{ paddingTop: '15px' }}
                formatter={(value) => {
                  if (value.startsWith('evt_')) return `📊 ${getRuleName(value.replace('evt_', ''))}`;
                  if (value.startsWith('br_')) return `⚡ ${getRuleName(value.replace('br_', ''))} Signal`;
                  return value;
                }}
              />

              {selectedRules.map(r => {
                const id = r.rule_metadata.rule_id;
                const color = getRuleColor(rules, id);
                return (
                  <Area
                    key={`evt_${id}`}
                    yAxisId="left"
                    type="monotone"
                    dataKey={`evt_${id}`}
                    stroke={color}
                    fill={color}
                    fillOpacity={0.12}
                    strokeWidth={2}
                    name={`evt_${id}`}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    isAnimationActive={true}
                    animationDuration={800}
                  />
                );
              })}

              {selectedRules.map(r => {
                const id = r.rule_metadata.rule_id;
                const color = getRuleColor(rules, id);
                return (
                  <Line
                    key={`br_${id}`}
                    yAxisId="right"
                    type="stepAfter"
                    dataKey={`br_${id}`}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    name={`br_${id}`}
                    dot={false}
                    activeDot={{ r: 4, fill: '#ef4444', strokeWidth: 0 }}
                    isAnimationActive={true}
                    animationDuration={800}
                  />
                );
              })}

              {breachRefLines.map((ts, idx) => (
                <ReferenceLine
                  key={`ref_${idx}`}
                  x={ts}
                  yAxisId="left"
                  stroke="#ef4444"
                  strokeDasharray="3 3"
                  strokeOpacity={0.4}
                />
              ))}

              <Brush
                dataKey="windowStart"
                height={20}
                stroke="#3b82f6"
                fill="rgba(15,23,42,0.8)"
                tickFormatter={formatTime}
                y={375} /* Forces the brush out of the way */
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* UI FIX 5: Used auto-fit grid so charts elegantly wrap on smaller screens */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1rem', flexShrink: 0 }}>
        <div className="chart-container" style={{ flexShrink: 0 }}>
          <div className="chart-title">Cumulative Breaches</div>
          <div style={{ width: '100%', height: 320, marginTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cumulativeData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis
                  dataKey="windowStart"
                  stroke={AXIS_STROKE}
                  tick={{ fontSize: 11 }}
                  tickFormatter={formatTime}
                  minTickGap={30}
                  dy={10}
                />
                <YAxis
                  stroke={AXIS_STROKE}
                  tick={{ fontSize: 11 }}
                  allowDecimals={false}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  labelFormatter={formatTime}
                  formatter={(value, name) => {
                    const ruleId = name.replace('cum_', '');
                    return [value, getRuleName(ruleId)];
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: '10px' }}
                  formatter={(value) => {
                    const ruleId = value.replace('cum_', '');
                    return getRuleName(ruleId);
                  }}
                />
                {selectedRules.map(r => {
                  const id = r.rule_metadata.rule_id;
                  const color = getRuleColor(rules, id);
                  return (
                    <Line
                      key={`cum_${id}`}
                      type="monotone"
                      dataKey={`cum_${id}`}
                      stroke={color}
                      strokeWidth={2}
                      name={`cum_${id}`}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      isAnimationActive={true}
                      animationDuration={800}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-container" style={{ flexShrink: 0 }}>
          <div className="chart-title">Aggregation Metrics</div>
          <div style={{ width: '100%', height: 320, marginTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={aggData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis
                  dataKey="windowStart"
                  stroke={AXIS_STROKE}
                  tick={{ fontSize: 11 }}
                  tickFormatter={formatTime}
                  minTickGap={30}
                  dy={10}
                />
                <YAxis stroke={AXIS_STROKE} tick={{ fontSize: 11 }} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  labelFormatter={formatTime}
                />
                <Legend wrapperStyle={{ paddingTop: '10px' }} />
                {aggLines.map(line => (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    name={line.name}
                    stroke={line.color}
                    strokeWidth={2}
                    strokeDasharray={line.dashArray}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                    isAnimationActive={true}
                    animationDuration={800}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="chart-container" style={{ flexShrink: 0 }}>
        <div className="chart-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} style={{ opacity: 0.7 }} />
          Top Groups by Breach Activity
        </div>
        <div ref={tableRef} style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem' }}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle} onClick={() => handleSort('groupKey')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Entity <ArrowUpDown size={12} /></span>
                </th>
                <th style={thStyle} onClick={() => handleSort('ruleId')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Rule <ArrowUpDown size={12} /></span>
                </th>
                <th style={thStyle} onClick={() => handleSort('totalEvents')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Events <ArrowUpDown size={12} /></span>
                </th>
                <th style={thStyle} onClick={() => handleSort('breaches')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Breaches <ArrowUpDown size={12} /></span>
                </th>
                <th style={thStyle} onClick={() => handleSort('breachRate')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Breach Rate <ArrowUpDown size={12} /></span>
                </th>
                <th style={thStyle} onClick={() => handleSort('lastWindow')}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Last Window <ArrowUpDown size={12} /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {groupTableData.map((g, i) => {
                const color = getRuleColor(rules, g.ruleId);
                const isCurrentlyBreaching = currentlyBreaching.has(`${g.groupKey}||${g.ruleId}`);

                const rowStyle = isCurrentlyBreaching
                  ? { borderLeft: '4px solid #ef4444', background: 'rgba(239,68,68,0.08)' }
                  : { borderLeft: `3px solid ${color}` };

                return (
                  <tr
                    key={`${g.groupKey}||${g.ruleId}`}
                    className={isCurrentlyBreaching ? 'breach-glow' : ''}
                    style={rowStyle}
                  >
                    <td style={tdStyle}>{i + 1}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#93c5fd' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {isCurrentlyBreaching && (
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 6px #ef4444', animation: 'pulse-dot 1.5s ease-in-out infinite', flexShrink: 0 }} />
                        )}
                        <span>
                          {g.entityName && g.entityName !== 'group' && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>{g.entityName}</span>}
                          {g.groupKey}
                        </span>
                      </span>
                    </td>
                    <td style={tdStyle}>{getRuleName(g.ruleId)}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{g.totalEvents.toLocaleString()}</td>
                    <td style={{ ...tdStyle, color: g.breaches > 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: g.breaches > 0 ? 600 : 400 }}>{g.breaches}</td>
                    <td style={{ ...tdStyle, color: parseFloat(g.breachRate) > 50 ? '#ef4444' : parseFloat(g.breachRate) > 20 ? '#f59e0b' : 'var(--text-muted)', fontWeight: parseFloat(g.breachRate) > 20 ? 600 : 400 }}>{g.breachRate}%</td>
                    <td style={{ ...tdStyle, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatTimeShort(g.lastWindow)}</td>
                  </tr>
                );
              })}
              {groupTableData.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
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