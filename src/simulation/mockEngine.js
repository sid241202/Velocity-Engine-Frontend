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

// ─── Historical Analysis mock generator (DuckDB/Iceberg backtest simulation) ──
//
// This section is SIMULATED — no backend, DuckDB, or Iceberg call is made.
// It exists because, unlike Live/Aggregated Analysis, Historical Analysis was
// previously left wired to the real `/api/rules/historical-analysis` endpoint
// and would error out with no backend running (see HistoricalAnalysis.jsx).
//
// Schema note: the historical/DuckDB response shape is NOT the same as the
// Live/Agg Kafka shape used above (buildMockRow). Per the Go backend
// (internal/services/duckdb.go), historical rows are flat maps:
//   { window_start: "YYYY-MM-DD HH:MM:SS", groupKey: string,
//     threshold_met: bool, <alias1>: number, <alias2>: number, ... }
// i.e. aggregation values are their own top-level columns, not nested under
// an `aggResult` object like the Live/Agg rows are.

/**
 * Pseudo entities for the Historical Analysis panel. MOCK_RULE itself has no
 * grouping configured (group_by_fields: []), so in a byte-for-byte replay it
 * would only ever produce one group ('__GLOBAL__' server-side). Historical
 * Analysis's UI has group-key visualizations (Top Group Keys bar charts + a
 * sortable table) that are meaningless with a single row, so this simulation
 * synthesizes a handful of plausible auth_source channel names purely to
 * exercise those views. This is a simulation-only enrichment, not a literal
 * reflection of MOCK_RULE's real (ungrouped) configuration.
 */
const MOCK_HISTORICAL_GROUPS = [
  { key: 'auth-source-mobile-app',   baseline: 26, trend:  0.35, spikeChance: 0.05 },
  { key: 'auth-source-web-portal',   baseline: 14, trend:  0.10, spikeChance: 0.04 },
  { key: 'auth-source-partner-api',  baseline: 9,  trend: -0.20, spikeChance: 0.07 },
  { key: 'auth-source-kiosk',        baseline: 4,  trend:  0.05, spikeChance: 0.02 },
  { key: 'auth-source-batch-upload', baseline: 2,  trend:  0.00, spikeChance: 0.015 },
];

// Mirrors the Go backend's `LIMIT 5000` in duckdb.go's historical query.
const HISTORICAL_ROW_CAP = 5000;

/** Floor a UTC epoch ms to the start of the IST bucket of size `sizeMs`. */
function floorToISTBoundary(epochMs, sizeMs) {
  const istMs = epochMs + IST_OFFSET_MS;
  const floored = istMs - (istMs % sizeMs);
  return floored - IST_OFFSET_MS;
}

/** Simple daily-activity curve: quiet overnight, busy through the day. */
function hourlyActivityFactor(hourIST) {
  const curve = [
    0.35, 0.30, 0.28, 0.30, 0.40, 0.55, 0.75, 0.95, 1.10, 1.20, 1.25, 1.30,
    1.30, 1.25, 1.20, 1.15, 1.10, 1.05, 0.95, 0.80, 0.65, 0.55, 0.45, 0.38,
  ];
  return curve[hourIST] ?? 1;
}

/**
 * Compute one aggregation value for a given group/window, blending a
 * baseline, a slow trend across the queried range, a daily activity cycle,
 * occasional spikes (simulated anomalies), and random noise.
 */
function computeAggValue(group, progress, hourIST, aggFn) {
  const trendFactor = 1 + group.trend * progress;
  const cycleFactor  = hourlyActivityFactor(hourIST);
  const isSpike      = Math.random() < group.spikeChance;
  const spikeFactor  = isSpike ? 2.2 + Math.random() * 1.8 : 1;
  const noise        = 0.85 + Math.random() * 0.3;

  const raw = group.baseline * trendFactor * cycleFactor * spikeFactor * noise;

  switch (String(aggFn || 'COUNT').toUpperCase()) {
    case 'SUM':
      return Math.round(raw * 45.5 * 100) / 100;
    case 'AVG':
      return Math.round((raw / 3 + 5) * 100) / 100;
    case 'MIN':
      return Math.max(0, Math.round(raw * 0.4));
    case 'MAX':
      return Math.round(raw * 1.6);
    case 'COUNT':
    case 'COUNT_DISTINCT':
    default:
      return Math.max(0, Math.round(raw));
  }
}

