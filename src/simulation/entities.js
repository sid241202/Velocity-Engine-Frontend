/**
 * entities.js — the synthetic Rule 5 (see rule.js) entity population, built
 * to the real August 2026 volume/cardinality profile from
 * PRODUCTION_CAPACITY_SPECS.txt (section 1.1, 2.3) and the real financial-
 * AUA list from BUSINESS_RULES_UI_GUIDE.md's appendix (every event this
 * rule sees is pre-filtered to a financial AUA, so every simulated entity's
 * `aua` is drawn from this same 131-code list, not a placeholder).
 *
 * MODELED_PEAK_CONCURRENT_GROUPS (~630,000) is the real, documented
 * capacity-sizing estimate for this exact rule's grouping key at peak
 * traffic — it is deliberately NOT materialized as 630,000 JS objects here.
 * A real analyst never browses that many rows either (that's the whole
 * point of the server-side top-groups ranking this UI uses, see
 * dataGenerators.js) — they only ever look at the worst offenders. This
 * module generates a large-but-tractable POOL (5,000 entities) with a
 * realistic power-law severity distribution so the ranked table, pagination,
 * and exact-key lookup all behave like the real, much larger population
 * would: a small head of persistent repeat offenders, a mid-size band of
 * occasional breachers, and a long tail that almost never crosses the
 * threshold — which is exactly what a 6-key grouping on real auth traffic
 * produces (most 6-tuples are seen only once or twice).
 */

// ── Real cardinalities, August 10 2026 (peak day) — PRODUCTION_CAPACITY_SPECS.txt §1.1 ──
export const REAL_AUA_CARDINALITY = 233;
export const REAL_SA_CARDINALITY = 569;
export const REAL_DEVICE_CARDINALITY = 1_859_887;
export const REAL_EID_CARDINALITY = 52_307_061;
export const REAL_PEAK_DAY_EVENTS = 122_291_666;
export const REAL_AVG_DAY_EVENTS = 89_093_456;
export const MODELED_PEAK_CONCURRENT_GROUPS = 630_000; // PRODUCTION_CAPACITY_SPECS.txt §2.3, rule 16

// The exact 131-code financial AUA allow-list (BUSINESS_RULES_UI_GUIDE.md
// appendix) — every simulated entity's `aua` is one of these, matching the
// rule's real IS_FINANCIAL_AUA filter.
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

// Non-'Y' auth-result codes (this rule filters auth_result != 'Y', so every
// simulated event failed one of these ways).
export const AUTH_RESULTS = ['N', 'E', 'T'];

const DISTRICTS = ['South Delhi', 'Pune', 'Bengaluru Urban', 'Ahmedabad', 'Lucknow', 'Patna', 'Jaipur', 'Chennai', 'Surat', 'Kanpur'];

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

function pick(rnd, arr) {
  return arr[Math.floor(rnd() * arr.length)];
}

/** Deterministic, real-looking 10-digit zero-padded device code from a seed. */
function makeDeviceCode(rnd) {
  const n = Math.floor(rnd() * 999999);
  return `1${String(n).padStart(9, '0')}`;
}

/** Deterministic UUID-v4-*shaped* enrolmentReferenceId (not crypto-random — reproducible per seed). */
function makeEnrolmentReferenceId(rnd) {
  const hex = () => Math.floor(rnd() * 16).toString(16);
  const block = (n) => Array.from({ length: n }, hex).join('');
  return `${block(8)}-${block(4)}-4${block(3)}-a${block(3)}-${block(12)}`;
}

/**
 * A severity tier for how often a 6-key group re-appears/breaches within a
 * window. Real 6-key composite groups are almost all one-shot or
 * two-shot — only a small head of device/resident combinations genuinely
 * repeat-offend within a 5-minute window.
 */
const TIERS = [
  { name: 'severe', share: 0.01, baselineMin: 20, baselineMax: 60, volatility: 1.3 },
  { name: 'moderate', share: 0.09, baselineMin: 6, baselineMax: 16, volatility: 1.0 },
  { name: 'light', share: 0.90, baselineMin: 0, baselineMax: 6, volatility: 0.7 },
];

export const ENTITY_POOL_SIZE = 5000;

function buildEntity(index) {
  const rnd = seededRandom(`entity|${index}`);
  let tier = TIERS[TIERS.length - 1];
  const r = rnd();
  let cum = 0;
  for (const t of TIERS) {
    cum += t.share;
    if (r <= cum) { tier = t; break; }
  }
  const eid = makeEnrolmentReferenceId(rnd);
  const aua = pick(rnd, FINANCIAL_AUAS);
  const sa = `2${String(Math.floor(rnd() * 99999)).padStart(9, '0')}`;
  const device = makeDeviceCode(rnd);
  const authType = pick(rnd, AUTH_TYPES);
  const authResult = pick(rnd, AUTH_RESULTS);
  const district = pick(rnd, DISTRICTS);
  const baseline = tier.baselineMin + rnd() * (tier.baselineMax - tier.baselineMin);

  return {
    groupKey: [eid, aua, sa, device, authType, authResult].join('|'),
    fields: { enrolmentReferenceId: eid, aua, sa, deviceCode: device, authType, authResult },
    tier: tier.name,
    baseline,
    volatility: tier.volatility,
    district,
  };
}

let _pool = null;
/** The full 5,000-entity synthetic population, built once and cached. */
export function getEntityPool() {
  if (!_pool) _pool = Array.from({ length: ENTITY_POOL_SIZE }, (_, i) => buildEntity(i));
  return _pool;
}

const _byKey = new Map();
export function findEntityByKey(groupKey) {
  if (_byKey.size === 0) {
    for (const e of getEntityPool()) _byKey.set(e.groupKey, e);
  }
  return _byKey.get(groupKey) || null;
}

/**
 * For a groupKey typed into the exact-ID lookup that ISN'T one of the 5,000
 * pool members (any well-formed key an analyst might paste in) — deterministic,
 * low-activity synthetic entity, matching how real 6-key composites behave:
 * the overwhelming majority of real combinations are one-shot/rarely-repeat,
 * never a "severe" or "moderate" offender (those are rare enough to already
 * be in the ranked pool).
 */
export function syntheticEntityForArbitraryKey(groupKey) {
  const known = findEntityByKey(groupKey);
  if (known) return known;
  const rnd = seededRandom(`arbitrary|${groupKey}`);
  const baseline = rnd() * 4; // 0-4, essentially never breaches (threshold is 10)
  return {
    groupKey,
    fields: null,
    tier: 'light',
    baseline,
    volatility: 0.6,
    district: pick(rnd, DISTRICTS),
  };
}

export { seededRandom };
