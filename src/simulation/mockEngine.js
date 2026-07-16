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
  // Real grouping.keys contract (matches the backend/Flink VelocityRule
  // shape) — the simulation genuinely groups by auth_source, one groupKey
  // per entry in MOCK_LIVE_ENTITIES/MOCK_HISTORICAL_GROUPS below, so this
  // is a true reflection of what's generated, not just decorative.
  grouping: { keys: ['auth_source'], entity_name: 'auth_source', anomaly_entity_field: 'auth_source' },
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

// ─── Multi-entity enrichment (Live/Agg/Anomaly) ───────────────────────────────
//
// MOCK_RULE declares grouping.keys: ['auth_source'], so these five entries
// are the actual set of groupKey values the rule groups by — not just
// decorative. Weighted so the "Top Groups" table, repeat-offender grouping,
// severity mix, and penalty-TTL countdown all have a realistic, uneven
// distribution to render instead of a flat one.
const MOCK_LIVE_ENTITIES = [
  { key: 'aua-mobile-app-01',      weight: 0.35, severity: 'LOW' },
  { key: 'aua-web-portal-02',      weight: 0.25, severity: 'MEDIUM' },
  { key: 'asa-partner-gateway-03', weight: 0.20, severity: 'HIGH' },
  { key: 'aua-kiosk-cluster-04',   weight: 0.12, severity: 'CRITICAL' },
  { key: 'asa-batch-uploader-05',  weight: 0.08, severity: 'MEDIUM' },
];

// Redis penalty TTL by severity — mirrors AuthDemoConfig.REDIS_DEFAULT_TTL_SECONDS
// being scaled up for more severe breaches in a real rule's penalty_ttl_seconds.
const SEVERITY_PENALTY_TTL_SECONDS = { LOW: 300, MEDIUM: 900, HIGH: 1800, CRITICAL: 3600 };

function pickWeightedEntity() {
  const r = Math.random();
  let acc = 0;
  for (const e of MOCK_LIVE_ENTITIES) {
    acc += e.weight;
    if (r <= acc) return e;
  }
  return MOCK_LIVE_ENTITIES[MOCK_LIVE_ENTITIES.length - 1];
}

// ─── Row factory ─────────────────────────────────────────────────────────────

/**
 * Build one AggregationResult row for a given 1-minute window.
 * @param {number} winStartEpochMs — UTC epoch ms of window start
 * @param {number} [forceCount]    — override random count (for seeding)
 * @param {boolean} [isFinal]      — true = authoritative end-of-window row
 *                                   (default); false = early-fire partial
 *                                   preview, mirroring the Flink pipeline's
 *                                   isFinal field.
 * @param {object} [entity]        — override the picked entity (keeps a
 *                                   window's partial+final ticks on the same
 *                                   groupKey — see MockLiveTicker).
 */
