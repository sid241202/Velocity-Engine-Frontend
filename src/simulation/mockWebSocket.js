/**
 * mockWebSocket.js — a WebSocket-shaped class that replaces window.WebSocket
 * for the one socket this app opens (/api/ws/live-analysis — see
 * LiveAnalysis.jsx connectWebSocket()). Speaks the exact same
 * subscribe/bootstrap/delta protocol as the real backend's ws handler, so
 * LiveAnalysis.jsx needs zero changes to work against it. Generic across
 * however many rule_ids the page subscribes to — LiveAnalysis.jsx only ever
 * subscribes to whichever one rule is currently selected, but this class
 * doesn't assume that.
 */
import { generateWindows, computeEntityWindowStats } from './dataGenerators.js';
import { getEntityPool } from './entities.js';
import { getRule } from './rules.js';
import { toISTBackendString } from './istTime.js';

const DELTA_INTERVAL_MS = 3000;
const BOOTSTRAP_LOOKBACK_MS = 20 * 60 * 1000; // last 20 minutes, at real 1-min slide resolution

// Weight which tier fires the *next* live delta — mirrors the real firing
// probabilities in dataGenerators.js (severe/moderate genuinely do fire
// more often), just resampled per tick instead of scanning the whole pool
// every 3 seconds.
function pickDeltaEntity(rule) {
  const pool = getEntityPool(rule);
  const r = Math.random();
  const tier = r < 0.35 ? 'severe' : r < 0.7 ? 'moderate' : 'light';
  const candidates = pool.filter(e => e.tier === tier);
  const from = candidates.length > 0 ? candidates : pool;
  return from[Math.floor(Math.random() * from.length)];
}

export class SimulatedLiveSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0; // CONNECTING
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this._timer = null;
    this._ruleIds = [];

    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen({ type: 'open' });
    }, 120);
  }

  send(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type !== 'subscribe') return;
    this._ruleIds = msg.rule_ids || [];

    const now = Date.now();
    const bootstrapData = {};
    for (const ruleId of this._ruleIds) {
      bootstrapData[ruleId] = generateWindows(ruleId, now - BOOTSTRAP_LOOKBACK_MS, now, { stepMs: 60000 });
    }
    this._emit({ type: 'bootstrap', data: bootstrapData });

    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => {
      const tNow = Date.now();
      const windowStartMs = Math.floor(tNow / 60000) * 60000;
      for (const ruleId of this._ruleIds) {
        const rule = getRule(ruleId);
        if (!rule) continue;
        const entity = pickDeltaEntity(rule);
        const stats = computeEntityWindowStats(rule, entity, windowStartMs) || { metricValue: 1, breached: false };
        const row = {
          ruleId,
          groupKey: entity.groupKey,
          windowStart: toISTBackendString(windowStartMs),
          windowEnd: toISTBackendString(windowStartMs + rule.windowSizeMs),
          evaluatedAt: toISTBackendString(tNow),
          aggResult: { [rule.aggregation.alias]: stats.metricValue },
          thresholdMet: stats.breached,
          thresholdBreached: stats.breached,
          isFinal: false,
        };
        this._emit({ type: 'delta', rule_id: ruleId, row });
      }
    }, DELTA_INTERVAL_MS);
  }

  _emit(payload) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(payload) });
  }

  close() {
    this.readyState = 3; // CLOSED
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    if (this.onclose) this.onclose({ type: 'close' });
  }
}

export function installMockWebSocket() {
  const RealWebSocket = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    if (typeof url === 'string' && url.includes('/ws/live-analysis')) {
      return new SimulatedLiveSocket(url);
    }
    return new RealWebSocket(url, protocols);
  };
  window.WebSocket.CONNECTING = 0;
  window.WebSocket.OPEN = 1;
  window.WebSocket.CLOSING = 2;
  window.WebSocket.CLOSED = 3;
}