/** Evaluate a rule's having_thresholds against one generated row. */
function evaluateThreshold(row, thresholds) {
  if (!Array.isArray(thresholds) || thresholds.length === 0) return false;
  return thresholds.every(t => {
    const val = row[t.alias];
    if (val == null) return false;
    switch (t.operator) {
      case '>':  return val >  t.value;
      case '>=': return val >= t.value;
      case '<':  return val <  t.value;
      case '<=': return val <= t.value;
      case '==': return val === t.value;
      case '!=': return val !== t.value;
      default:   return false;
    }
  });
}

/**
 * Generate mock rows for the Historical Analysis panel, matching the exact
 * shape the Go backend's DuckDB/Iceberg query returns.
 *
 * SIMULATED DATA — no backend or Iceberg call is made.
 *
 * @param {object} rule     — VelocityRule-shaped object (uses .windowing, .aggregations, .having_thresholds)
 * @param {string} startStr — "YYYY-MM-DDTHH:MM" IST datetime-local value
 * @param {string} endStr   — "YYYY-MM-DDTHH:MM" IST datetime-local value
 * @returns {{ results: Array }}
 */
export function generateHistoricalAnalysisData(rule, startStr, endStr) {
  console.log('[simulation] Generating mock Historical Analysis data — test-simulation branch, no backend/Iceberg call made.');

  const startEpoch = Date.parse(String(startStr).replace(' ', 'T') + '+05:30');
  const endEpoch   = Date.parse(String(endStr).replace(' ', 'T') + '+05:30');
  if (isNaN(startEpoch) || isNaN(endEpoch) || startEpoch >= endEpoch) {
    return { results: [] };
  }

  const windowMs = (rule && rule.windowing && rule.windowing.size_ms) || 60000;
  const aggregations = (rule && Array.isArray(rule.aggregations) && rule.aggregations.length > 0)
    ? rule.aggregations
    : [{ alias: 'count', function: 'COUNT' }];
  const thresholds = (rule && rule.having_thresholds) || [];

  const rangeMs = endEpoch - startEpoch;
  const rows = [];

  let winStart = floorToISTBoundary(startEpoch, windowMs);
  while (winStart < endEpoch) {
    const progress = rangeMs > 0 ? Math.min(1, Math.max(0, (winStart - startEpoch) / rangeMs)) : 0;
    const hourIST  = new Date(winStart + IST_OFFSET_MS).getUTCHours();

    for (const group of MOCK_HISTORICAL_GROUPS) {
      const row = {
        window_start: epochToISTString(winStart),
        groupKey:     group.key,
      };
      for (const agg of aggregations) {
        row[agg.alias] = computeAggValue(group, progress, hourIST, agg.function);
      }
      row.threshold_met = evaluateThreshold(row, thresholds);
      rows.push(row);
    }
    winStart += windowMs;
  }

  // Mirror the backend's `ORDER BY window_start DESC LIMIT 5000` truncation
  // so wide date ranges behave the same way they would against real Iceberg
  // data (see internal/services/duckdb.go).
  if (rows.length > HISTORICAL_ROW_CAP) {
    console.log(`[simulation] Historical result set (${rows.length} rows) exceeds the backend's 5000-row cap — truncating to the most recent ${HISTORICAL_ROW_CAP}, matching duckdb.go behavior.`);
    return { results: rows.slice(rows.length - HISTORICAL_ROW_CAP) };
  }

  return { results: rows };
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
