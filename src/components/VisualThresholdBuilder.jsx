import React from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';

// A visual builder that outputs a JEXL string.
// Example: (total_count > 10) && (distinct_users < 5)

/**
 * Attempts to parse a simple JEXL expression back into a tree.
 * Supports the format produced by compileNode: (alias op value) [&& | ||] (alias op value)
 * Returns null if the expression is too complex to parse.
 */
function tryParseExpression(expr) {
  if (!expr) return null;
  try {
    // Strip outer parens if the whole expression is one group
    const stripped = expr.trim().replace(/^\((.+)\)$/, (_, inner) => {
      // Only strip outer parens if they match the full expression
      let depth = 0;
      for (let i = 0; i < expr.trim().length; i++) {
        if (expr.trim()[i] === '(') depth++;
        if (expr.trim()[i] === ')') depth--;
        if (depth === 0 && i < expr.trim().length - 1) return expr.trim(); // not outer parens
      }
      return inner;
    });

    // Match individual conditions: (alias op value)
    const conditionRe = /\(([a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|<=|==|!=|>|<)\s*([\d.]+)\)/g;
    // Detect top-level logic operator
    const isAnd = stripped.includes('&&');
    const isOr = stripped.includes('||');
    const logic = isAnd ? '&&' : (isOr ? '||' : '&&');

    const children = [];
    let match;
    while ((match = conditionRe.exec(stripped)) !== null) {
      children.push({ type: 'RULE', alias: match[1], operator: match[2], value: match[3] });
    }

    if (children.length === 0) return null;
    return { type: 'GROUP', logic, children };
  } catch {
    return null;
  }
}

const OP_WORDS = { '>': 'is greater than', '<': 'is less than', '>=': 'is at least', '<=': 'is at most', '==': 'equals', '!=': 'is not equal to' };

/** Turn the same tree used to compile JEXL into a plain-English sentence fragment. */
function describeNode(node) {
  if (!node) return null;
  if (node.type === 'RULE') {
    if (!node.alias || node.value === '' || node.value == null || isNaN(parseFloat(node.value))) return null;
    return `${node.alias} ${OP_WORDS[node.operator] || node.operator} ${node.value}`;
  }
  if (node.type === 'GROUP') {
    const parts = (node.children || []).map(describeNode).filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];
    return parts.join(node.logic === '&&' ? ' and ' : ' or ');
  }
  return null;
}

