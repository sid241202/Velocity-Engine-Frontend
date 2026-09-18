import React from 'react';
import RuleBuilder from './RuleBuilder';

/**
 * RuleBuilderPage — a thin wrapper around RuleBuilder, full width.
 *
 * Used to also split the screen with a persistent RuleBuilderHelper side
 * panel (contextual field tips + a static sample-rule reference). Removed:
 * every field already carries its own inline "?" tooltip with the same
 * guidance, so the side panel mostly duplicated it — and sat empty
 * whenever no field was focused. The one piece of unique content (the
 * sample rule reference) is still available, just opt-in — see the
 * "Rule Reference" button inside RuleBuilder itself.
 */
export default function RuleBuilderPage({ rules, fetchRules, editingRule, onEditComplete, onGoToHistorical, onGoToSummary }) {
  return (
    <RuleBuilder
      rules={rules}
      fetchRules={fetchRules}
      editingRule={editingRule}
      onEditComplete={onEditComplete}
      onGoToHistorical={onGoToHistorical}
      onGoToSummary={onGoToSummary}
    />
  );
}
