/**
 * VisualFilterBuilder.jsx
 *
 * Supports operators:
 *   - Standard: EQUALS, NOT_EQUALS, GREATER_THAN, GREATER_THAN_EQUAL, LESS_THAN,
 *               LESS_THAN_EQUAL, IN, REGEX, CONTAINS, NOT_CONTAINS, STARTS_WITH, ENDS_WITH
 *   - Null checks: IS_NULL, IS_NOT_NULL  (no value field required)
 *   - Date/Time:   DATE_BEFORE, DATE_AFTER, DATE_EQUALS  (requires format picker: EPOCH_MILLIS | ISO_STRING)
 */
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

// ─── Operator Groups ──────────────────────────────────────────────────────────
const STANDARD_OPERATORS = [
  'EQUALS', 'NOT_EQUALS',
  'GREATER_THAN', 'GREATER_THAN_EQUAL',
  'LESS_THAN', 'LESS_THAN_EQUAL',
  'IN', 'REGEX',
  'CONTAINS', 'NOT_CONTAINS',
  'STARTS_WITH', 'ENDS_WITH',
];

const NULL_OPERATORS = ['IS_NULL', 'IS_NOT_NULL'];

const DATE_OPERATORS = ['DATE_BEFORE', 'DATE_AFTER', 'DATE_EQUALS'];

const ALL_OPERATORS = [...STANDARD_OPERATORS, ...NULL_OPERATORS, ...DATE_OPERATORS];

/** Returns true if the operator requires NO value input */
const isNullOp = (op) => NULL_OPERATORS.includes(op?.toUpperCase());

/** Returns true if the operator is a date/time comparison */
const isDateOp = (op) => DATE_OPERATORS.includes(op?.toUpperCase());

// ─── processFilterTree (exported — called by RuleBuilder before submit) ───────
/**
 * Recursively cleans filter tree values before submission:
 * - IS_NULL / IS_NOT_NULL → remove value and format
 * - DATE_* → keep value as string, attach format
 * - IN → split comma string into array
 * - Others → coerce numeric strings to Number
 */