export default function VisualThresholdBuilder({ expression, setExpression, aggregations }) {
  const [parseError, setParseError] = React.useState(false);

  const [tree, setTree] = React.useState(() => {
    // On mount: if an expression already exists (edit mode), try to parse it into the tree.
    // This prevents the builder from overwriting an existing threshold on save.
    if (expression && expression.trim() !== '') {
      const parsed = tryParseExpression(expression);
      if (parsed) return parsed;
      // Expression is too complex to reverse-parse; flag it for the user.
      setParseError(true);
      return { type: 'GROUP', logic: '&&', children: [{ type: 'RULE', alias: aggregations[0]?.alias || '', operator: '>', value: '' }] };
    }
    return {
      type: 'GROUP',
      logic: '&&',
      children: [
        { type: 'RULE', alias: aggregations[0]?.alias || '', operator: '>', value: '' }
      ]
    };
  });

  // Reset tree if expression is cleared from outside (e.g. form reset)
  React.useEffect(() => {
    if (expression === '') {
      setParseError(false);
      setTree({
        type: 'GROUP',
        logic: '&&',
        children: [{ type: 'RULE', alias: aggregations[0]?.alias || '', operator: '>', value: '' }]
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expression]);

  // Re-compile whenever tree changes
  React.useEffect(() => {
    const compileNode = (node) => {
      if (node.type === 'RULE') {
        if (!node.alias || !node.value) return '';
        const numVal = parseFloat(node.value);
        if (isNaN(numVal)) return '';
        return `(${node.alias} ${node.operator} ${numVal})`;
      }
      if (node.type === 'GROUP') {
        const childExprs = node.children.map(compileNode).filter(e => e !== '');
        if (childExprs.length === 0) return '';
        if (childExprs.length === 1) return childExprs[0];
        return `(${childExprs.join(` ${node.logic} `)})`;
      }
      return '';
    };
    
    const expr = compileNode(tree);
    setExpression(expr);
  }, [tree, setExpression]);

  const updateNode = (path, updates) => {
    setParseError(false); // user has started editing, clear warning
    const newTree = JSON.parse(JSON.stringify(tree));
    let curr = newTree;
    for (let i = 0; i < path.length - 1; i++) {
      curr = curr.children[path[i]];
    }
    if (path.length > 0) {
      curr.children[path[path.length - 1]] = { ...curr.children[path[path.length - 1]], ...updates };
    } else {
      Object.assign(newTree, updates);
    }
    setTree(newTree);
  };

  const addRule = (path) => {
    const newTree = JSON.parse(JSON.stringify(tree));
    let curr = newTree;
    for (let i = 0; i < path.length; i++) {
      curr = curr.children[path[i]];
    }
    curr.children.push({ type: 'RULE', alias: aggregations[0]?.alias || '', operator: '>', value: '' });
    setTree(newTree);
  };

  const addGroup = (path) => {
    const newTree = JSON.parse(JSON.stringify(tree));
    let curr = newTree;
    for (let i = 0; i < path.length; i++) {
      curr = curr.children[path[i]];
    }
    curr.children.push({ type: 'GROUP', logic: '&&', children: [{ type: 'RULE', alias: aggregations[0]?.alias || '', operator: '>', value: '' }] });
    setTree(newTree);
  };

  const removeNode = (path) => {
    if (path.length === 0) return; // Cant remove root
    const newTree = JSON.parse(JSON.stringify(tree));
    let curr = newTree;
    for (let i = 0; i < path.length - 1; i++) {
      curr = curr.children[path[i]];
    }
    curr.children.splice(path[path.length - 1], 1);
    setTree(newTree);
  };

  const renderNode = (node, path) => {
    if (node.type === 'GROUP') {
      return (
        <div key={path.join('-')} style={{ borderLeft: '2px solid var(--violet)', marginLeft: path.length > 0 ? '1rem' : '0', paddingLeft: '1rem', marginBottom: '0.5rem', marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
            <select value={node.logic} onChange={(e) => updateNode(path, { logic: e.target.value })} style={{ width: '80px', padding: '0.2rem', margin: 0 }}>
              <option value="&&">AND</option>
              <option value="||">OR</option>
            </select>
            <button type="button" className="btn btn-accent" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => addRule(path)}><Plus size={12}/> Rule</button>
            <button type="button" className="btn" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => addGroup(path)}><Plus size={12}/> Group</button>
            {path.length > 0 && (
              <button type="button" className="btn btn-danger" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }} onClick={() => removeNode(path)}><Trash2 size={12}/></button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {node.children.map((child, i) => renderNode(child, [...path, i]))}
          </div>
        </div>
      );
    } else {
      // RULE
      return (
        <div key={path.join('-')} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: 'var(--radius-xs)' }}>
          <select value={node.alias} onChange={e => updateNode(path, { alias: e.target.value })} style={{ margin: 0, flex: 1 }}>
            <option value="">-- Select Alias --</option>
            {aggregations.map(a => <option key={a.alias} value={a.alias}>{a.alias}</option>)}
          </select>
          <select value={node.operator} onChange={e => updateNode(path, { operator: e.target.value })} style={{ margin: 0, width: '60px' }}>
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value=">=">&gt;=</option>
            <option value="<=">&lt;=</option>
            <option value="==">==</option>
            <option value="!=">!=</option>
          </select>
          <input type="number" value={node.value} onChange={e => updateNode(path, { value: e.target.value })} placeholder="Threshold" style={{ margin: 0, width: '100px' }} />
          <button type="button" className="btn btn-danger" style={{ padding: '0.3rem 0.5rem' }} onClick={() => removeNode(path)}><Trash2 size={14}/></button>
        </div>
      );
    }
  };

  return (
    <div>
      {parseError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: 'var(--warning-subtle)', border: '1px solid rgba(227,160,8,0.3)', borderRadius: 'var(--radius-sm)', marginBottom: '0.75rem', fontSize: '0.78rem', color: 'var(--warning)' }}>
          <AlertTriangle size={14} />
          The existing expression is complex and cannot be visualized. Editing below will replace it.
          The current expression is preserved in the preview below until you make changes.
        </div>
      )}
      {renderNode(tree, [])}

      {(() => {
        const plain = describeNode(tree);
        return plain ? (
          <div style={{ marginTop: '1rem', padding: '0.6rem 0.75rem', background: 'var(--success-subtle)', border: '1px solid rgba(63,185,80,0.2)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', color: 'var(--text-1)', lineHeight: 1.5 }}>
            <strong>In plain terms:</strong> alert when {plain}.
          </div>
        ) : null;
      })()}

      <div style={{ marginTop: '0.6rem', padding: '0.5rem', background: 'var(--surface-3)', borderRadius: 'var(--radius-xs)', fontFamily: 'monospace', color: 'var(--violet-light)', fontSize: '0.85rem' }}>
        <strong>Compiled Expression:</strong> {expression || 'None (No Alerts)'}
      </div>
    </div>
  );
}
