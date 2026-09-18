/**
 * VisualFilterBuilder.jsx
 *
 * Supports operators:
 *   - Standard: EQUALS, NOT_EQUALS, GREATER_THAN, GREATER_THAN_EQUAL, LESS_THAN,
 *               LESS_THAN_EQUAL, IN, REGEX, CONTAINS, NOT_CONTAINS, STARTS_WITH, ENDS_WITH
 *   - Null checks: IS_NULL, IS_NOT_NULL  (no value field required)
 *   - Date/Time:   DATE_BEFORE, DATE_AFTER, DATE_EQUALS
 *                  Format: EPOCH_MILLIS (Unix ms) | ISO_STRING (IST format: 2024-01-15T05:30:00+05:30)
 *   - Special:     IS_FINANCIAL_AUA — checks _data.aua against a hardcoded
 *                  financial-AUA list maintained server-side (Flink job +
 *                  backend historical-query engine). No field or value
 *                  needed — both are cleared when this is selected, since
 *                  the field is always _data.aua and the list isn't
 *                  user-editable from here.
 *
 * ALL date/time values must be in IST (Indian Standard Time, UTC+05:30).
 */
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { isValidEpochMs, isValidIsoDate } from '../utils/validators';
import FieldSelect from './FieldSelect';

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
// Operators that ignore whatever field/value the condition row otherwise
// holds — the field and target set are both fixed server-side.
const FINANCIAL_AUA_OPERATORS = ['IS_FINANCIAL_AUA'];

// Plain-English display text for each operator — the underlying value sent
// to the backend is unchanged, this only affects what the dropdown shows.
const OPERATOR_LABELS = {
  EQUALS: 'equals',
  NOT_EQUALS: 'does not equal',
  GREATER_THAN: 'is greater than',
  GREATER_THAN_EQUAL: 'is at least',
  LESS_THAN: 'is less than',
  LESS_THAN_EQUAL: 'is at most',
  IN: 'is one of (comma-separated list)',
  REGEX: 'matches pattern (regex)',
  CONTAINS: 'contains',
  NOT_CONTAINS: 'does not contain',
  STARTS_WITH: 'starts with',
  ENDS_WITH: 'ends with',
  IS_NULL: 'is empty or missing',
  IS_NOT_NULL: 'is present',
  DATE_BEFORE: 'is before',
  DATE_AFTER: 'is after',
  DATE_EQUALS: 'is exactly',
  IS_FINANCIAL_AUA: 'should be a financial AUA',
};

const isNullOp = (op) => NULL_OPERATORS.includes(op?.toUpperCase());
const isDateOp = (op) => DATE_OPERATORS.includes(op?.toUpperCase());
const isFinancialAuaOp = (op) => FINANCIAL_AUA_OPERATORS.includes(op?.toUpperCase());

/** Validate a date filter value — returns error string or null */
function getDateValueError(value, format) {
  if (!value || !value.trim()) return 'Value is required';
  if (format === 'EPOCH_MILLIS') {
    if (!isValidEpochMs(value)) return 'Enter a valid Unix epoch in milliseconds (e.g. 1705276800000)';
  } else {
    if (!isValidIsoDate(value)) return 'Enter a valid IST date string (e.g. 2024-01-15T05:30:00+05:30)';
  }
  return null;
}

// A string only round-trips through Number() without changing meaning when
// it has no formatting Number() would discard — leading zeros ("0000050000",
// a zero-padded AUA/device code) or a leading "+" chief among them. Coercing
// those to a number and back loses the padding permanently (Number("0000050000")
// -> 50000 -> "50000"), which would silently break every string-shaped code
// field an analyst filters on. isNaN() alone can't tell "50000" (safe to
// coerce) from "0000050000" (not) — both are non-NaN — so require the
// round-trip to be lossless instead.
function isCleanNumericLiteral(str) {
  if (str === '' || isNaN(str)) return false;
  return String(Number(str)) === str;
}

