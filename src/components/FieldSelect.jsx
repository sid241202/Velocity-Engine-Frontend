import React from 'react';
import { ENVELOPE_FIELD_OPTIONS, DATA_FIELD_OPTIONS, pathToLabel } from '../constants/eventFields';

/**
 * Dropdown over the fixed Kafka event schema. `value` is always the real
 * dot-path (e.g. `_data.aua` or `_event_timestamp`) — only the visible
 * option text is the friendly label.
 *
 * A value that doesn't match any known path (a rule saved before this
 * schema list existed, or hand-edited) gets a synthetic extra option so it's
 * shown and preserved rather than silently dropped on load/re-save.
 */
export default function FieldSelect({ value, onChange, onFocus, style, hasError, required, placeholder = '-- Select field --' }) {
  const v = value ?? '';
  const isEmpty = v === '';
  const isKnown = isEmpty || pathToLabel.has(v);

  return (
    <select
      value={v}
      onChange={e => onChange(e.target.value)}
      onFocus={onFocus}
      required={required}
      style={{ border: hasError ? '1px solid var(--danger)' : undefined, ...style }}
    >
      {isEmpty && <option value="">{placeholder}</option>}
      {!isEmpty && !isKnown && <option value={v}>{`⚠ ${v} (not in known schema)`}</option>}
      <optgroup label="Event Envelope">
        {ENVELOPE_FIELD_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </optgroup>
      <optgroup label="Event Data">
        {DATA_FIELD_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </optgroup>
    </select>
  );
}
