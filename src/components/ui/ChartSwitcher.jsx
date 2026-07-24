import React, { useState } from 'react';

/**
 * Tabs to flip a chart between equivalent views of the same underlying
 * time series, instead of showing every view stacked at once.
 * `tabs`: [{ key, label, render: () => JSX }]
 */
export default function ChartSwitcher({ title, tabs, defaultTab, extra }) {
  const [active, setActive] = useState(defaultTab || tabs[0].key);
  const activeTab = tabs.find(t => t.key === active) || tabs[0];

  return (
    <div className="chart-container" style={{ height: 'auto' }}>
      <div className="chart-header">
        <div className="chart-title" style={{ marginBottom: 0 }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {extra}
          <div className="chart-switcher-tabs">
            {tabs.map(tab => (
              <button
                key={tab.key}
                type="button"
                className={`chart-switcher-tab ${tab.key === active ? 'active' : ''}`}
                onClick={() => setActive(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {activeTab.render()}
    </div>
  );
}
