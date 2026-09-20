/**
 * dataGenerators.js — deterministic, realistic-looking synthetic RESULTS
 * data for every rule in rules.js, shaped exactly like the real backend's
 * ClickHouse-backed endpoints (see GetAggResults/GetTopGroups/
 * GetGroupDetail in the backend's internal/services/clickhouse.go —
 * groupKey/windowStart/windowEnd/aggResult/thresholdBreached, `ORDER BY
 * windowStart DESC LIMIT 5000` for raw-row endpoints, `ORDER BY
 * breachedWindows DESC LIMIT/OFFSET` for the ranked entity endpoint).
 *
 * GROUND TRUTH IS RAW EVENTS, NOT A PRE-COMPUTED AGGREGATE FORMULA.
 * generateRawEventsForWindow() is the single source of truth: for one
 * entity at one window, it synthesizes the actual individual auth-event
 * records (one row per matching transaction) that would have produced that
 * window's aggregation result in a real system. computeEntityWindowStats()
 * then derives the window's metric (a COUNT or a DISTINCT count) by
 * reducing over that raw list — exactly what the real Flink job's
 * RuleEvaluatorFunction does over real Kafka events, just done in-browser
 * over synthetic ones. This split exists specifically so the math can be
 * independently verified: scripts/verify-simulation-math.mjs imports
 * generateRawEventsForWindow directly, re-aggregates the SAME raw events
 * with its own independently-written reduction logic (not by calling
 * computeEntityWindowStats), and checks the two answers agree — see that
 * script for the full explanation and results.
 *
 * "Deterministic" matters the same way it did before: the same entity at
 * the same window always produces the same raw events (seeded by
 * ruleId+entity+windowStart, not Math.random()), so re-querying a date
 * range, reloading the page, or re-running the verification script doesn't
 * reshuffle who's the worst offender or what a specific window's numbers
 * were.
 *
 * One documented simplification, carried over from this design's original
 * single-rule version: each window's raw events are generated
 * INDEPENDENTLY of its sliding neighbors (a 5-min/1-min-slide rule's
 * consecutive windows don't share 4/5 of their underlying events the way a
 * real persistent event stream would). Modeling true sliding-window event
 * overlap would require generating and retaining a continuous raw-event
 * timeline per entity rather than per window — a materially bigger
 * architecture change than this pass's scope (adding 3 more rules,
 * grounding the existing rule in real raw events, and verifying the
 * aggregation math). What's preserved and load-bearing for this pass is
 * exactly what's being verified: for ANY one window in isolation, the
 * displayed metric is the correct COUNT/DISTINCT reduction over that
 * window's own real raw events.
 *
 * Rows are NOT generated as a dense entity x time-bucket cross product —
 * with a 5,000-entity pool that would wildly overshoot the real backend's
 * behavior. Instead each entity "fires" (produces a window row) in a given
 * bucket with a per-tier probability (severe/repeat offenders fire almost
 * every window; the long tail fires rarely) — mirroring how a real
 * composite grouping key actually behaves: most groups are one-shot, a few
 * are genuinely persistent. Generation walks buckets newest-first and stops
 * at 5,000 rows, matching the real `LIMIT 5000` raw-row cap exactly
 * (including its real limitation: for a date range with more than 5,000
 * firing rows, older activity silently isn't returned — same as
 * production).
 */
import { getEntityPool, findEntityByKey, syntheticEntityForArbitraryKey, seededRandom, FINANCIAL_AUAS, SA_UNIVERSE } from './entities.js';
import { getRule, evaluateBreach } from './rules.js';
import { toISTBackendString } from './istTime.js';

const RAW_ROW_CAP = 5000;

const FIRE_PROBABILITY = { severe: 0.9, moderate: 0.35, light: 0.03 };

/** Business-hours traffic curve in IST, peaking mid-afternoon — modulates
 * both fire probability and magnitude so activity (and breaches) cluster
 * around realistic hours instead of being flat all day. */
export function trafficMultiplier(epochMs) {
  const ist = new Date(epochMs + 5.5 * 3600 * 1000);
  const hour = ist.getUTCHours() + ist.getUTCMinutes() / 60;
  const x = ((hour - 14) / 24) * 2 * Math.PI;
  return 0.45 + 0.55 * Math.cos(x);
}

function hex(rnd, n) {
  return Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('');
}