export function processFilterTree(node) {
  if (!node) return node;
  const clone = JSON.parse(JSON.stringify(node));

  const process = (n) => {
    if (n.type === 'group') {
      if (n.conditions) n.conditions = n.conditions.map(process);
      return n;
    }

    // Null-check operators — strip value entirely
    if (isNullOp(n.operator)) {
      delete n.value;
      delete n.format;
      return n;
    }

    // Date operators — keep value as-is (string); preserve format field
    if (isDateOp(n.operator)) {
      // format is already on the node; nothing to coerce
      return n;
    }

    // IN operator
    if (n.operator === 'IN') {
      if (typeof n.value === 'string') {
        n.value = n.value.split(',').map(v => {
          const trimmed = v.trim();
          if (trimmed !== '' && !isNaN(trimmed)) return Number(trimmed);
          return trimmed;
        });
      }
      return n;
    }

    // All others: coerce numeric string to Number
    if (n.operator !== 'REGEX' && typeof n.value === 'string' && n.value !== '' && !isNaN(n.value)) {
      n.value = Number(n.value);
    }
    return n;
  };

  return process(clone);
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function VisualFilterBuilder({ filterTree, setFilterTree }) {

  const updateNode = (path, updates) => {
    const newTree = JSON.parse(JSON.stringify(filterTree));
    let curr = newTree;
    for (let i = 0; i < path.length - 1; i++) {
      curr = curr.conditions[path[i]];
    }
    if (path.length > 0) {
      const idx = path[path.length - 1];
      curr.conditions[idx] = { ...curr.conditions[idx], ...updates };
    } else {
      Object.assign(newTree, updates);
    }
    setFilterTree(newTree);
  };

  const addCondition = (path) => {
    const newTree = JSON.parse(JSON.stringify(filterTree));
    let curr = newTree;
    for (let i = 0; i < path.length; i++) curr = curr.conditions[path[i]];
    if (!curr.conditions) curr.conditions = [];
    curr.conditions.push({ type: 'condition', field: '', operator: 'EQUALS', value: '' });
    setFilterTree(newTree);
  };

  const addGroup = (path) => {
    const newTree = JSON.parse(JSON.stringify(filterTree));
    let curr = newTree;
    for (let i = 0; i < path.length; i++) curr = curr.conditions[path[i]];
    if (!curr.conditions) curr.conditions = [];
    curr.conditions.push({
      type: 'group',
      logic: 'AND',
      conditions: [{ type: 'condition', field: '', operator: 'EQUALS', value: '' }]
    });
    setFilterTree(newTree);
  };

  const removeNode = (path) => {
    if (path.length === 0) return;
    const newTree = JSON.parse(JSON.stringify(filterTree));
    let curr = newTree;
    for (let i = 0; i < path.length - 1; i++) curr = curr.conditions[path[i]];
    curr.conditions.splice(path[path.length - 1], 1);
    setFilterTree(newTree);
  };

  const renderNode = (node, path) => {
    if (node.type === 'group') {
      return (
        <div
          key={path.join('-') || 'root'}
          style={{
            borderLeft: '2px solid var(--primary)',
            marginLeft: path.length > 0 ? '1rem' : '0',
            paddingLeft: '1rem',
            marginBottom: '0.5rem',
            marginTop: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
            <select
              value={node.logic}
              onChange={e => updateNode(path, { logic: e.target.value })}
              style={{ width: '80px', padding: '0.2rem', margin: 0 }}
            >
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </select>
            <button type="button" className="btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
              onClick={() => addCondition(path)}>
              <Plus size={12} /> Condition
            </button>
            <button type="button" className="btn btn-accent" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
              onClick={() => addGroup(path)}>
              <Plus size={12} /> Group
            </button>
            {path.length > 0 && (
              <button type="button" className="btn" style={{ background: 'var(--danger)', padding: '0.3rem 0.6rem' }}
                onClick={() => removeNode(path)}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
          {node.conditions && node.conditions.map((child, i) => renderNode(child, [...path, i]))}
        </div>
      );
    }

    // ── Condition row ────────────────────────────────────────────────────────
    const op = node.operator || 'EQUALS';
    const showValue = !isNullOp(op);
    const showDateFormat = isDateOp(op);

    return (
      <div
        key={path.join('-')}
        style={{
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
          flexWrap: 'wrap',
          background: 'rgba(255,255,255,0.05)',
          padding: '0.5rem',
          borderRadius: '4px',
          marginBottom: '0.25rem',
        }}
      >
        {/* Field */}
        <input
          type="text"
          placeholder="Field (e.g. _data.aua)"
          value={node.field || ''}
          onChange={e => updateNode(path, { field: e.target.value })}
          style={{ flex: 2, minWidth: '120px', margin: 0 }}
        />

        {/* Operator */}
        <select
          value={op}
          onChange={e => {
            const newOp = e.target.value;
            const updates = { operator: newOp };
            // Clear value when switching to null op
            if (isNullOp(newOp)) {
              updates.value = undefined;
              updates.format = undefined;
            }
            // Set default format when switching to date op
            if (isDateOp(newOp) && !isDateOp(op)) {
              updates.format = 'EPOCH_MILLIS';
            }
            // Clear format when switching away from date op
            if (!isDateOp(newOp) && isDateOp(op)) {
              updates.format = undefined;
            }
            updateNode(path, updates);
          }}
          style={{ flex: 1, minWidth: '140px', margin: 0 }}
        >
          <optgroup label="── Standard ──">
            {STANDARD_OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
          </optgroup>
          <optgroup label="── Null Checks ──">
            {NULL_OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
          </optgroup>
          <optgroup label="── Date / Time ──">
            {DATE_OPERATORS.map(o => <option key={o} value={o}>{o.replace('DATE_', '')}</option>)}
          </optgroup>
        </select>

        {/* Date format picker — only for date operators */}
        {showDateFormat && (
          <select
            value={node.format || 'EPOCH_MILLIS'}
            onChange={e => updateNode(path, { format: e.target.value })}
            style={{ flex: '0 0 130px', margin: 0, fontSize: '0.8rem', color: '#60a5fa' }}
            title="Choose the timestamp format of this field"
          >
            <option value="EPOCH_MILLIS">EPOCH_MILLIS</option>
            <option value="ISO_STRING">ISO_STRING</option>
          </select>
        )}

        {/* Value — hidden for IS_NULL / IS_NOT_NULL */}
        {showValue && (
          <input
            type="text"
            placeholder={
              isDateOp(op)
                ? node.format === 'ISO_STRING'
                  ? 'e.g. 2024-01-15T00:00:00Z'
                  : 'e.g. 1705276800000'
                : op === 'IN'
                  ? 'val1, val2, val3'
                  : 'Value'
            }
            value={node.value ?? ''}
            onChange={e => updateNode(path, { value: e.target.value })}
            style={{ flex: 1, minWidth: '100px', margin: 0 }}
          />
        )}

        {/* Delete */}
        <button
          type="button"
          className="btn"
          style={{ background: 'var(--danger)', padding: '0.3rem' }}
          onClick={() => removeNode(path)}
        >
          <Trash2 size={14} />
        </button>
      </div>
    );
  };

  return <div>{renderNode(filterTree, [])}</div>;
}
