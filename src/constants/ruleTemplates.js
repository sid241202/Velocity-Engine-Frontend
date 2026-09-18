/**
 * ruleTemplates.js — starting points for the guided Rule Builder flow.
 * Each one is a real, working rule configuration for a common detection
 * pattern, using the same real UIDAI schema field names the rest of the
 * app uses (src/constants/eventFields.js) — not placeholders. Picking one
 * pre-fills the whole form; the user still reviews and adjusts every
 * value, this just replaces "start from a blank form" with "start from
 * something that already makes sense."
 */
import { Repeat, TrendingUp, Fingerprint, Globe2 } from 'lucide-react';

export const RULE_TEMPLATES = [
  {
    id: 'repeat-attempts',
    icon: Repeat,
    iconColor: 'var(--violet-light)',
    title: 'Too many attempts from one AUA',
    description: 'Flags an AUA that racks up an unusually high number of authentication attempts in a short window.',
    values: {
      ruleName: 'High Attempt Volume per AUA',
      severity: 'HIGH',
      isGlobal: false,
      keys: ['_data.aua'],
      entityName: 'AUA Code',
      filterTree: { type: 'group', logic: 'AND', conditions: [] },
      aggregations: [{ alias: 'attempt_count', field: '_data.authCode', function: 'COUNT', cardinality_hint: 'LOW' }],
      jexlExpression: '(attempt_count > 20)',
    },
  },
  {
    id: 'failure-spike',
    icon: TrendingUp,
    iconColor: 'var(--danger)',
    title: 'Unusual spike in failed auths',
    description: 'Watches a Sub-AUA for a burst of failed authentication results — often the first sign of a credential-stuffing or bypass attempt.',
    values: {
      ruleName: 'Failed Auth Spike per Sub-AUA',
      severity: 'HIGH',
      isGlobal: false,
      keys: ['_data.sa'],
      entityName: 'Sub-AUA',
      filterTree: { type: 'group', logic: 'AND', conditions: [{ type: 'condition', field: '_data.authResult', operator: 'NOT_EQUALS', value: 'Y' }] },
      aggregations: [{ alias: 'fail_count', field: '_data.authResult', function: 'COUNT', cardinality_hint: 'LOW' }],
      jexlExpression: '(fail_count > 15)',
    },
  },
  {
    id: 'device-reuse',
    icon: Fingerprint,
    iconColor: 'var(--teal)',
    title: 'Suspicious device reuse',
    description: 'Flags a device being used to authenticate an unusually large number of different residents — a common signature of device farming.',
    values: {
      ruleName: 'Device Reuse Across Many Residents',
      severity: 'CRITICAL',
      isGlobal: false,
      keys: ['_data.deviceCode'],
      entityName: 'Device',
      filterTree: { type: 'group', logic: 'AND', conditions: [] },
      aggregations: [{ alias: 'unique_residents', field: '_data.hashUID', function: 'COUNT_DISTINCT', cardinality_hint: 'HIGH' }],
      jexlExpression: '(unique_residents > 10)',
    },
  },
  {
    id: 'global-volume',
    icon: Globe2,
    iconColor: 'var(--amber)',
    title: 'Overall traffic volume',
    description: "Tracks total authentication volume across everyone — no per-entity breakdown, just a system-wide count. Good for capacity/volume alerts rather than fraud detection.",
    values: {
      ruleName: 'Overall Auth Volume',
      severity: 'MEDIUM',
      isGlobal: true,
      keys: ['_data.aua'],
      entityName: 'Global Auth Traffic',
      filterTree: { type: 'group', logic: 'AND', conditions: [] },
      aggregations: [{ alias: 'total_events', field: '_data.authCode', function: 'COUNT', cardinality_hint: 'LOW' }],
      jexlExpression: '(total_events > 500)',
    },
  },
];
