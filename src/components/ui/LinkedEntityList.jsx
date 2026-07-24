import React, { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';

/**
 * Linked-entity side panel — collapsible groups with a per-row hide/show
 * toggle, for lists of related identifiers (Castle's linked-entity pattern).
 * Hiding a row is purely a local display preference (dims it in place) so
 * the list can be used to visually focus on a subset without losing the rest.
 */
export default function LinkedEntityList({ groups, keyExtractor, renderItem, defaultExpanded = true }) {
  const [collapsed, setCollapsed] = useState({});
  const [hiddenKeys, setHiddenKeys] = useState(() => new Set());

  const toggleGroup = useCallback((groupKey) => {
    setCollapsed(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  }, []);

  const toggleHidden = useCallback((itemKey) => {
    setHiddenKeys(prev => {
      const next = new Set(prev);
      if (next.has(itemKey)) next.delete(itemKey); else next.add(itemKey);
      return next;
    });
  }, []);

  return (
    <div>
      {groups.map(group => {
        const isCollapsed = collapsed[group.key] ?? !defaultExpanded;
        return (
          <div key={group.key} className="linked-entity-group">
            <button
              type="button"
              className="linked-entity-group-header"
              onClick={() => toggleGroup(group.key)}
            >
              {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              {group.icon}
              <span>{group.label}</span>
              <span className="linked-entity-group-count">{group.items.length}</span>
            </button>
            {!isCollapsed && group.items.map(item => {
              const itemKey = keyExtractor(item);
              const isHidden = hiddenKeys.has(itemKey);
              return (
                <div key={itemKey} className={`linked-entity-row ${isHidden ? 'row-hidden' : ''}`}>
                  <button
                    type="button"
                    className="linked-entity-row-toggle"
                    onClick={(e) => { e.stopPropagation(); toggleHidden(itemKey); }}
                    title={isHidden ? 'Show this entity' : 'Hide this entity'}
                  >
                    {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  {renderItem(item, { hidden: isHidden })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
