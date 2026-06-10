import React, { useState } from 'react';
import RuleBuilder from './RuleBuilder';
import RuleBuilderHelper from './RuleBuilderHelper';

export default function RuleBuilderPage({ rules, fetchRules }) {
  const [focusedField, setFocusedField] = useState(null);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem' }}>
      <div>
        <RuleBuilder rules={rules} fetchRules={fetchRules} onFieldFocus={setFocusedField} />
      </div>
      <div>
        <RuleBuilderHelper focusedField={focusedField} />
      </div>
    </div>
  );
}
