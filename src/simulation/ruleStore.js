/**
 * ruleStore.js — the in-memory rule list. Starts with the four rules being
 * deployed to office prod (RULES_TO_DEPLOY_12_14_16_17.txt / rules.js),
 * all already ACTIVE. Rule Builder's Save/Publish/Pause/Delete actions
 * mutate this array directly so the UI shows real feedback instead of
 * being read-only.
 */
import { RULES, makeSimRule } from './rules.js';

export const rules = RULES.map(makeSimRule);

let nextDraftSeq = 1;

function findIndex(ruleId) {
  return rules.findIndex(r => r.rule_metadata.rule_id === ruleId);
}

export function createRule(payload) {
  const rule_id = payload?.rule_metadata?.rule_id || `sim-rule-${nextDraftSeq++}`;
  const rule = { ...payload, rule_metadata: { ...payload.rule_metadata, rule_id, status: 'DRAFT' } };
  rules.push(rule);
  return rule;
}

export function updateRule(ruleId, payload) {
  const idx = findIndex(ruleId);
  if (idx === -1) throw new Error('Rule not found');
  rules[idx] = { ...payload, rule_metadata: { ...payload.rule_metadata, rule_id: ruleId } };
  return rules[idx];
}

export function publishRule(ruleId) {
  const idx = findIndex(ruleId);
  if (idx === -1) throw new Error('Rule not found');
  rules[idx].rule_metadata.status = 'ACTIVE';
  return rules[idx];
}

export function setRuleStatus(ruleId, status) {
  const idx = findIndex(ruleId);
  if (idx === -1) throw new Error('Rule not found');
  rules[idx].rule_metadata.status = status;
  return rules[idx];
}

export function deleteRule(ruleId) {
  const idx = findIndex(ruleId);
  if (idx === -1) throw new Error('Rule not found');
  rules.splice(idx, 1);
}

export function getRule(ruleId) {
  return rules.find(r => r.rule_metadata.rule_id === ruleId) || null;
}
