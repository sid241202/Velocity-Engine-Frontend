export const RULE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899'
];

export const getRuleColor = (rules, ruleId) => {
  const idx = rules.findIndex(r => r.rule_metadata.rule_id === ruleId);
  return idx < 0 ? '#888888' : RULE_COLORS[idx % RULE_COLORS.length];
};
