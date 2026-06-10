import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

const OPERATORS = [
  'EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'GREATER_THAN_EQUAL',
  'LESS_THAN', 'LESS_THAN_EQUAL', 'IN', 'REGEX'
];

/**
 * Recursively processes filter tree values before submission:
 * - Numeric strings → Number (unless operator is REGEX or IN)
 * - IN operator → split by comma into array
 */
export function processFilterTree(node) {
  if (!node) return node;
  const clone = JSON.parse(JSON.stringify(node));

  const process = (n) => {
    if (n.type === 'group') {
      if (n.conditions) {
        n.conditions = n.conditions.map(process);
      }
      return n;
    }
    // Condition node
    if (n.operator === 'IN') {
      // Split comma-separated string into array, trim each
      if (typeof n.value === 'string') {
        n.value = n.value.split(',').map(v => {
          const trimmed = v.trim();
          if (trimmed !== '' && !isNaN(trimmed)) return Number(trimmed);
          return trimmed;
        });
      }
    } else if (n.operator !== 'REGEX') {
      if (typeof n.value === 'string' && n.value !== '' && !isNaN(n.value)) {
        n.value = Number(n.value);
      }
    }
    return n;
  };

  return process(clone);
}

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
    for (let i = 0; i < path.length; i++) {
      curr = curr.conditions[path[i]];
    }
    if (!curr.conditions) curr.conditions = [];
    curr.conditions.push({ type: 'condition', field: '', operator: 'EQUALS', value: '' });
    setFilterTree(newTree);
  };

  const addGroup = (path) => {
    const newTree = JSON.parse(JSON.stringify(filterTree));
    let curr = newTree;
    for (let i = 0; i < path.length; i++) {
      curr = curr.conditions[path[i]];
    }
    if (!curr.conditions) curr.conditions = [];
    curr.conditions.push({
      type: 'group',
      logic: 'AND',
      conditions: [{ type: 'condition', field: '', operator: 'EQUALS', value: '' }]
    });
    setFilterTree(newTree);
  };

  const removeNode = (path) => {
    if (path.length === 0) return; // Cannot remove root
    const newTree = JSON.parse(JSON.stringify(filterTree));
    let curr = newTree;
    for (let i = 0; i < path.length - 1; i++) {
      curr = curr.conditions[path[i]];
    }
    curr.conditions.splice(path[path.length - 1], 1);
    setFilterTree(newTree);
  };

  const renderNode = (node, path) => {
    if (node.type === 'group') {
      return (
        <div key={path.join('-') || 'root'} style={{ borderLeft: '2px solid var(--primary)', marginLeft: path.length > 0 ? '1rem' : '0', paddingLeft: '1rem', marginBottom: '0.5rem', marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
            <select value={node.logic} onChange={e => updateNode(path, { logic: e.target.value })} style={{ width: '80px', padding: '0.2rem', margin: 0 }}>
              <option value="AND">AND</option>
              <option value="OR">OR</option>
            </select>
            <button type="button" className="btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => addCondition(path)}>
              <Plus size={12}/> Condition
            </button>
            <button type="button" className="btn btn-accent" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={() => addGroup(path)}>
              <Plus size={12}/> Group
            </button>
            {path.length > 0 && (
              <button type="button" className="btn" style={{ background: 'var(--danger)', padding: '0.3rem 0.6rem' }} onClick={() => removeNode(path)}>
                <Trash2 size={12}/>
              </button>
            )}
          </div>
          {node.conditions && node.conditions.map((child, i) => renderNode(child, [...path, i]))}
        </div>
      );
    } else {
      // Condition node
      return (
        <div key={path.join('-')} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.25rem' }}>
          <input
            type="text"
            placeholder="Field (e.g. _data.aua)"
            value={node.field || ''}
            onChange={e => updateNode(path, { field: e.target.value })}
            style={{ flex: 2, margin: 0 }}
          />
          <select
            value={node.operator || 'EQUALS'}
            onChange={e => updateNode(path, { operator: e.target.value })}
            style={{ flex: 1, margin: 0 }}
          >
            {OPERATORS.map(op => (
              <option key={op} value={op}>{op}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Value"
            value={node.value ?? ''}
            onChange={e => updateNode(path, { value: e.target.value })}
            style={{ flex: 1, margin: 0 }}
          />
          <button type="button" className="btn" style={{ background: 'var(--danger)', padding: '0.3rem' }} onClick={() => removeNode(path)}>
            <Trash2 size={14}/>
          </button>
        </div>
      );
    }
  };

  return <div>{renderNode(filterTree, [])}</div>;
}
