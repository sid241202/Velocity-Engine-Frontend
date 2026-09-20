/**
 * rules.js — the full set of rules this simulation branch ships with,
 * matching E:\Projects\RULES_TO_DEPLOY_12_14_16_17.txt (the office-prod
 * deployment runbook) exactly: legacy ruleIds 12, 14, 16, 17 from
 * BUSINESS_RULES_UI_GUIDE.md (that guide's own Rule 1, 3, 5, 6
 * respectively). Superseded a single-rule design (Rule 5/16 only) so the
 * simulation now demonstrates the full deployed set, not one example.
 *
 * Each entry's rule JSON shape matches what the real Rule Builder UI
 * produces — field paths from src/constants/eventFields.js, operator/
 * threshold shapes from VisualFilterBuilder.jsx/thresholdExpression.js —
 * not hand-approximated. `groupingFieldKeys` (local, no `_data.` prefix) is
 * what entities.js/dataGenerators.js use internally; `keys` (real
 * `_data.`-prefixed paths, same order) is what goes into the rule JSON
 * grouping.keys, matching the real Flink job's KeysExtractor.getKey
 * pipe-join order exactly.
 */

const financialAuaCondition = { type: 'condition', operator: 'IS_FINANCIAL_AUA' };
const fingerAuthCondition = { type: 'condition', field: '_data.authType', operator: 'CONTAINS', value: 'F' };
const notSuccessCondition = { type: 'condition', field: '_data.authResult', operator: 'NOT_EQUALS', value: 'Y' };

export const RULES = [
  {
    id: 'finger-aua-velocity-5min',
    name: 'More Than 5 AUAs in 5 Min (Finger Auth)',
    legacyRuleId: 12,
    legacyRuleName: 'MoreThan5AuaIn5Min',
    entityLabel: 'Resident + Device',
    groupingFieldKeys: ['enrolmentReferenceId', 'deviceCode'],
    keys: ['_data.enrolmentReferenceId', '_data.deviceCode'],
    filterConditions: [fingerAuthCondition, financialAuaCondition],
    windowSizeMs: 5 * 60 * 1000,
    slideMs: 60 * 1000,
    aggregation: { alias: 'distinct_aua', field: '_data.aua', fieldKey: 'aua', function: 'DISTINCT', cardinalityHint: 'LOW' },
    threshold: 5,
    // Real cardinality of aua system-wide is 233 (PRODUCTION_CAPACITY_SPECS.txt
    // §1.1), but every event here is pre-filtered to IS_FINANCIAL_AUA, so the
    // reachable pool for this rule's DISTINCT count is the 131-code financial
    // allow-list, not the full 233 — see entities.js FINANCIAL_AUAS.
    modeledPeakConcurrentGroups: 600_000, // PRODUCTION_CAPACITY_SPECS.txt §2.3, rule 12
  },
  {
    id: 'finger-resident-device-distinct-sa-3min',
    name: 'More Than 3 SAs in 3 Min (Finger Auth)',
    legacyRuleId: 14,
    legacyRuleName: 'NpciMoreThan5SaIn5Min',
    entityLabel: 'Resident + Device',
    groupingFieldKeys: ['enrolmentReferenceId', 'deviceCode'],
    keys: ['_data.enrolmentReferenceId', '_data.deviceCode'],
    filterConditions: [fingerAuthCondition, financialAuaCondition],
    windowSizeMs: 3 * 60 * 1000,
    slideMs: 60 * 1000,
    aggregation: { alias: 'distinct_sa', field: '_data.sa', fieldKey: 'sa', function: 'DISTINCT', cardinalityHint: 'LOW' },
    threshold: 3,
    modeledPeakConcurrentGroups: 360_000, // PRODUCTION_CAPACITY_SPECS.txt §2.3, rule 14
  },
  {
    id: 'finger-6key-failure-count-5min',
    name: 'High Failure — Resident+AUA+SA+Device+Type+Result (Finger Auth)',
    legacyRuleId: 16,
    legacyRuleName: 'High_Failure_Device_Aua_Rule',
    entityLabel: 'Resident+AUA+SA+Device+Type+Result',
    groupingFieldKeys: ['enrolmentReferenceId', 'aua', 'sa', 'deviceCode', 'authType', 'authResult'],
    keys: ['_data.enrolmentReferenceId', '_data.aua', '_data.sa', '_data.deviceCode', '_data.authType', '_data.authResult'],
    filterConditions: [
      fingerAuthCondition,
      notSuccessCondition,
      { type: 'condition', field: '_data.errorCode', operator: 'EQUALS', value: 300 },
      financialAuaCondition,
    ],
    windowSizeMs: 5 * 60 * 1000,
    slideMs: 60 * 1000,
    aggregation: { alias: 'failed_count', field: '_event_id', fieldKey: 'eventId', function: 'COUNT', cardinalityHint: 'LOW' },
    threshold: 10,
    modeledPeakConcurrentGroups: 630_000, // PRODUCTION_CAPACITY_SPECS.txt §2.3, rule 16 — highest in the set
  },
  {
    id: 'finger-device-failure-count-5min',
    name: 'High Failure Count per Device (Finger Auth)',
    legacyRuleId: 17,
    legacyRuleName: 'HighFailureOnDevice',
    entityLabel: 'Device',
    groupingFieldKeys: ['deviceCode'],
    keys: ['_data.deviceCode'],
    filterConditions: [fingerAuthCondition, notSuccessCondition, financialAuaCondition],
    windowSizeMs: 5 * 60 * 1000,
    slideMs: 60 * 1000,
    aggregation: { alias: 'failed_count', field: '_event_id', fieldKey: 'eventId', function: 'COUNT', cardinalityHint: 'LOW' },
    threshold: 75,
    modeledPeakConcurrentGroups: 19_000, // PRODUCTION_CAPACITY_SPECS.txt §2.3, rule 17 — device-only, lowest here
  },
];

const _byId = new Map(RULES.map(r => [r.id, r]));

export function getRule(ruleId) {
  return _byId.get(ruleId) || null;
}

export function evaluateBreach(rule, metricValue) {
  return metricValue >= rule.threshold;
}

export function makeSimRule(rule) {
  return {
    rule_metadata: {
      rule_id: rule.id,
      rule_name: rule.name,
      status: 'ACTIVE',
      severity_level: 'HIGH',
      penalty_ttl_seconds: 3600,
    },
    execution_routing: { target_source_topic: 'BI.AUTH.AUTH_TXN.UNION.V1' },
    filters: { type: 'group', logic: 'AND', conditions: rule.filterConditions },
    grouping: { keys: rule.keys, entity_name: rule.entityLabel },
    windowing: {
      type: 'SLIDING',
      time_type: 'EVENT_TIME',
      timestamp_field: '_event_timestamp',
      timestamp_format: 'ISO_STRING',
      use_kafka_timestamp: false,
      size_ms: rule.windowSizeMs,
      slide_ms: rule.slideMs,
      allowed_lateness_ms: 0,
      alignment_offset_ms: 0,
    },
    aggregations: [
      { alias: rule.aggregation.alias, field: rule.aggregation.field, function: rule.aggregation.function, cardinality_hint: rule.aggregation.cardinalityHint },
    ],
    having_thresholds: {
      expression: `(${rule.aggregation.alias} >= ${rule.threshold})`,
    },
    sinks: {
      agg_sink_enabled: true,
      anomaly_sink_enabled: true,
      anomaly_store_sink_enabled: true,
    },
  };
}
