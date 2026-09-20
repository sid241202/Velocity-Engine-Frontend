/**
 * entities.js — synthetic entity populations for every rule in rules.js,
 * built to the real August 2026 volume/cardinality profile from
 * PRODUCTION_CAPACITY_SPECS.txt (§1.1, §2.3) and the real financial-AUA
 * list from BUSINESS_RULES_UI_GUIDE.md's appendix.
 *
 * Each rule's `modeledPeakConcurrentGroups` (rules.js) is the real,
 * documented capacity-sizing estimate for that rule's own grouping key at
 * peak traffic — deliberately NOT materialized as that many JS objects. A
 * real analyst never browses that many rows either (that's the whole point
 * of the server-side top-groups ranking this UI uses, see
 * dataGenerators.js) — they only ever look at the worst offenders. Every
 * rule gets the same large-but-tractable POOL (5,000 entities) with a
 * realistic power-law severity distribution, scaled to that rule's own
 * threshold, so the ranked table, pagination, and exact-key lookup all
 * behave like the real, much larger population would: a small head of
 * persistent repeat offenders, a mid-size band of occasional breachers, and
 * a long tail that almost never crosses the threshold.
 */

// ── Real cardinalities, August 10 2026 (peak day) — PRODUCTION_CAPACITY_SPECS.txt §1.1 ──
export const REAL_AUA_CARDINALITY = 233; // all AUAs seen that day, not just financial ones
export const REAL_SA_CARDINALITY = 569;
export const REAL_DEVICE_CARDINALITY = 1_859_887;
export const REAL_EID_CARDINALITY = 52_307_061;
export const REAL_PEAK_DAY_EVENTS = 122_291_666;
export const REAL_AVG_DAY_EVENTS = 89_093_456;

// The exact 131-code financial AUA allow-list (BUSINESS_RULES_UI_GUIDE.md
// appendix) — every simulated event across all four rules is pre-filtered
// to IS_FINANCIAL_AUA, so every simulated entity's/event's `aua` is one of
// these, matching the real filter. Note this is a SUBSET of the 233
// real-world distinct AUAs above (only ones on UIDAI's financial-AUA list).
export const FINANCIAL_AUAS = [
  '0003520000', '0000980000', '0003410000', '0001500000', '0003370000', '0008500000', '0003200000', '0009600000',
  '0006500000', '0001060000', '0000050000', '0023000200', '0002670000', '0000180000', '0005700000', '0000320000',
  '0007700000', '0000810000', '0002740000', '0007500000', '0001260000', '0002800000', '0005800000', '0002570000',
  '0000700000', '0002880000', '0006400000', '0001590000', '0000420000', '0002400000', '0003360000', '0001450000',
  '0000230000', '0009800000', '0001800000', '0002100000', '0000600000', '0004000000', '0000470000', '0009400000',
  '0007800000', '0000550000', '0002000000', '0007200000', '0002890000', '0000760000', '0006200000', '0006900000',
  '0000110000', '0007100000', '0002600000', '0003340000', '0011000000', '0006100000', '0005200000', '0001700000',
  '0000580000', '0000770000', '0004300000', '0005400000', '0003100000', '0000410000', '0000070000', '0000590000',
  '0008700000', '0000250000', '0043000100', '0001900000', '0000080000', '0001400000', '0001940000', '0000310000',
  '0003010000', '0002530000', '0001080000', '0000920000', '0003170000', '0002900000', '0000190000', '0008800000',
  '0003600000', '0000120000', '0001100000', '0000170000', '0001200000', '0002300000', '0001600000', '0000040000',
  '0023000100', '0000220000', '0005500000', '0003070000', '0000060000', '0005600000', '0004900000', '0000280000',
  '0000200000', '0000680000', '0000620000', '0003250000', '0002500000', '0000630000', '0001110000', '0002260000',
  '0003320000', '0003210000', '0003180000', '0003190000', '0003090000', '0003120000', '0003220000', '0001160000',
  '0003420000', '0003450000', '0003470000', '0003550000', '0003560000', '0003570000', '0003580000', '0003610000',
  '0003670000', '0003690000', '0001780000', '0003810000', '0004010000', '0004040000', '0004160000', '0004180000',
  '0004250000', '0004270000', '0004310000',
];

// Finger-auth allow-list the legacy job hardcoded (BUSINESS_RULES_UI_GUIDE.md
// "What's common to every rule" note) — all five CONTAIN "F".
export const AUTH_TYPES = ['DF', 'DFO', 'F', 'FO', 'FT'];

// Non-'Y' auth-result codes (rules 16/17 filter auth_result != 'Y', so every
// simulated event for those two rules failed one of these ways).
export const AUTH_RESULTS = ['N', 'E', 'T'];

const DISTRICTS = ['South Delhi', 'Pune', 'Bengaluru Urban', 'Ahmedabad', 'Lucknow', 'Patna', 'Jaipur', 'Chennai', 'Surat', 'Kanpur'];

