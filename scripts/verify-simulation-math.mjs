#!/usr/bin/env node
/**
 * verify-simulation-math.mjs — independently checks that the simulation's
 * aggregation math is actually correct, not just that the UI renders
 * something plausible.
 *
 * For every rule in src/simulation/rules.js, this script:
 *   1. Picks a real "severe" tier entity from that rule's entity pool.
 *   2. Generates the ground-truth raw events for one fixed window
 *      (generateRawEventsForWindow — the same function the app itself uses
 *      to derive that window's aggregation result).
 *   3. Reduces those raw events to the expected metric value using its OWN
 *      independently-written logic (a plain Set().size for DISTINCT rules,
 *      a plain .length for COUNT rules) — NOT by calling
 *      computeEntityWindowStats.
 *   4. Compares that independent answer against what the app's own
 *      computeEntityWindowStats/generateGroupDetail/generateTopGroups
 *      functions return for the identical entity+window.
 *   5. Also does a multi-window rollup check (sum of 60 independently
 *      re-derived 1-minute windows across a full hour) against
 *      generateGroupDetail's and generateTopGroups' own totals for that
 *      same entity+range, to catch rollup/pagination bugs a single-window
 *      check wouldn't.
 *
 * The chosen anchor window is a FIXED calendar timestamp (2026-09-18
 * 10:00:00 IST — a recent business-hours instant, not the modeled August
 * 2026 dataset date; the Aggregated Analysis panel's own "From can't be
 * more than 7 days ago" validation is relative to real wall-clock now, and
 * the traffic-shape model itself is keyed off hour-of-day, not calendar
 * date, so any recent date exercises identical math) rather than "now" — so
 * this script's output can be cross-checked against the live running app's
 * Aggregated Analysis panel by entering the exact same From/To range and
 * exact-ID entity key, with no synchronization/timing concerns. See
 * BUSINESS_RULES_UI_GUIDE.md's "Verifying the simulation's math" section
 * for the paired browser-side walkthrough using these exact numbers.
 *
 * Run with:  node scripts/verify-simulation-math.mjs
 */
import { RULES } from '../src/simulation/rules.js';
import { getEntityPool } from '../src/simulation/entities.js';
import { generateRawEventsForWindow, computeEntityWindowStats, generateGroupDetail, generateTopGroups } from '../src/simulation/dataGenerators.js';

// Anchor must be within the Aggregated Analysis panel's own "up to 7 days
// ago" range validation, which is relative to REAL wall-clock now — not an
// August 2026 date (that's only where the volume/cardinality PROFILE comes
// from; the traffic-shape model itself is keyed off hour-of-day, not
// calendar date, so any recent date exercises the identical math).
const ANCHOR_MS = Date.UTC(2026, 8, 18, 4, 30, 0); // 2026-09-18 10:00:00 IST
const RANGE_FROM_MS = ANCHOR_MS - 30 * 60 * 1000;   // 09:30 IST
const RANGE_TO_MS = ANCHOR_MS + 30 * 60 * 1000;     // 10:30 IST
const MINUTE_MS = 60 * 1000;

let failures = 0;
let checks = 0;

