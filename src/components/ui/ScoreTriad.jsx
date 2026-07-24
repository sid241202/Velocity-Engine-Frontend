import React from 'react';

/**
 * Compact 3-number colored badge — Castle's inline abuse/ATO/bot score
 * cluster, used wherever a table row shows several related numbers that
 * currently sit scattered across separate cells with inconsistent styling.
 */
export default function ScoreTriad({ items, style }) {
  return (
    <div className="score-triad" style={style}>
      {items.map((item, i) => (
        <div key={i} className={`score-triad-cell tone-${item.tone || 'muted'}`} title={item.title}>
          <span className="score-triad-value">{item.value}</span>
          <span className="score-triad-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
