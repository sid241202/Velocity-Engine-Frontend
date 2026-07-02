const fs = require("fs");
let content = fs.readFileSync("src/components/AggregatedAnalysis.jsx", "utf8");

const tooltipDef = `
function EventVolumeTooltip({ active, payload, label, getRuleName }) {
  if (!active || !payload || !payload.length) return null;
  const breached = payload.some(p => p.payload && (p.payload._breached || p.payload.thresholdBreached));
  return (
    <div style={{
      ...TOOLTIP_STYLE.contentStyle,
      minWidth: 180,
      borderColor: breached ? "rgba(239,68,68,0.5)" : "rgba(99,102,241,0.3)",
    }}>
      <div style={{ ...TOOLTIP_STYLE.labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
        {breached && <span style={{ color: BREACH_RED, fontSize: "0.85rem" }}>⚡</span>}
        {formatTime(label)}
        {breached && <span style={{ color: BREACH_RED, fontSize: "0.7rem", fontWeight: 700, marginLeft: 4 }}>BREACH</span>}
      </div>
      {payload.map((p, i) => {
        if (p.dataKey === "breachMarker") return null;
        let label = "Events";
        if (String(p.dataKey).startsWith("evt_")) label = "Event Count";
        else if (String(p.dataKey).startsWith("agg_")) label = "Aggregation Count";
        return (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginTop: 2 }}>
            <span style={{ color: "#94a3b8" }}>{label}</span>
            <span style={{ color: p.stroke || p.fill || "#e2e8f0", fontWeight: 700 }}>{p.value}</span>
          </div>
        );
      })}
      {breached && (
        <div style={{ marginTop: 6, padding: "4px 8px", background: "rgba(239,68,68,0.12)", borderRadius: 4, fontSize: "0.72rem", color: BREACH_RED, textAlign: "center", fontWeight: 700 }}>
          Threshold Exceeded
        </div>
      )}
    </div>
  );
}
`;

content = content.replace("function ChartGradientDefs", tooltipDef + "\nfunction ChartGradientDefs");

// I need to use regex for oldTooltip and oldLegend because the indentation might not exactly match
const oldTooltipRegex = /<Tooltip[\s\S]*?labelFormatter[\s\S]*?formatter=\{\(value, name\) => \{[\s\S]*?return \[value, name\];\s*\}\}\s*\/>/m;
const newTooltip = `<Tooltip content={<EventVolumeTooltip getRuleName={getRuleName} />} />`;
content = content.replace(oldTooltipRegex, newTooltip);

const oldLegendRegex = /<Legend[\s\S]*?onClick=\{handleLegendClick\}[\s\S]*?formatter=\{\(value, entry\) => \{[\s\S]*?return <span style=\{style\}>\{value\}<\/span>;\s*\}\}\s*\/>/m;
const newLegend = `<Legend
                    verticalAlign="top"
                    wrapperStyle={{ paddingBottom: '0.75rem', fontSize: '0.78rem', cursor: 'pointer' }}
                    onClick={handleLegendClick}
                    formatter={(value) => {
                      if (String(value).startsWith('evt_')) return \`📊 Event Count\`;
                      if (String(value).startsWith('agg_')) return \`〰 Aggregation Count\`;
                      if (value === 'breachMarker') return \`🔴 Breaches\`;
                      return value;
                    }}
                  />`;
content = content.replace(oldLegendRegex, newLegend);

// Also need to adjust the comboData logic to ensure thresholdBreached is set
content = content.replace("timeMap[ts]._breached = true;", "timeMap[ts]._breached = true; timeMap[ts].thresholdBreached = true;");

fs.writeFileSync("src/components/AggregatedAnalysis.jsx", content);
console.log("Refactored Tooltip and Legend");
