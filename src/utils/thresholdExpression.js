/**
 * thresholdExpression.js — parsing/describing helpers shared by
 * VisualThresholdBuilder (the raw AND/OR tree editor) and
 * SimpleThresholdEditor (the plain-language flat-list editor), so both
 * read/write the exact same JEXL string format and stay interchangeable
 * as a rule is switched between Simple and Advanced mode.
 *
 * Kept in its own file (not exported from either component) so both
 * components stay Fast-Refresh-friendly — a file that exports both
 * components and plain functions breaks React Fast Refresh.
 */

/**
 * Attempts to parse a simple JEXL expression back into a tree.
 * Supports the format produced by compileNode: (alias op value) [&& | ||] (alias op value)
 * Returns null if the expression is too complex to parse.
 */
export function tryParseExpression(expr) {
  if (!expr) return null;
  try {
    // Match individual conditions: (alias op value). Matched directly
    // against the raw expression — no "strip outer parens" pre-pass — since
    // the regex already finds every (alias op value) occurrence regardless
    // of what wraps it. An earlier version stripped a single overall
    // wrapping pair first, which silently broke the single-condition case
    // ("(count > 10)" strips to "count > 10", which the regex — requiring
    // literal parens around each condition — then can't match at all).
    const conditionRe = /\(([a-zA-Z_][a-zA-Z0-9_]*)\s*(>=|<=|==|!=|>|<)\s*([\d.]+)\)/g;
    const isAnd = expr.includes('&&');
    const isOr = expr.includes('||');
    const logic = isAnd ? '&&' : (isOr ? '||' : '&&');

    const children = [];
    let match;
    while ((match = conditionRe.exec(expr)) !== null) {
      children.push({ type: 'RULE', alias: match[1], operator: match[2], value: match[3] });
    }

    if (children.length === 0) return null;
    return { type: 'GROUP', logic, children };
  } catch {
    return null;
  }
}

export const OP_WORDS = { '>': 'is greater than', '<': 'is less than', '>=': 'is at least', '<=': 'is at most', '==': 'equals', '!=': 'is not equal to' };

/** Turn the same tree used to compile JEXL into a plain-English sentence fragment. */
export function describeNode(node) {
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
