/**
 * dataGenerators.js — deterministic, realistic-looking synthetic data for
 * every panel this app has. "Deterministic" matters here: the same entity
 * at the same window always produces the same numbers (seeded by
 * entity+window, not Math.random()), so re-querying a date range or
 * reloading the page doesn't reshuffle who's the worst offender — it reads
 * like a real, consistent dataset instead of noise.
 */
import {
  SIM_ENTITIES, SIM_ENTITY_PROFILE, evaluateBreach,
  FAIL_COUNT_THRESHOLD, UNIQUE_DEVICES_THRESHOLD,
} from './rule';
import { toISTBackendString } from './istTime';

function seededRandom(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Business-hours traffic curve in IST, peaking mid-afternoon. */
function trafficMultiplier(epochMs) {
  const ist = new Date(epochMs + 5.5 * 3600 * 1000);
  const hour = ist.getUTCHours() + ist.getUTCMinutes() / 60;
  const x = ((hour - 14) / 24) * 2 * Math.PI;
  return 0.5 + 0.5 * Math.cos(x);
}

export function computeEntityWindowStats(entity, windowStartMs) {
  const profile = SIM_ENTITY_PROFILE[entity] || { baseline: 10, volatility: 1 };
  const rnd = seededRandom(`${entity}|${Math.floor(windowStartMs / 60000)}`);
  const mult = trafficMultiplier(windowStartMs);
  const wobble = 0.6 + rnd() * 0.8;
  const spike = rnd() < 0.07 ? 1.8 + rnd() * 1.6 : 1; // occasional burst so breaches cluster realistically
  const fail_count = Math.max(0, Math.round(profile.baseline * mult * wobble * spike * profile.volatility));
  const unique_residents = Math.max(0, Math.round(fail_count * (0.35 + rnd() * 0.25)));
  const unique_devices = Math.max(0, Math.round(fail_count * (0.15 + rnd() * 0.35)));
  return { fail_count, unique_residents, unique_devices, breached: evaluateBreach({ fail_count, unique_residents, unique_devices }) };
}

function windowRow(ruleId, entity, windowStartMs, windowSizeMs, isFinal) {
  const stats = computeEntityWindowStats(entity, windowStartMs);
  return {
    ruleId,
    groupKey: entity,
    windowStart: toISTBackendString(windowStartMs),
    windowEnd: toISTBackendString(windowStartMs + windowSizeMs),
    evaluatedAt: toISTBackendString(windowStartMs + windowSizeMs),
    aggResult: { fail_count: stats.fail_count, unique_residents: stats.unique_residents, unique_devices: stats.unique_devices },
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

/** Live-analysis / agg-analysis shaped rows over [fromMs, toMs]. */
export function generateWindows(ruleId, fromMs, toMs, { stepMs, entities = SIM_ENTITIES, windowSizeMs = 5 * 60 * 1000 } = {}) {
  const step = stepMs || pickStepMs(Math.max(1, toMs - fromMs));
  const rows = [];
  const start = Math.floor(fromMs / step) * step;
  for (let t = start; t <= toMs; t += step) {
    for (const e of entities) rows.push(windowRow(ruleId, e, t, windowSizeMs));
  }
  return rows;
}

/** Anomaly feed: one entry per breaching window in the lookback, richer
 * severity derived from how far the window overshot its threshold (not
 * random) so the Severity Mix pie reads as meaningful, not arbitrary. */
export function generateAnomalies(ruleId, { lookbackMs = 8 * 60 * 60 * 1000, now = Date.now(), limit = 60 } = {}) {
  const rows = generateWindows(ruleId, now - lookbackMs, now, { stepMs: 60000 });
  const breached = rows.filter(r => r.thresholdBreached);
  const withSeverity = breached.map(r => {
    const { fail_count, unique_devices } = r.aggResult;
    let severity;
    if (fail_count > 60 || unique_devices > 30) severity = 'CRITICAL';
    else if (fail_count > FAIL_COUNT_THRESHOLD * 1.6 || unique_devices > UNIQUE_DEVICES_THRESHOLD * 1.4) severity = 'HIGH';
    else if (fail_count > FAIL_COUNT_THRESHOLD * 1.15) severity = 'MEDIUM';
    else severity = 'LOW';
    return {
      ruleId,
      entityValue: r.groupKey,
      timestamp: r.evaluatedAt,
      windowEnd: r.evaluatedAt,
      severity,
      penaltyTtlSeconds: 900,
      aggResult: r.aggResult,
    };
  });
  withSeverity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return withSeverity.slice(0, limit);
}

/** Historical-analysis shaped rows — flat aggregation fields (row[alias]),
 * snake_case window_start/threshold_met, matching the real backend's shape. */
export function generateHistoricalRows(ruleId, fromMs, toMs) {
  const step = pickStepMs(Math.max(1, toMs - fromMs));
  const rows = [];
  const start = Math.floor(fromMs / step) * step;
  for (let t = start; t <= toMs; t += step) {
    for (const entity of SIM_ENTITIES) {
      const stats = computeEntityWindowStats(entity, t);
      rows.push({
        rule_id: ruleId,
        groupKey: entity,
        window_start: toISTBackendString(t),
        window_end: toISTBackendString(t + 5 * 60 * 1000),
        threshold_met: stats.breached,
        fail_count: stats.fail_count,
        unique_residents: stats.unique_residents,
        unique_devices: stats.unique_devices,
      });
    }
  }
  return rows;
}

const DISTRICT_LABELS = ['South Delhi', 'Pune', 'Bengaluru Urban', 'Ahmedabad', 'Lucknow', 'Patna', 'Jaipur', 'Chennai'];
const MODALITY_LABELS = ['OTP', 'Fingerprint', 'Iris', 'Face'];
const OUTCOME_LABELS = ['Success', 'PID Mismatch', 'OTP Expired', 'Device Not Registered', 'Locked — Too Many Attempts'];

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
    modality_mix: distribute(MODALITY_LABELS, [0.42, 0.3, 0.16, 0.12]),
    auth_outcome: distribute(OUTCOME_LABELS, [0.08, 0.34, 0.27, 0.14, 0.17]),
    geo_hotspot: distribute(DISTRICT_LABELS.slice(0, 6), DISTRICT_LABELS.slice(0, 6).map(() => 0.5 + rnd())),
    match_score_histogram: ['0-20', '21-40', '41-60', '61-80', '81-100'].map((label, i) => ({
      label,
      count: Math.max(1, Math.round(totalMatched * (2 + rnd()) * [0.28, 0.24, 0.18, 0.16, 0.14][i])),
    })),
  };
}
