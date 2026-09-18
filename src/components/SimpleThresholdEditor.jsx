import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { tryParseExpression, describeNode, OP_WORDS } from '../utils/thresholdExpression';

/**
 * SimpleThresholdEditor — the plain-language alternative to
 * VisualThresholdBuilder's raw AND/OR tree, for Simple mode. Renders one
 * "Alert when [metric] [is greater than] [value]" row per condition, with
 * an AND/OR connector only shown once a second condition is added — no
 * nested groups, no logic-gate dropdowns.
 *
 * Reads/writes the exact same `expression` JEXL string as
 * VisualThresholdBuilder (via tryParseExpression/describeNode, shared with
 * it) so switching Simple/Advanced mid-edit doesn't lose or corrupt what
 * the user already built, as long as it's still a flat AND/OR list — a
 * rule with nested groups just won't round-trip into Simple mode cleanly,
 * which is expected: that's what Advanced mode is for.
 */
export default function SimpleThresholdEditor({ expression, setExpression, aggregations }) {
  const [logic, setLogic] = React.useState('&&');
  const [rules, setRules] = React.useState(() => {
    const parsed = tryParseExpression(expression);
    if (parsed && parsed.children.length > 0 && parsed.children.every(c => c.type === 'RULE')) {
      return parsed.children;
    }
    return [{ type: 'RULE', alias: aggregations[0]?.alias || '', operator: '>', value: '' }];
  });

  React.useEffect(() => {
    if (expression === '') {
      setRules([{ type: 'RULE', alias: aggregations[0]?.alias || '', operator: '>', value: '' }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expression]);

  React.useEffect(() => {
    const parts = rules
      .filter(r => r.alias && r.value !== '' && !isNaN(parseFloat(r.value)))
      .map(r => `(${r.alias} ${r.operator} ${parseFloat(r.value)})`);
    const expr = parts.length === 0 ? '' : parts.length === 1 ? parts[0] : `(${parts.join(` ${logic} `)})`;
    setExpression(expr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, logic]);

  const updateRule = (i, updates) => setRules(rs => rs.map((r, idx) => (idx === i ? { ...r, ...updates } : r)));
  const addRule = () => setRules(rs => [...rs, { type: 'RULE', alias: aggregations[0]?.alias || '', operator: '>', value: '' }]);
  const removeRule = (i) => setRules(rs => rs.filter((_, idx) => idx !== i));

  const plain = describeNode({ type: 'GROUP', logic, children: rules });

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {rules.map((rule, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <select
                  value={logic}
                  onChange={e => setLogic(e.target.value)}
                  style={{ width: 90, fontSize: '0.75rem', fontWeight: 700, color: 'var(--violet-light)', textAlign: 'center' }}
                >
                  <option value="&&">AND</option>
                  <option value="||">OR</option>
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--surface-3)', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-3)', flexShrink: 0 }}>Alert when</span>
              <select value={rule.alias} onChange={e => updateRule(i, { alias: e.target.value })} style={{ flex: '1 1 120px', minWidth: 0 }}>
                <option value="">-- choose a metric --</option>
                {aggregations.map(a => <option key={a.alias} value={a.alias}>{a.alias || '(unnamed)'}</option>)}
              </select>
              <select value={rule.operator} onChange={e => updateRule(i, { operator: e.target.value })} style={{ width: 160, flexShrink: 0 }}>
                {Object.entries(OP_WORDS).map(([op, label]) => <option key={op} value={op}>{label}</option>)}
              </select>
              <input
                type="number"
                value={rule.value}
                onChange={e => updateRule(i, { value: e.target.value })}
                placeholder="value"
                style={{ width: 90, flexShrink: 0 }}
              />
              {rules.length > 1 && (
                <button type="button" className="btn btn-danger" style={{ padding: '0.35rem 0.5rem', flexShrink: 0 }} onClick={() => removeRule(i)}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>

      <button type="button" className="btn btn-ghost" style={{ fontSize: '0.76rem', marginTop: '0.6rem' }} onClick={addRule}>
        <Plus size={12} /> Add another condition
      </button>

      {plain && (
        <div style={{ marginTop: '1rem', padding: '0.6rem 0.75rem', background: 'var(--success-subtle)', border: '1px solid rgba(63,185,80,0.2)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', color: 'var(--text-1)', lineHeight: 1.5 }}>
          <strong>In plain terms:</strong> alert when {plain}.
        </div>
      )}
    </div>
  );
}
