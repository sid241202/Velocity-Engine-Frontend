import React, { useMemo } from 'react';

// Classic JSON-token regex: matches quoted strings (optionally followed by
// the ':' that makes them a key), true/false/null, and numbers — everything
// else (braces, brackets, commas, whitespace) is left as plain punctuation.
const TOKEN_RE = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;

function classifyToken(token) {
  if (/^"/.test(token)) return /:\s*$/.test(token) ? 'json-key' : 'json-string';
  if (token === 'true' || token === 'false') return 'json-boolean';
  if (token === 'null') return 'json-null';
  return 'json-number';
}

function highlightLine(line) {
  const parts = [];
  let lastIndex = 0;
  let match;
  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push({ text: line.slice(lastIndex, match.index), cls: 'json-punct' });
    parts.push({ text: match[0], cls: classifyToken(match[0]) });
    lastIndex = TOKEN_RE.lastIndex;
  }
  if (lastIndex < line.length) parts.push({ text: line.slice(lastIndex), cls: 'json-punct' });
  return parts;
}

/** Raw payload viewer with line numbers — for "show me the underlying
 * event/row data" drill-downs, instead of only ever showing pre-shaped
 * summary fields. */
export default function JsonViewer({ data, style }) {
  const lines = useMemo(() => {
    let text;
    try {
      text = JSON.stringify(data, null, 2);
    } catch {
      text = String(data);
    }
    return (text || '').split('\n');
  }, [data]);

  return (
    <div className="json-viewer" style={style}>
      <div className="json-viewer-lines">
        {lines.map((_, i) => <div key={i}>{i + 1}</div>)}
      </div>
      <div className="json-viewer-code">
        {lines.map((line, i) => (
          <div key={i}>
            {highlightLine(line).map((part, j) => (
              <span key={j} className={part.cls}>{part.text}</span>
            ))}
            {line.length === 0 ? ' ' : null}
          </div>
        ))}
      </div>
    </div>
  );
}
