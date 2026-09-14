/**
 * mockWebSocket.js — a WebSocket-shaped class that replaces window.WebSocket
 * for the one socket this app opens (/api/ws/live-analysis — see
 * LiveAnalysis.jsx connectWebSocket()). Speaks the exact same
 * subscribe/bootstrap/delta protocol as the real backend's ws handler, so
 * LiveAnalysis.jsx needs zero changes to work against it.
 */
import { generateWindows } from './dataGenerators';
import { SIM_ENTITIES } from './rule';

const DELTA_INTERVAL_MS = 1500;
const BOOTSTRAP_LOOKBACK_MS = 5 * 60 * 1000; // last 5 minutes, at the rule's real 5s slide resolution

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

    const bootstrapNow = Date.now();
    const bootstrapData = {};
    for (const ruleId of this._ruleIds) {
      bootstrapData[ruleId] = generateWindows(ruleId, bootstrapNow - BOOTSTRAP_LOOKBACK_MS, bootstrapNow, { stepMs: 5000 });
    }
    this._emit({ type: 'bootstrap', data: bootstrapData });

    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => {
      const now = Date.now();
      for (const ruleId of this._ruleIds) {
        const entity = SIM_ENTITIES[Math.floor(Math.random() * SIM_ENTITIES.length)];
        const [row] = generateWindows(ruleId, now, now, { stepMs: 5000, entities: [entity] });
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