// ─── processFilterTree (exported — called by RuleBuilder before submit) ───────
// eslint-disable-next-line react-refresh/only-export-components -- intentional: helper co-located with the component that owns its data shape
export function processFilterTree(node) {
  if (!node) return node;
  const clone = JSON.parse(JSON.stringify(node));

  const process = (n) => {
    if (n.type === 'group') {
      if (n.conditions) n.conditions = n.conditions.map(process);
      return n;
    }
    if (isFinancialAuaOp(n.operator)) {
      delete n.field;
      delete n.value;
      delete n.format;
      return n;
    }
    if (isNullOp(n.operator)) {
      delete n.value;
      delete n.format;
      return n;
    }
    if (isDateOp(n.operator)) {
      // value stays as string; format is preserved for Flink
      return n;
    }
    if (n.operator === 'IN') {
      if (typeof n.value === 'string') {
        n.value = n.value.split(',').map(v => {
          const trimmed = v.trim();
          return isCleanNumericLiteral(trimmed) ? Number(trimmed) : trimmed;
        });
      }
      return n;
    }
    if (n.operator !== 'REGEX' && typeof n.value === 'string' && isCleanNumericLiteral(n.value)) {
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
    for (let i = 0; i < path.length - 1; i++) curr = curr.conditions[path[i]];
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
      type: 'group', logic: 'AND',
      conditions: [{ type: 'condition', field: '', operator: 'EQUALS', value: '' }],
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
              <button type="button" className="btn btn-danger" style={{ padding: '0.3rem 0.6rem' }}
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
    const op          = node.operator || 'EQUALS';
    const isFinAua    = isFinancialAuaOp(op);
    const showField   = !isFinAua;
    const showValue   = !isNullOp(op) && !isFinAua;
    const showDateFmt = isDateOp(op);
    const fmt         = node.format || 'EPOCH_MILLIS';

    const dateError = showDateFmt && showValue
      ? getDateValueError(node.value, fmt)
      : null;

    const datePlaceholder = showDateFmt
      ? fmt === 'ISO_STRING'
        ? 'e.g. 2024-01-15T05:30:00+05:30  (IST)'
        : 'e.g. 1705276800000  (IST epoch ms)'
      : op === 'IN'
        ? 'val1, val2, val3'
        : 'Value';

    return (
      <div
        key={path.join('-')}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
          background: 'rgba(255,255,255,0.05)',
          padding: '0.5rem',
          borderRadius: 'var(--radius-xs)',
          marginBottom: '0.25rem',
          border: dateError ? '1px solid rgba(248,81,73,0.5)' : '1px solid transparent',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Field — hidden for IS_FINANCIAL_AUA, which always targets _data.aua */}
          {showField && (
            <FieldSelect
              value={node.field || ''}
              onChange={val => updateNode(path, { field: val })}
              hasError={node.field === ''}
              style={{ flex: 2, minWidth: '120px', margin: 0 }}
            />
          )}

          {/* Operator */}
          <select
            value={op}
            onChange={e => {
              const newOp = e.target.value;
              const updates = { operator: newOp };
              if (isNullOp(newOp))         { updates.value = undefined; updates.format = undefined; }
              if (isDateOp(newOp) && !isDateOp(op)) { updates.format = 'EPOCH_MILLIS'; updates.value = ''; }
              if (!isDateOp(newOp) && isDateOp(op)) { updates.format = undefined; }
              if (isFinancialAuaOp(newOp)) { updates.field = ''; updates.value = undefined; updates.format = undefined; }
              updateNode(path, updates);
            }}
            style={{ flex: 1, minWidth: '140px', margin: 0 }}
          >
            <optgroup label="── Standard ──">
              {STANDARD_OPERATORS.map(o => <option key={o} value={o}>{OPERATOR_LABELS[o] || o}</option>)}
            </optgroup>
            <optgroup label="── Null Checks ──">
              {NULL_OPERATORS.map(o => <option key={o} value={o}>{OPERATOR_LABELS[o] || o}</option>)}
            </optgroup>
            <optgroup label="── Date / Time (IST) ──">
              {DATE_OPERATORS.map(o => <option key={o} value={o}>{OPERATOR_LABELS[o] || o.replace('DATE_', '')}</option>)}
            </optgroup>
            <optgroup label="── Special ──">
              {FINANCIAL_AUA_OPERATORS.map(o => <option key={o} value={o}>{OPERATOR_LABELS[o] || o}</option>)}
            </optgroup>
          </select>

          {isFinAua && (
            <span style={{ flex: 2, minWidth: '160px', fontSize: '0.78rem', color: 'var(--text-3)', fontStyle: 'italic' }}>
              Checks <code>_data.aua</code> against the maintained financial-AUA list
            </span>
          )}

          {/* Date format picker */}
          {showDateFmt && (
            <select
              value={fmt}
              onChange={e => updateNode(path, { format: e.target.value, value: '' })}
              style={{ flex: '0 0 130px', margin: 0, fontSize: '0.8rem', color: 'var(--violet-light)' }}
              title="Choose the timestamp format. All dates interpreted as IST (UTC+05:30)."
            >
              <option value="EPOCH_MILLIS">EPOCH_MILLIS</option>
              <option value="ISO_STRING">ISO_STRING (IST)</option>
            </select>
          )}

          {/* Value input */}
          {showValue && (
            <input
              type="text"
              placeholder={datePlaceholder}
              value={node.value ?? ''}
              onChange={e => updateNode(path, { value: e.target.value })}
              style={{
                flex: 1, minWidth: '100px', margin: 0,
                border: dateError ? '1px solid rgba(248,81,73,0.6)' : undefined,
              }}
            />
          )}

          {/* Delete */}
          <button
            type="button"
            className="btn btn-danger"
            style={{ padding: '0.3rem' }}
            onClick={() => removeNode(path)}
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Date validation error + IST hint */}
        {showDateFmt && (
          <div style={{ paddingLeft: '0.25rem' }}>
            {dateError
              ? <p style={{ margin: 0, fontSize: '0.69rem', color: 'var(--danger)' }}>{dateError}</p>
              : <p style={{ margin: 0, fontSize: '0.69rem', color: 'var(--text-3)' }}>
                  All date comparisons use <strong>IST (UTC+05:30)</strong>.
                  {fmt === 'ISO_STRING' ? ' Include the +05:30 suffix for clarity.' : ' Enter the epoch ms value corresponding to the IST moment.'}
                </p>
            }
          </div>
        )}
      </div>
    );
  };

  return <div>{renderNode(filterTree, [])}</div>;
}