export function buildMockRow(winStartEpochMs, forceCount, isFinal = true, entity) {
  const count           = forceCount !== undefined ? forceCount : randInt(6, 10);
  const winEndEpochMs   = winStartEpochMs + 60000;
  const breached        = count >= THRESHOLD;
  const ent             = entity || pickWeightedEntity();

  return {
    id:                MOCK_RULE_ID,
    ruleId:            MOCK_RULE_ID,
    windowStart:       epochToISTString(winStartEpochMs),
    windowEnd:         epochToISTString(winEndEpochMs),
    entityName:        'auth_source',
    groupKey:          ent.key,
    entityValue:       ent.key,
    aggResult:         { count },
    aggregationResults: { count },
    producedAt:        epochToISTString(winEndEpochMs),
    evaluatedAt:       epochToISTString(winEndEpochMs),
    thresholdBreached: breached,
    thresholdMet:      breached,
    isFinal,
    event_type:        'agg',
    _entitySeverity:   ent.severity, // consumed by anomaly generation below, not sent by the real backend
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
      const severity = row._entitySeverity || 'MEDIUM';
      anomalies.push({
        ruleId:      MOCK_RULE_ID,
        id:          MOCK_RULE_ID,
        groupKey:    row.groupKey,
        entityValue: row.groupKey,
        severity,
        severityLevel: severity,
        penaltyTtlSeconds: SEVERITY_PENALTY_TTL_SECONDS[severity] || 900,
        detectedAt:  row.windowEnd,
        producedAt:  row.windowEnd,
        timestamp:   row.windowEnd,
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
 * Entities for the Historical Analysis panel — five plausible auth_source
 * channel names, matching MOCK_RULE's grouping.keys: ['auth_source']. Each
 * carries its own baseline/trend/spike-chance so the Top Group Keys bar
 * charts and sortable table show a realistic, uneven distribution rather
 * than five identical rows.
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

// ─── Historical Breakdown mock generator (forensic drill-down simulation) ────
//
// Mirrors the shape of RunHistoricalBreakdown / POST /rules/historical-breakdown
// (see internal/services/duckdb.go and internal/handlers/analysis.go on the
// backend): { modality_mix, auth_outcome, geo_hotspot, match_score_histogram },
// each an array of { label, count }. SIMULATED DATA — no Iceberg/DuckDB call
// is made. Scaled by the queried range's total mock activity so a 1-hour
// query and a 7-day query don't look identically sized.

const MOCK_MODALITY_SHARE = [
  { label: 'OTP', share: 0.42 },
  { label: 'PIN', share: 0.23 },
  { label: 'Biometric — Fingerprint', share: 0.18 },
  { label: 'Biometric — Iris', share: 0.06 },
  { label: 'Face', share: 0.07 },
  { label: 'Demographic', share: 0.04 },
];

const MOCK_AUTH_OUTCOME_SHARE = [
  { label: 'Y', share: 0.87 },  // success
  { label: 'N', share: 0.11 },  // failure
  { label: 'E', share: 0.02 },  // error
];

const MOCK_GEO_STATE_SHARE = [
  { label: 'MH', share: 0.19 }, { label: 'UP', share: 0.16 }, { label: 'KA', share: 0.12 },
  { label: 'TN', share: 0.10 }, { label: 'DL', share: 0.09 }, { label: 'GJ', share: 0.08 },
  { label: 'RJ', share: 0.07 }, { label: 'WB', share: 0.07 }, { label: 'MP', share: 0.06 },
  { label: 'BR', share: 0.06 },
];

// Bell-shaped-ish distribution of fingerprint match scores, 10-point buckets —
// genuine matches cluster high (80-100), with a thin tail down near the
// having-threshold region so the histogram looks like real biometric data.
const MOCK_SCORE_BUCKET_SHARE = [
  { bucket: 0, share: 0.01 }, { bucket: 10, share: 0.01 }, { bucket: 20, share: 0.02 },
  { bucket: 30, share: 0.02 }, { bucket: 40, share: 0.03 }, { bucket: 50, share: 0.05 },
  { bucket: 60, share: 0.08 }, { bucket: 70, share: 0.13 }, { bucket: 80, share: 0.28 },
  { bucket: 90, share: 0.37 },
];

function distributeByShare(shares, total, labelKey, extraFormat) {
  return shares
    .map(s => ({
      label: extraFormat ? extraFormat(s[labelKey]) : s[labelKey],
      count: Math.max(0, Math.round(total * s.share * (0.85 + Math.random() * 0.3))),
    }))
    .filter(row => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Generate a mock historical-breakdown response for the given rule/range.
 * SIMULATED DATA — no backend or Iceberg call is made.
 *
 * @param {object} rule     — VelocityRule-shaped object (unused today, kept for parity with the real endpoint's signature)
 * @param {string} startStr — "YYYY-MM-DDTHH:MM" IST datetime-local value
 * @param {string} endStr   — "YYYY-MM-DDTHH:MM" IST datetime-local value
 */
export function generateHistoricalBreakdown(rule, startStr, endStr) {
  console.log('[simulation] Generating mock Historical Breakdown data — test-simulation branch, no backend/Iceberg call made.');

  const startEpoch = Date.parse(String(startStr).replace(' ', 'T') + '+05:30');
  const endEpoch   = Date.parse(String(endStr).replace(' ', 'T') + '+05:30');
  if (isNaN(startEpoch) || isNaN(endEpoch) || startEpoch >= endEpoch) {
    return { modality_mix: [], auth_outcome: [], geo_hotspot: [], match_score_histogram: [] };
  }

  // Rough total matched-event estimate for this range: sum of every mock
  // group's baseline activity per minute, scaled by range length. Same
  // baselines as MOCK_HISTORICAL_GROUPS so the breakdown's magnitude is
  // roughly consistent with the replay chart above it.
  const rangeMinutes = Math.max(1, (endEpoch - startEpoch) / 60000);
  const perMinuteBaseline = MOCK_HISTORICAL_GROUPS.reduce((sum, g) => sum + g.baseline, 0);
  const totalEvents = Math.round(perMinuteBaseline * rangeMinutes * 0.9);

  return {
    modality_mix: distributeByShare(MOCK_MODALITY_SHARE, totalEvents, 'label'),
    auth_outcome: distributeByShare(MOCK_AUTH_OUTCOME_SHARE, totalEvents, 'label'),
    geo_hotspot: distributeByShare(MOCK_GEO_STATE_SHARE, totalEvents, 'label').slice(0, 10),
    match_score_histogram: distributeByShare(MOCK_SCORE_BUCKET_SHARE, totalEvents, 'bucket', (b) => `${b}-${b + 10}`),
  };
}

// ─── Live ticker ─────────────────────────────────────────────────────────────

/**
 * MockLiveTicker — replaces the WebSocket for the Live Analysis panel.
 *
 * Usage:
 *   const ticker = new MockLiveTicker((ruleId, rows) => ..., (ruleId, row) => handleDelta(ruleId, row));
 *   ticker.start();
 *   // on cleanup:
 *   ticker.stop();
 *
 * Behaviour:
 *   - Immediately emits the last 10 completed windows as a "bootstrap" dataset
 *     (each a settled, isFinal:true row across a mix of mock entities).
 *   - For the currently-open window, fires two early-fire partial ticks
 *     (isFinal:false, count converging toward the eventual total) at roughly
 *     1/3 and 2/3 through the window, then the authoritative final tick
 *     (isFinal:true) at the minute boundary — mirroring the real Flink
 *     pipeline's tryEarlyFireAgg + onTimer split. All ticks for one window
 *     share the same entity/groupKey so the frontend's upsert-by-
 *     (ruleId, groupKey, windowStart) logic has something real to exercise.
 */
export class MockLiveTicker {
  constructor(onBootstrap, onDelta) {
    this._onBootstrap = onBootstrap; // (ruleId, rows[]) => void
    this._onDelta     = onDelta;     // (ruleId, row)  => void
    this._timerId     = null;
    this._partialTimerIds = [];
  }

  start() {
    // 1. Bootstrap: generate the last 10 completed 1-minute windows
    const nowEpoch        = Date.now();
    const currentWinStart = floorToISTMinute(nowEpoch);
    const bootstrapRows   = [];

    for (let i = 10; i >= 1; i--) {
      const winStart = currentWinStart - i * 60000;
      bootstrapRows.push(buildMockRow(winStart, undefined, true));
    }

    this._onBootstrap(MOCK_RULE_ID, bootstrapRows);

    // 2. Schedule partial + final ticks for the currently-open window
    this._scheduleWindow(currentWinStart);
  }

  stop() {
    if (this._timerId !== null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }
    this._partialTimerIds.forEach(id => clearTimeout(id));
    this._partialTimerIds = [];
  }

  /** Schedule early-fire partials + the final tick for the window starting at winStart, then recurse to the next window. */
  _scheduleWindow(winStart) {
    const finalCount  = randInt(6, 10);
    const entity      = pickWeightedEntity(); // same entity for every tick of this window
    const msIntoWindow = (Date.now() + IST_OFFSET_MS) % 60000;

    [0.33, 0.66].forEach(frac => {
      const fireInMs = frac * 60000 - msIntoWindow;
      if (fireInMs <= 0) return; // already past this checkpoint (e.g. ticker started mid-window)
      const id = setTimeout(() => {
        const partialCount = Math.min(finalCount, Math.max(1, Math.round(finalCount * frac * (0.85 + Math.random() * 0.3))));
        this._onDelta(MOCK_RULE_ID, buildMockRow(winStart, partialCount, false, entity));
      }, fireInMs);
      this._partialTimerIds.push(id);
    });

    const msUntilBoundary = Math.max(0, 60000 - msIntoWindow);
    this._timerId = setTimeout(() => {
      this._onDelta(MOCK_RULE_ID, buildMockRow(winStart, finalCount, true, entity));
      this._partialTimerIds.forEach(id => clearTimeout(id));
      this._partialTimerIds = [];
      this._scheduleWindow(winStart + 60000);
    }, msUntilBoundary);
  }
}
