/**
 * mockEngine.js — Frontend-only simulation engine.
 *
 * Simulates a Kafka→Flink→Backend pipeline in-browser so that the
 * Live Analysis and Aggregated Analysis panels work without any
 * running backend or Flink cluster.
 *
 * Scenario:
 *   - Auth source emits 6–10 events randomly in every 1-minute IST
 *     tumbling window (aligned to wall-clock minutes).
 *   - One rule is active: count events per 1-min window, threshold ≥ 8.
 *   - If count ≥ 8 → thresholdBreached = true.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

export const MOCK_RULE_ID = 'mock-rule-001';
export const THRESHOLD    = 8;
const IST_OFFSET_MS       = 5.5 * 60 * 60 * 1000;

// ─── The hardcoded mock rule (matches the shape Dashboard passes to panels) ───

export const MOCK_RULE = {
  rule_metadata: {
    rule_id:     MOCK_RULE_ID,
    rule_name:   'Auth Event Counter (1-min)',
    description: 'Simulation: count auth events per 1-minute IST window. Threshold ≥ 8.',
    status:      'ACTIVE',
    created_at:  new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    updated_at:  new Date().toISOString(),
    entity_type: 'auth',
    entity_name: 'auth_source',
  },
  windowing: {
    type:        'TUMBLING',
    size_ms:     60000,
    time_type:   'SYSTEM_TIME',
  },
  aggregations: [
    { alias: 'count', function: 'COUNT', field: '*' },
  ],
  having_thresholds: [
    { alias: 'count', operator: '>=', value: THRESHOLD },
  ],
  filters: [],
  group_by_fields: [],
  sinks: { aggSinkEnabled: true, anomalySinkEnabled: true },
};

// ─── IST helpers ─────────────────────────────────────────────────────────────

/** Convert UTC epoch ms → IST wall-clock "YYYY-MM-DD HH:MM:SS" string. */
function epochToISTString(epochMs) {
  const ist = new Date(epochMs + IST_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ` +
    `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}`;
}

/** Floor a UTC epoch ms to the start of the IST minute it falls in. */
function floorToISTMinute(epochMs) {
  // shift to IST wall time, floor to minute, shift back to UTC epoch
  const istMs = epochMs + IST_OFFSET_MS;
  const floored = istMs - (istMs % 60000);
  return floored - IST_OFFSET_MS;
}

/** Random integer in [min, max] inclusive. */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Row factory ─────────────────────────────────────────────────────────────

/**
 * Build one AggregationResult row for a given 1-minute window.
 * @param {number} winStartEpochMs — UTC epoch ms of window start
 * @param {number} [forceCount]    — override random count (for seeding)
 */
export function buildMockRow(winStartEpochMs, forceCount) {
  const count           = forceCount !== undefined ? forceCount : randInt(6, 10);
  const winEndEpochMs   = winStartEpochMs + 60000;
  const breached        = count >= THRESHOLD;

  return {
    id:                MOCK_RULE_ID,
    ruleId:            MOCK_RULE_ID,
    windowStart:       epochToISTString(winStartEpochMs),
    windowEnd:         epochToISTString(winEndEpochMs),
    entityName:        'auth_source',
    groupKey:          'auth_source',
    entityValue:       'auth_source',
    aggResult:         { count },
    aggregationResults: { count },
    producedAt:        epochToISTString(winEndEpochMs),
    evaluatedAt:       epochToISTString(winEndEpochMs),
    thresholdBreached: breached,
    thresholdMet:      breached,
    event_type:        'agg',
  };
}

// ─── Historical data generator ────────────────────────────────────────────────

/**
 * Generate mock historical data for the Aggregated Analysis panel.
 *
 * @param {string} startStr — "YYYY-MM-DDTHH:MM" (IST, from datetime-local input)
 * @param {string} endStr   — "YYYY-MM-DDTHH:MM" (IST, from datetime-local input)
 * @returns {{ results: Object, anomalyResults: Array }}
 */
export function generateHistoricalData(startStr, endStr) {
  // Parse the IST datetime-local strings as IST timestamps
  const startEpoch = Date.parse(startStr.replace('T', ' ').replace(' ', 'T') + '+05:30');
  const endEpoch   = Date.parse(endStr.replace('T', ' ').replace(' ', 'T') + '+05:30');

  if (isNaN(startEpoch) || isNaN(endEpoch) || startEpoch >= endEpoch) {
    return { results: { [MOCK_RULE_ID]: [] }, anomalyResults: [] };
  }

  const rows     = [];
  const anomalies = [];

  // Walk minute-by-minute from floored start to end
  let winStart = floorToISTMinute(startEpoch);
  while (winStart < endEpoch) {
    const row = buildMockRow(winStart);
    rows.push(row);
    if (row.thresholdBreached) {
      anomalies.push({
        ruleId:     MOCK_RULE_ID,
        groupKey:   'auth_source',
        entityValue: 'auth_source',
        detectedAt: row.windowEnd,
        producedAt: row.windowEnd,
        timestamp:  row.windowEnd,
      });
    }
    winStart += 60000;
  }

  return {
    results:       { [MOCK_RULE_ID]: rows },
    anomalyResults: anomalies,
  };
}

// ─── Live ticker ─────────────────────────────────────────────────────────────

/**
 * MockLiveTicker — replaces the WebSocket for the Live Analysis panel.
 *
 * Usage:
 *   const ticker = new MockLiveTicker((ruleId, row) => handleDelta(ruleId, row));
 *   ticker.start();
 *   // on cleanup:
 *   ticker.stop();
 *
 * Behaviour:
 *   - Immediately emits the last 10 completed windows as a "bootstrap" dataset.
 *   - Then fires once at the boundary of every real-clock IST minute, emitting
 *     the just-closed window as a live delta — exactly matching the real Flink
 *     tumbling window timing.
 */
export class MockLiveTicker {
  constructor(onBootstrap, onDelta) {
    this._onBootstrap = onBootstrap; // (ruleId, rows[]) => void
    this._onDelta     = onDelta;     // (ruleId, row)  => void
    this._timerId     = null;
  }

  start() {
    // 1. Bootstrap: generate the last 10 completed 1-minute windows
    const nowEpoch        = Date.now();
    const currentWinStart = floorToISTMinute(nowEpoch);
    const bootstrapRows   = [];

    for (let i = 10; i >= 1; i--) {
      const winStart = currentWinStart - i * 60000;
      bootstrapRows.push(buildMockRow(winStart));
    }

    this._onBootstrap(MOCK_RULE_ID, bootstrapRows);

    // 2. Schedule the next tick at the exact start of the next IST minute
    this._scheduleNext();
  }

  stop() {
    if (this._timerId !== null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
  }

  _scheduleNext() {
    const nowEpoch       = Date.now();
    const nowInIST       = nowEpoch + IST_OFFSET_MS;
    // ms until the next IST minute boundary
    const msUntilNextMin = 60000 - (nowInIST % 60000);

    this._timerId = setTimeout(() => {
      this._tick();
      // After the first tick, schedule subsequent ticks every 60 seconds
      this._timerId = setInterval(() => this._tick(), 60000);
    }, msUntilNextMin);
  }

  _tick() {
    // The window that just closed started 60 seconds ago
    const closedWinStart = floorToISTMinute(Date.now()) - 60000;
    const row = buildMockRow(closedWinStart);
    this._onDelta(MOCK_RULE_ID, row);
  }
}
