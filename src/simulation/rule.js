/**
 * rule.js — the one hardcoded, already-ACTIVE rule this simulation branch
 * ships with. Deliberately built to exercise every rule-definition feature
 * the UI offers in a single, realistic configuration: a compound AND/OR
 * filter tree, a 2-condition JEXL threshold expression, a sliding window on
 * a custom event-time field (not the Kafka default — this is what triggers
 * HistoricalAnalysis.jsx's "this replay uses ingestion time instead" banner),
 * and three aggregations across COUNT and COUNT_DISTINCT.
 *
 * Field names are real UIDAI auth-schema paths from
 * src/constants/eventFields.js — not placeholders.
 */

export const SIM_RULE_ID = 'rule-otp-bio-velocity-ring-001';

export const SIM_ENTITIES = [
  'SA-0231', 'SA-0459', 'SA-0512', 'SA-0687',
  'SA-0734', 'SA-0812', 'SA-0958', 'SA-1023',
];

// Per-entity baseline "abuse intensity" — deterministic, not random, so the
// same entity is consistently the worst offender across every panel instead
// of the ranking reshuffling on every reload.
export const SIM_ENTITY_PROFILE = {
  'SA-0231': { baseline: 34, volatility: 1.4 }, // worst offender — repeat breacher
  'SA-0459': { baseline: 28, volatility: 1.2 },
  'SA-0512': { baseline: 9,  volatility: 0.6 },
  'SA-0687': { baseline: 22, volatility: 1.1 },
  'SA-0734': { baseline: 6,  volatility: 0.5 },
  'SA-0812': { baseline: 15, volatility: 0.9 },
  'SA-0958': { baseline: 4,  volatility: 0.4 }, // stays clean almost always
  'SA-1023': { baseline: 19, volatility: 1.0 },
};

// Thresholds mirrored in having_thresholds.expression below — kept as plain
// numbers here too so the data generators can compute the same breach
// decision in JS without needing a real JEXL evaluator.
export const FAIL_COUNT_THRESHOLD = 25;
export const UNIQUE_RESIDENTS_THRESHOLD = 10;
export const UNIQUE_DEVICES_THRESHOLD = 15;

/** Mirrors the JEXL expression below: (fail_count > 25 && unique_residents > 10) || unique_devices > 15 */
export function evaluateBreach({ fail_count, unique_residents, unique_devices }) {
  return (fail_count > FAIL_COUNT_THRESHOLD && unique_residents > UNIQUE_RESIDENTS_THRESHOLD)
    || unique_devices > UNIQUE_DEVICES_THRESHOLD;
}

export function makeSimRule() {
  return {
    rule_metadata: {
      rule_id: SIM_RULE_ID,
      rule_name: 'OTP & Biometric Velocity Abuse — Multi-District Ring Detector',
      status: 'ACTIVE',
      severity_level: 'CRITICAL',
      penalty_ttl_seconds: 900,
    },
    execution_routing: { target_source_topic: 'BI.AUTH.AUTH_TXN.UNION.V1' },
    filters: {
      type: 'group',
      logic: 'AND',
      conditions: [
        { type: 'condition', field: '_data.authType', operator: 'IN', value: ['OTP', 'BIO'] },
        { type: 'condition', field: '_data.authResult', operator: 'NOT_EQUALS', value: 'Y' },
      ],
    },
    grouping: {
      keys: ['_data.sa'],
      entity_name: 'Sub-AUA (SA)',
    },
    windowing: {
      type: 'SLIDING',
      time_type: 'EVENT_TIME',
      timestamp_field: '_event_timestamp',
      timestamp_format: 'ISO_STRING',
      use_kafka_timestamp: false,
      size_ms: 5 * 60 * 1000,
      slide_ms: 60 * 1000,
      allowed_lateness_ms: 5000,
      alignment_offset_ms: 0,
    },
    aggregations: [
      { alias: 'fail_count', field: '_data.txn', function: 'COUNT', cardinality_hint: '' },
      { alias: 'unique_residents', field: '_data.hashUID', function: 'COUNT_DISTINCT', cardinality_hint: 'HIGH' },
      { alias: 'unique_devices', field: '_data.deviceCode', function: 'COUNT_DISTINCT', cardinality_hint: 'MEDIUM' },
    ],
    having_thresholds: {
      expression: `(fail_count > ${FAIL_COUNT_THRESHOLD} && unique_residents > ${UNIQUE_RESIDENTS_THRESHOLD}) || unique_devices > ${UNIQUE_DEVICES_THRESHOLD}`,
    },
    sinks: {
      agg_sink_enabled: true,
      anomaly_sink_enabled: true,
      anomaly_store_sink_enabled: true,
    },
  };
}