export function seededRandom(seedStr) {
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

function pick(rnd, arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

/**
 * Deterministic, real-looking 10-digit zero-padded device code from a seed.
 * The random component must span the full 9-digit range (up to 999,999,998)
 * — an earlier version of this function drew from Math.floor(rnd()*999999),
 * only ~1e6 possible values despite padding to look like 9 digits. That's
 * fine in isolation but silently corrupts a 5,000-entity pool for any rule
 * whose grouping key is deviceCode ALONE (rule 17): birthday-paradox math
 * over only 1e6 values with 5,000 draws gives a >99.9% chance of at least
 * one collision, which two different entities sharing the same groupKey
 * turns into real data corruption (findEntityByKey's map silently keeps
 * only the last one written). Caught by scripts/verify-simulation-math.mjs
 * disagreeing with itself on rule 17's numbers between a narrow-range and
 * wide-range lookup of the same entity. 1e9 possible values makes a
 * collision across 5,000 draws negligible (~1.25e-5).
 */
function makeDeviceCode(rnd) {
  const n = Math.floor(rnd() * 999999999);
  return `1${String(n).padStart(9, '0')}`;
}

/** Deterministic UUID-v4-*shaped* enrolmentReferenceId (not crypto-random — reproducible per seed). */
function makeEnrolmentReferenceId(rnd) {
  const hex = () => Math.floor(rnd() * 16).toString(16);
  const block = (n) => Array.from({ length: n }, hex).join('');
  return `${block(8)}-${block(4)}-4${block(3)}-a${block(3)}-${block(12)}`;
}

/**
 * Synthetic SA (sub-AUA) universe, matching the real distinct-SA cardinality
 * for August 10 2026 (569, PRODUCTION_CAPACITY_SPECS.txt §1.1). There is no
 * real hardcoded SA list the way there is for financial AUAs, so this is
 * generated once, deterministically, from a fixed global seed — stable
 * across reloads and across the verification script (same seed, same list).
 */
function buildSaUniverse() {
  const rnd = seededRandom('sa-universe|v1');
  const out = [];
  const seen = new Set();
  while (out.length < REAL_SA_CARDINALITY) {
    const code = `2${String(Math.floor(rnd() * 999999999)).padStart(9, '0')}`;
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}
export const SA_UNIVERSE = buildSaUniverse();

/**
 * A severity tier for how often a group re-appears/breaches within a
 * window, expressed as a MULTIPLE of the rule's own threshold so the same
 * shape (small severe head, mid moderate band, long light tail) scales
 * correctly whether the threshold is 3 (rule 14) or 75 (rule 17). Real
 * composite groups (2-key or 6-key) are almost all one-shot or two-shot —
 * only a small head of resident/device combinations genuinely repeat-offend
 * within a window.
 */
function makeTiers(threshold) {
  return [
    { name: 'severe', share: 0.01, baselineMin: threshold * 2.0, baselineMax: threshold * 6.0, volatility: 1.3 },
    { name: 'moderate', share: 0.09, baselineMin: threshold * 0.6, baselineMax: threshold * 1.6, volatility: 1.0 },
    { name: 'light', share: 0.90, baselineMin: 0, baselineMax: threshold * 0.6, volatility: 0.7 },
  ];
}

export const ENTITY_POOL_SIZE = 5000;

function buildEntity(rule, tiers, index) {
  const rnd = seededRandom(`entity|${rule.id}|${index}`);
  let tier = tiers[tiers.length - 1];
  const r = rnd();
  let cum = 0;
  for (const t of tiers) {
    cum += t.share;
    if (r <= cum) { tier = t; break; }
  }

  const fields = {};
  for (const key of rule.groupingFieldKeys) {
    if (key === 'enrolmentReferenceId') fields.enrolmentReferenceId = makeEnrolmentReferenceId(rnd);
    else if (key === 'deviceCode') fields.deviceCode = makeDeviceCode(rnd);
    else if (key === 'aua') fields.aua = pick(rnd, FINANCIAL_AUAS);
    else if (key === 'sa') fields.sa = pick(rnd, SA_UNIVERSE);
    else if (key === 'authType') fields.authType = pick(rnd, AUTH_TYPES);
    else if (key === 'authResult') fields.authResult = pick(rnd, AUTH_RESULTS);
  }

  const groupKey = rule.groupingFieldKeys.map(k => fields[k]).join('|');
  const district = pick(rnd, DISTRICTS);
  const baseline = tier.baselineMin + rnd() * (tier.baselineMax - tier.baselineMin);

  return { ruleId: rule.id, groupKey, fields, tier: tier.name, baseline, volatility: tier.volatility, district };
}

const _pools = new Map(); // ruleId -> entity[]
const _byKeyPerRule = new Map(); // ruleId -> Map<groupKey, entity>

/** The full 5,000-entity synthetic population for one rule, built once and cached. */
export function getEntityPool(rule) {
  if (!_pools.has(rule.id)) {
    const tiers = makeTiers(rule.threshold);
    _pools.set(rule.id, Array.from({ length: ENTITY_POOL_SIZE }, (_, i) => buildEntity(rule, tiers, i)));
  }
  return _pools.get(rule.id);
}

export function findEntityByKey(rule, groupKey) {
  if (!_byKeyPerRule.has(rule.id)) {
    const map = new Map();
    for (const e of getEntityPool(rule)) map.set(e.groupKey, e);
    _byKeyPerRule.set(rule.id, map);
  }
  return _byKeyPerRule.get(rule.id).get(groupKey) || null;
}

/**
 * For a groupKey typed into the exact-ID lookup that ISN'T one of the 5,000
 * pool members (any well-formed key an analyst might paste in) — deterministic,
 * low-activity synthetic entity, matching how real composite groups behave:
 * the overwhelming majority of real combinations are one-shot/rarely-repeat,
 * never a "severe" or "moderate" offender (those are rare enough to already
 * be in the ranked pool).
 */
export function syntheticEntityForArbitraryKey(rule, groupKey) {
  const known = findEntityByKey(rule, groupKey);
  if (known) return known;
  const rnd = seededRandom(`arbitrary|${rule.id}|${groupKey}`);
  const baseline = rnd() * rule.threshold * 0.4; // essentially never breaches
  return { ruleId: rule.id, groupKey, fields: null, tier: 'light', baseline, volatility: 0.6, district: pick(rnd, DISTRICTS) };
}