/**
 * The ground-truth raw event list for ONE entity at ONE window. Returns []
 * if the entity didn't fire in this window at all (no traffic). Otherwise
 * returns one object per individual matching auth transaction:
 *   { eventId, timestampMs, ...entity's fixed grouping fields, [variable touch field if DISTINCT] }
 * For a COUNT rule (16, 17), the window's metric is just events.length —
 * every raw event here already passed that rule's filters (finger-auth,
 * financial AUA, non-success, etc.), so counting them IS the aggregation.
 * For a DISTINCT rule (12, 14), each event carries its own `aua`/`sa`
 * "touch" value (drawn independently per event, not fixed like the other
 * grouping fields) — the window's metric is the count of DISTINCT values
 * among these events, so this function deliberately emits `n` distinct
 * values plus a few realistic repeat-touches of the same value, to exercise
 * real dedup rather than trivially producing events.length === distinct count.
 */
export function generateRawEventsForWindow(rule, entity, windowStartMs) {
  const rnd = seededRandom(`raw|${rule.id}|${entity.groupKey}|${windowStartMs}`);
  const fireP = FIRE_PROBABILITY[entity.tier] ?? 0.05;
  const mult = trafficMultiplier(windowStartMs);
  if (rnd() > fireP * (0.6 + 0.4 * mult)) return [];

  const wobble = 0.6 + rnd() * 0.8;
  const spike = rnd() < 0.06 ? 1.6 + rnd() * 1.8 : 1;
  const n = Math.max(1, Math.round(entity.baseline * mult * wobble * spike * entity.volatility));

  const makeEvent = (extraFields) => ({
    eventId: `ev-${hex(rnd, 16)}`,
    timestampMs: windowStartMs + Math.floor(rnd() * rule.windowSizeMs),
    ...entity.fields,
    ...extraFields,
  });

  const events = [];
  if (rule.aggregation.function === 'DISTINCT') {
    const universe = rule.aggregation.fieldKey === 'aua' ? FINANCIAL_AUAS : SA_UNIVERSE;
    const distinctCount = Math.min(n, universe.length);
    // Sample distinctCount unique values from the universe (Fisher-Yates
    // partial shuffle over a seeded index array — deterministic, no repeats).
    const idx = Array.from({ length: universe.length }, (_, i) => i);
    for (let i = 0; i < distinctCount; i++) {
      const j = i + Math.floor(rnd() * (idx.length - i));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    for (let i = 0; i < distinctCount; i++) {
      const value = universe[idx[i]];
      events.push(makeEvent({ [rule.aggregation.fieldKey]: value }));
      if (rnd() < 0.3) events.push(makeEvent({ [rule.aggregation.fieldKey]: value })); // realistic repeat touch, doesn't change distinct count
    }
  } else {
    for (let i = 0; i < n; i++) events.push(makeEvent({}));
  }
  return events;
}

/** Reduces one window's raw events into its aggregation result + breach flag. */
export function computeEntityWindowStats(rule, entity, windowStartMs) {
  const events = generateRawEventsForWindow(rule, entity, windowStartMs);
  if (events.length === 0) return null;
  const metricValue = rule.aggregation.function === 'DISTINCT'
    ? new Set(events.map(e => e[rule.aggregation.fieldKey])).size
    : events.length;
  return { metricValue, breached: evaluateBreach(rule, metricValue) };
}

function windowRow(rule, entity, windowStartMs, stats, isFinal) {
  return {
    ruleId: rule.id,
    groupKey: entity.groupKey,
    windowStart: toISTBackendString(windowStartMs),
    windowEnd: toISTBackendString(windowStartMs + rule.windowSizeMs),
    evaluatedAt: toISTBackendString(windowStartMs + rule.windowSizeMs),
    aggResult: { [rule.aggregation.alias]: stats.metricValue },
    thresholdMet: stats.breached,
    thresholdBreached: stats.breached,
    isFinal: isFinal !== false,
  };
}

/** Picks a bucket step so a wide date range still produces a manageable row count. */
function pickStepMs(rangeMs) {
  const candidates = [60000, 5 * 60000, 15 * 60000, 60 * 60000, 3 * 60 * 60000];
  const targetPoints = 240;
  const raw = rangeMs / targetPoints;
  for (const c of candidates) if (raw <= c) return c;
  return candidates[candidates.length - 1];
}

/**
 * Live-analysis / agg-analysis shaped rows over [fromMs, toMs] — walks time
 * buckets NEWEST FIRST across the whole 5,000-entity pool, keeping every
 * firing row, and stops at RAW_ROW_CAP — exactly mirroring the real
 * `ORDER BY windowStart DESC LIMIT 5000` behavior (ties broken by pool
 * order, close enough to "recency" for a simulation).
 */
export function generateWindows(ruleId, fromMs, toMs, { stepMs, entities } = {}) {
  const rule = getRule(ruleId);
  if (!rule) return [];
  const step = stepMs || pickStepMs(Math.max(1, toMs - fromMs));
  const pool = entities || getEntityPool(rule);
  const rows = [];
  const start = Math.floor(fromMs / step) * step;
  const end = Math.floor(toMs / step) * step;

  for (let t = end; t >= start && rows.length < RAW_ROW_CAP; t -= step) {
    for (const entity of pool) {
      const stats = computeEntityWindowStats(rule, entity, t);
      if (stats) rows.push(windowRow(rule, entity, t, stats));
      if (rows.length >= RAW_ROW_CAP) break;
    }
  }
  return rows;
}

/** Anomaly feed: one entry per breaching window in the lookback, severity
 * derived from how far the window overshot ITS OWN rule's threshold
 * (expressed as a multiple, so this scales correctly whether the threshold
 * is 3, 5, 10, or 75). */
export function generateAnomalies(ruleId, { lookbackMs = 8 * 60 * 60 * 1000, now = Date.now(), limit = 60 } = {}) {
  const rule = getRule(ruleId);
  if (!rule) return [];
  const rows = generateWindows(ruleId, now - lookbackMs, now, { stepMs: 60000 });
  const breached = rows.filter(r => r.thresholdBreached);
  const withSeverity = breached.map(r => {
    const metricValue = r.aggResult[rule.aggregation.alias];
    const ratio = metricValue / rule.threshold;
    let severity;
    if (ratio >= 4) severity = 'CRITICAL';
    else if (ratio >= 2) severity = 'HIGH';
    else if (ratio >= 1.4) severity = 'MEDIUM';
    else severity = 'LOW';
    return {
      ruleId,
      entityValue: r.groupKey,
      timestamp: r.evaluatedAt,
      windowEnd: r.evaluatedAt,
      severity,
      penaltyTtlSeconds: 3600,
      aggResult: r.aggResult,
    };
  });
  withSeverity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return withSeverity.slice(0, limit);
}

/**
 * Server-side ranked entity list — mirrors GET /rules/:rule_id/top-groups:
 * counts each pool entity's total/breached windows within [fromMs, toMs]
 * (using the same per-bucket firing model at 1-minute resolution, capped to
 * a bounded number of buckets so a wide date range stays fast), ranks by
 * breachedWindows DESC then totalWindows DESC, and paginates.
 *
 * Bucket range is INCLUSIVE of both endpoints (floor(fromMs/step)..
 * floor(toMs/step)), matching generateGroupDetail's own range exactly for
 * any range that fits under the 500-bucket cap — this matters because the
 * real backend's GetTopGroups and GetGroupDetail (clickhouse.go) both query
 * the identical `windowStart >= ? AND windowStart <= ?` inclusive range
 * against the SAME [start_ts, end_ts] the frontend sends, so the two
 * simulated endpoints need to agree the same way for the same query. An
 * earlier version of this function used a `bucketCount ≈ range/step`
 * approximation that silently walked a DIFFERENT, offset bucket range than
 * generateGroupDetail for the identical [fromMs, toMs] — caught by
 * scripts/verify-simulation-math.mjs comparing the two against an
 * independent rollup over the real inclusive range. Beyond the 500-bucket
 * cap (a genuinely wide multi-day range), the walk stays END-anchored — the
 * most recent 500 buckets — matching this file's general recency-bias
 * convention (see RAW_ROW_CAP above).
 */
export function generateTopGroups(ruleId, fromMs, toMs, { limit = 50, offset = 0 } = {}) {
  const rule = getRule(ruleId);
  if (!rule) return { groups: [], totalRanked: 0, modeledPopulation: 0 };
  const pool = getEntityPool(rule);
  const step = pickStepMs(Math.max(1, toMs - fromMs));
  const start = Math.floor(fromMs / step) * step;
  const end = Math.floor(toMs / step) * step;
  const naturalBucketCount = Math.round((end - start) / step) + 1;
  const bucketCount = Math.min(500, Math.max(1, naturalBucketCount));
  const walkStart = end - (bucketCount - 1) * step;

  const summaries = pool.map(entity => {
    let totalWindows = 0, breachedWindows = 0, lastSeenMs = null;
    for (let t = walkStart; t <= end; t += step) {
      const stats = computeEntityWindowStats(rule, entity, t);
      if (!stats) continue;
      totalWindows += 1;
      if (stats.breached) breachedWindows += 1;
      lastSeenMs = t;
    }
    return { entity, totalWindows, breachedWindows, lastSeenMs };
  }).filter(s => s.totalWindows > 0);

  summaries.sort((a, b) => (b.breachedWindows - a.breachedWindows) || (b.totalWindows - a.totalWindows));

  const page = summaries.slice(offset, offset + limit);
  return {
    groups: page.map(s => ({
      groupKey: s.entity.groupKey,
      totalWindows: s.totalWindows,
      breachedWindows: s.breachedWindows,
      // 0-100 scale, matching the real backend's GetTopGroups exactly
      // (clickhouse.go: `g.BreachRate = breachedWindows/totalWindows * 100`)
      // — AggregatedAnalysis.jsx renders this as `${g.breachRate.toFixed(1)}%`
      // with no further scaling, so a bare 0-1 fraction here previously
      // rendered as e.g. "1.0%" for a 100%-breaching entity. Caught by
      // actually reading the live Entity Breach Ranking table, not just by
      // running the math-verification script (which never asserted against
      // this specific field's real-world 0-100 scale).
      breachRate: s.totalWindows > 0 ? (s.breachedWindows / s.totalWindows) * 100 : 0,
      lastSeen: s.lastSeenMs != null ? toISTBackendString(s.lastSeenMs + rule.windowSizeMs) : '',
    })),
    totalRanked: summaries.length,
    modeledPopulation: rule.modeledPeakConcurrentGroups,
  };
}

/**
 * Exact-key drill-in — mirrors GET /rules/:rule_id/group-detail. Works for
 * both pool members and arbitrary well-formed keys an analyst types in (see
 * entities.js's syntheticEntityForArbitraryKey), same as a real ClickHouse
 * exact-match query would return real rows for a key it has actually seen.
 */
export function generateGroupDetail(ruleId, groupKey, fromMs, toMs) {
  const rule = getRule(ruleId);
  if (!rule) return [];
  const entity = findEntityByKey(rule, groupKey) || syntheticEntityForArbitraryKey(rule, groupKey);
  const step = pickStepMs(Math.max(1, toMs - fromMs));
  const rows = [];
  const start = Math.floor(fromMs / step) * step;
  const end = Math.floor(toMs / step) * step;
  for (let t = end; t >= start && rows.length < 2000; t -= step) {
    const stats = computeEntityWindowStats(rule, entity, t);
    if (stats) rows.push(windowRow(rule, entity, t, stats));
  }
  return rows;
}

// ── Historical Replay generators — kept functional (HistoricalAnalysis.jsx
// itself is untouched by the dormancy flag, only its nav/entry points are
// hidden — see appConfig.js FEATURE_HISTORICAL_REPLAY) even though nothing
// in the UI can currently reach this tab. ──────────────────────────────────
export function generateHistoricalRows(ruleId, fromMs, toMs) {
  const rule = getRule(ruleId);
  if (!rule) return [];
  return generateWindows(ruleId, fromMs, toMs, {}).map(r => ({
    rule_id: r.ruleId,
    groupKey: r.groupKey,
    window_start: r.windowStart,
    window_end: r.windowEnd,
    threshold_met: r.thresholdMet,
    [rule.aggregation.alias]: r.aggResult[rule.aggregation.alias],
  }));
}

const MODALITY_LABELS = ['Fingerprint (Single)', 'Fingerprint (Multi)', 'Iris', 'Face'];
const OUTCOME_LABELS = ['PID Mismatch', 'Device Not Registered', 'Locked — Too Many Attempts', 'Biometric Lock', 'Server Timeout'];

export function generateHistoricalBreakdown(ruleId, fromMs, toMs) {
  const rows = generateHistoricalRows(ruleId, fromMs, toMs);
  const matched = rows.filter(r => r.threshold_met);
  const totalMatched = Math.max(1, matched.length);
  const rnd = seededRandom(`breakdown|${ruleId}|${fromMs}|${toMs}`);

  const distribute = (labels, weights) => {
    const total = weights.reduce((a, b) => a + b, 0);
    return labels.map((label, i) => ({ label, count: Math.max(1, Math.round((weights[i] / total) * totalMatched * (2 + rnd()))) }))
      .sort((a, b) => b.count - a.count);
  };

  return {
    modality_mix: distribute(MODALITY_LABELS, [0.55, 0.2, 0.15, 0.1]),
    auth_outcome: distribute(OUTCOME_LABELS, [0.38, 0.22, 0.18, 0.14, 0.08]),
    geo_hotspot: distribute(['South Delhi', 'Pune', 'Bengaluru Urban', 'Ahmedabad', 'Lucknow', 'Patna'], [0.5 + rnd(), 0.5 + rnd(), 0.5 + rnd(), 0.5 + rnd(), 0.5 + rnd(), 0.5 + rnd()]),
    match_score_histogram: ['0-20', '21-40', '41-60', '61-80', '81-100'].map((label, i) => ({
      label,
      count: Math.max(1, Math.round(totalMatched * (2 + rnd()) * [0.32, 0.26, 0.18, 0.14, 0.10][i])),
    })),
  };
}
