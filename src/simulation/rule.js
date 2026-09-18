/**
 * rule.js — the one hardcoded, already-ACTIVE rule this simulation branch
 * ships with: Rule 5 from BUSINESS_RULES_UI_GUIDE.md
 * (`finger-6key-failure-count-5min`), chosen because it's the single most
 * complex rule in that guide — 6 grouping keys, 4 filter conditions, and by
 * far the highest live cardinality of the seven finger-auth fraud rules
 * (~630,000 concurrent groups at August 2026 peak traffic, see
 * PRODUCTION_CAPACITY_SPECS.txt section 2.3). The exact rule JSON below
 * matches what the real Rule Builder UI produces for this rule — field
 * paths from src/constants/eventFields.js, operator/threshold shapes from
 * VisualFilterBuilder.jsx/thresholdExpression.js, not hand-approximated.
 */

export const SIM_RULE_ID = 'finger-6key-failure-count-5min';

// The event-time window this rule evaluates on.
export const WINDOW_SIZE_MS = 5 * 60 * 1000;

// Alert threshold from the guide: failed_count >= 10.
export const FAIL_COUNT_THRESHOLD = 10;

/** Mirrors having_thresholds.expression below. */
export function evaluateBreach(failedCount) {
  return failedCount >= FAIL_COUNT_THRESHOLD;
}

export function makeSimRule() {
  return {
    rule_metadata: {
      rule_id: SIM_RULE_ID,
      rule_name: 'High Failure — Resident+AUA+SA+Device+Type+Result (Finger Auth)',
      status: 'ACTIVE',
      severity_level: 'HIGH',
      penalty_ttl_seconds: 3600,
    },
    execution_routing: { target_source_topic: 'BI.AUTH.AUTH_TXN.UNION.V1' },
    filters: {
      type: 'group',
      logic: 'AND',
      conditions: [
        { type: 'condition', field: '_data.authType', operator: 'CONTAINS', value: 'F' },
        { type: 'condition', field: '_data.authResult', operator: 'NOT_EQUALS', value: 'Y' },
        { type: 'condition', field: '_data.errorCode', operator: 'EQUALS', value: 300 },
        { type: 'condition', operator: 'IS_FINANCIAL_AUA' },
      ],
    },
    grouping: {
      keys: [
        '_data.enrolmentReferenceId',
        '_data.aua',
        '_data.sa',
        '_data.deviceCode',
        '_data.authType',
        '_data.authResult',
      ],
      entity_name: 'Resident+AUA+SA+Device+Type+Result',
    },
    windowing: {
      type: 'SLIDING',
      time_type: 'EVENT_TIME',
      timestamp_field: '_event_timestamp',
      timestamp_format: 'ISO_STRING',
      use_kafka_timestamp: false,
      size_ms: WINDOW_SIZE_MS,
      slide_ms: 60 * 1000,
      allowed_lateness_ms: 0,
      alignment_offset_ms: 0,
    },
    aggregations: [
      { alias: 'failed_count', field: '_event_id', function: 'COUNT', cardinality_hint: 'LOW' },
    ],
    having_thresholds: {
      expression: `(failed_count >= ${FAIL_COUNT_THRESHOLD})`,
    },
    sinks: {
      agg_sink_enabled: true,
      anomaly_sink_enabled: true,
      anomaly_store_sink_enabled: true,
    },
  };
}