function assertEqual(label, expected, actual) {
  checks += 1;
  const pass = expected === actual;
  if (!pass) failures += 1;
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}: expected=${expected} actual=${actual}`);
  return pass;
}

/** Independent reduction over raw events — deliberately NOT calling computeEntityWindowStats. */
function independentAggregate(rule, events) {
  if (rule.aggregation.function === 'DISTINCT') {
    const seen = new Set();
    for (const e of events) seen.add(e[rule.aggregation.fieldKey]);
    return seen.size;
  }
  return events.length; // COUNT
}

function pickFiringSevereEntity(rule, windowMs) {
  const pool = getEntityPool(rule);
  for (const e of pool) {
    if (e.tier !== 'severe') continue;
    if (generateRawEventsForWindow(rule, e, windowMs).length > 0) return e;
  }
  throw new Error(`no firing severe-tier entity found for ${rule.id} at the anchor window — widen the search or pick a different anchor`);
}

console.log('='.repeat(88));
console.log('Velocity Engine simulation — independent math verification');
console.log(`Anchor window start : ${new Date(ANCHOR_MS).toISOString()}  (2026-09-18 10:00:00 IST)`);
console.log(`Full check range    : ${new Date(RANGE_FROM_MS).toISOString()} .. ${new Date(RANGE_TO_MS).toISOString()}  (1 hour, 1-min buckets)`);
console.log('='.repeat(88));

const entitiesForBrowserCheck = [];

for (const rule of RULES) {
  console.log(`\n--- ${rule.name}  (${rule.id})`);
  console.log(`    legacy ruleId ${rule.legacyRuleId}, aggregation ${rule.aggregation.function} on ${rule.aggregation.fieldKey ?? rule.aggregation.field}, window ${rule.windowSizeMs / 60000}min, threshold >= ${rule.threshold}`);

  const entity = pickFiringSevereEntity(rule, ANCHOR_MS);
  console.log(`    Entity under test: ${entity.groupKey}`);
  entitiesForBrowserCheck.push({ ruleId: rule.id, ruleName: rule.name, groupKey: entity.groupKey });

  // ── 1. Single-window exact check ──────────────────────────────────────
  const rawEvents = generateRawEventsForWindow(rule, entity, ANCHOR_MS);
  const independentValue = independentAggregate(rule, rawEvents);
  const independentBreach = independentValue >= rule.threshold;

  const appStats = computeEntityWindowStats(rule, entity, ANCHOR_MS);
  console.log(`    Raw events generated for this window: ${rawEvents.length}`);
  assertEqual(`single-window ${rule.aggregation.alias}`, independentValue, appStats.metricValue);
  assertEqual('single-window breached flag', independentBreach, appStats.breached);

  const singleRow = generateGroupDetail(rule.id, entity.groupKey, ANCHOR_MS, ANCHOR_MS);
  assertEqual('generateGroupDetail row count for this exact window', 1, singleRow.length);
  if (singleRow.length === 1) {
    assertEqual(`generateGroupDetail row's ${rule.aggregation.alias}`, independentValue, singleRow[0].aggResult[rule.aggregation.alias]);
    assertEqual('generateGroupDetail row thresholdBreached', independentBreach, singleRow[0].thresholdBreached);
  }

  // ── 2. Multi-window rollup check (61x 1-min buckets across the hour) ──
  // Inclusive of BOTH endpoints, matching generateGroupDetail's own
  // start/end computation (Math.floor(fromMs/step)*step .. Math.floor(toMs/step)*step,
  // walked with t >= start) — since RANGE_FROM_MS/RANGE_TO_MS both land
  // exactly on 1-minute boundaries, that's 61 buckets (:00 through :60), not 60.
  let independentTotalWindows = 0;
  let independentBreachedWindows = 0;
  for (let t = RANGE_FROM_MS; t <= RANGE_TO_MS; t += MINUTE_MS) {
    const events = generateRawEventsForWindow(rule, entity, t);
    if (events.length === 0) continue;
    independentTotalWindows += 1;
    if (independentAggregate(rule, events) >= rule.threshold) independentBreachedWindows += 1;
  }

  const detailRows = generateGroupDetail(rule.id, entity.groupKey, RANGE_FROM_MS, RANGE_TO_MS);
  const detailBreached = detailRows.filter(r => r.thresholdBreached).length;
  assertEqual('generateGroupDetail total rows over the hour', independentTotalWindows, detailRows.length);
  assertEqual('generateGroupDetail breached rows over the hour', independentBreachedWindows, detailBreached);

  const { groups: topGroups } = generateTopGroups(rule.id, RANGE_FROM_MS, RANGE_TO_MS, { limit: 200, offset: 0 });
  const ranked = topGroups.find(g => g.groupKey === entity.groupKey);
  if (!ranked) {
    failures += 1;
    checks += 1;
    console.log(`  [FAIL] entity should appear in top-groups ranking for this range (severe tier, ${independentBreachedWindows} breaches) but was not found in top 200`);
  } else {
    assertEqual('generateTopGroups totalWindows for this entity', independentTotalWindows, ranked.totalWindows);
    assertEqual('generateTopGroups breachedWindows for this entity', independentBreachedWindows, ranked.breachedWindows);
  }
}

console.log('\n' + '='.repeat(88));
console.log(`${checks - failures}/${checks} checks passed`);
console.log('='.repeat(88));

console.log('\nFor the paired browser-side check, open Analytics (Aggregated Rule Analysis),');
console.log('set From = 2026-09-18 09:30, To = 2026-09-18 10:30 (IST), select each rule below,');
console.log('paste the entity key into the exact-ID lookup box, and confirm the numbers above');
console.log('match what the panel displays for the 10:00 IST window and for the full-hour totals:\n');
for (const e of entitiesForBrowserCheck) {
  console.log(`  ${e.ruleName}`);
  console.log(`    rule_id: ${e.ruleId}`);
  console.log(`    entity key: ${e.groupKey}\n`);
}

process.exit(failures > 0 ? 1 : 0);
