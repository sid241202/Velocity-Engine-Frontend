const fs = require("fs");
let content = fs.readFileSync("src/components/AggregatedAnalysis.jsx", "utf8");

// Add Scatter import
content = content.replace("ResponsiveContainer, Brush, ReferenceLine, Cell", "ResponsiveContainer, Brush, ReferenceLine, Cell, Scatter");

// Insert ChartGradientDefs and CustomXAxisTick before getBreachColor
const defs = `
const ACCENT_BLUE = "#5865f2";
const ACCENT_CYAN = "#2dd4bf";
const BREACH_RED = "#f85149";

function ChartGradientDefs() {
  return (
    <defs>
      <linearGradient id="gradEventVolume" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={ACCENT_BLUE} stopOpacity={0.35} />
        <stop offset="100%" stopColor={ACCENT_BLUE} stopOpacity={0.02} />
      </linearGradient>
      <linearGradient id="gradCumBreach" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={BREACH_RED} stopOpacity={0.4} />
        <stop offset="100%" stopColor={BREACH_RED} stopOpacity={0.03} />
      </linearGradient>
      <linearGradient id="gradAggMetric" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={ACCENT_CYAN} stopOpacity={0.3} />
        <stop offset="100%" stopColor={ACCENT_CYAN} stopOpacity={0.02} />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

const CustomXAxisTick = (props) => {
  const { x, y, payload, breachTs } = props;
  const isBreach = breachTs && breachTs.includes(payload.value);
  return (
    <g transform={\`translate(\${x},\${y})\`}>
      <text x={0} y={0} dy={16} textAnchor="middle" fill={isBreach ? BREACH_RED : "#64748b"} fontSize={11} fontWeight={isBreach ? 700 : 400}>
        {formatTime(payload.value)}
      </text>
    </g>
  );
};
`;
content = content.replace("function getBreachColor", defs + "\nfunction getBreachColor");

// Insert hiddenSeries state
content = content.replace(
  "const [anomalyData, setAnomalyData] = useState([]);",
  "const [anomalyData, setAnomalyData] = useState([]);\n  const [hiddenSeries, setHiddenSeries] = useState({});\n  const handleLegendClick = useCallback((e) => {\n    const key = e.dataKey;\n    if (key) setHiddenSeries(prev => ({ ...prev, [key]: !prev[key] }));\n  }, []);"
);

// Remove eventVolumeData block completely
content = content.replace(/\/\* ───── Event Volume chart data ───── \*\/\n  const eventVolumeData = useMemo\(\(\) => \{[\s\S]*?\}, \[allRows\]\);\n/, "");

// Replace aggData and aggLines block with comboData block
const comboLogic = `  /* ───── Consolidated Chart Data (Event Volume + Agg Metrics) ───── */
  const { comboData, aggLines } = useMemo(() => {
    const timeMap = {};
    const lines = [];

    // 1. Process allRows for Event Volume and Breach markers
    for (const row of allRows) {
      const ts = row.windowStart;
      if (!ts) continue;
      if (!timeMap[ts]) timeMap[ts] = { windowStart: ts, _tsMs: new Date(ts).getTime(), _breached: false };

      const evtKey = \`evt_\${row.ruleId}\`;
      timeMap[ts][evtKey] = (timeMap[ts][evtKey] || 0) + getRowEventCount(row);

      if (isBreached(row)) {
        timeMap[ts]._breached = true;
        timeMap[ts].breachMarker = getRowEventCount(row);
      }
    }

    // 2. Process agg lines based on selected rules
    for (const ruleId of [...selectedRuleIds]) {
      const rows = data[ruleId] || [];
      if (rows.length === 0) continue;
      
      const aliasSet = new Set();
      for (const row of rows) {
        for (const alias of Object.keys(getAggResults(row))) {
          aliasSet.add(alias);
        }
      }
      const aliases = [...aliasSet];
      const rName = getRuleName(ruleId);
      const rColor = getRuleColor(rules, ruleId);

      aliases.forEach((alias, ai) => {
        const lineKey = \`agg_\${ruleId}__\${alias}\`;
        lines.push({
          key: lineKey,
          name: \`\${rName} · \${alias}\`,
          color: rColor,
          dashArray: DASH_PATTERNS[ai % DASH_PATTERNS.length],
        });
      });

      for (const row of rows) {
        const ts = row.windowStart;
        if (!timeMap[ts]) timeMap[ts] = { windowStart: ts, _tsMs: new Date(ts).getTime(), _breached: false };
        for (const [alias, val] of Object.entries(getAggResults(row))) {
          timeMap[ts][\`agg_\${ruleId}__\${alias}\`] = val;
        }
      }
    }

    const sorted = Object.values(timeMap).sort((a, b) => a._tsMs - b._tsMs);
    return {
      comboData: sorted,
      aggLines: lines,
    };
  }, [allRows, data, selectedRuleIds, getRuleName, rules]);`;

content = content.replace(/\/\* ───── Aggregation values chart data ───── \*\/\n  const \{ aggData, aggLines \} = useMemo\(\(\) => \{[\s\S]*?\}, \[data, selectedRuleIds, getRuleName, rules\]\);/m, comboLogic);

// Replace JSX blocks
const oldJSX = `{/* Event Volume Area Chart */}
          <div className="chart-container" style={{ marginBottom: '-15px', height: 'auto' }}>
            <div className="chart-title">Event Volume Over Time</div>
            <div style={{ fontSize: '0.71rem', color: 'var(--text-3)', marginBottom: '1rem' }}>Total events processed per evaluation window. <span style={{ color: '#f85149' }}>Red markers</span> indicate threshold breaches.</div>
            <div style={{ width: '100%', height: 380 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={eventVolumeData} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="windowStart" stroke={AXIS_STROKE} tick={{ fontSize: 11 }} tickFormatter={formatTime} minTickGap={30} dy={10} />
                <YAxis stroke={AXIS_STROKE} tick={{ fontSize: 11 }} width={48} />
                <Tooltip {...TOOLTIP_STYLE} labelFormatter={ts => \`Window: \${formatTime(ts)} IST\`} formatter={(value, name) => [value?.toLocaleString() + ' events', getRuleName(name)]} />
                <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '8px' }} formatter={(value) => getRuleName(value)} />
                {breachTimestamps.map((ts, idx) => (
                  <ReferenceLine key={\`breach-ref-\${idx}\`} x={ts} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.3} />
                ))}
                {selectedRules.map(r => {
                  const id = r.rule_metadata.rule_id;
                  const color = getRuleColor(rules, id);
                  return (
                    <Area key={id} type="monotone" dataKey={id} stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} name={id} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  );
                })}
                {/* Brush auto-positioned by Recharts within the bottom margin */}
                <Brush dataKey="windowStart" height={24} stroke="#3b82f6" fill="rgba(15,23,42,0.8)" tickFormatter={formatTime} />
              </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>`;

const newJSX = `{/* Consolidated Chart: Event Volume, Aggregation Metrics, and Breaches */}
          <div className="chart-container" style={{ marginBottom: '-15px', height: 'auto' }}>
            <div className="chart-title" style={{ marginBottom: '1.25rem' }}>
              Event Volume, Aggregation Metrics, and Breaches
            </div>
            <div style={{ width: '100%', height: 420 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={comboData} margin={{ top: 10, right: 24, bottom: 45, left: 12 }}>
                  <ChartGradientDefs />
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis
                    dataKey="windowStart"
                    stroke={AXIS_STROKE}
                    tick={<CustomXAxisTick breachTs={breachTimestamps} />}
                    minTickGap={40}
                    dy={8}
                  />
                  <YAxis stroke={AXIS_STROKE} tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} width={44} />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    labelFormatter={(val) => formatTime(val)}
                    formatter={(value, name) => {
                      if (name === "breachMarker") return [value, "⚡ Breach Events"];
                      if (String(name).startsWith("evt_")) {
                        const rId = name.replace("evt_", "");
                        return [value, \`\${getRuleName(rId)} (Events)\`];
                      }
                      return [value, name];
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    wrapperStyle={{ paddingBottom: '16px', fontSize: '0.75rem', fontWeight: 500 }}
                    onClick={handleLegendClick}
                    formatter={(value, entry) => {
                      const hidden = hiddenSeries[entry.dataKey];
                      const style = hidden ? { color: '#64748b', textDecoration: 'line-through' } : { color: '#e2e8f0' };
                      if (value === "breachMarker") return <span style={style}>Breach Point</span>;
                      if (String(value).startsWith("evt_")) {
                        const rId = value.replace("evt_", "");
                        return <span style={style}>{getRuleName(rId)} (Events)</span>;
                      }
                      return <span style={style}>{value}</span>;
                    }}
                  />

                  {/* Aggregation Metric Lines */}
                  {aggLines.map((line) => (
                    <Line
                      key={line.key}
                      type="monotone"
                      dataKey={line.key}
                      name={line.name}
                      stroke={line.color}
                      strokeWidth={2}
                      strokeDasharray={line.dashArray}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      hide={hiddenSeries[line.key]}
                      isAnimationActive={false}
                    />
                  ))}

                  {/* Event Volume Areas */}
                  {selectedRules.map(r => {
                    const id = r.rule_metadata.rule_id;
                    return (
                      <Area
                        key={\`evt_\${id}\`}
                        type="monotone"
                        dataKey={\`evt_\${id}\`}
                        stroke={ACCENT_BLUE}
                        strokeWidth={2.5}
                        fill="url(#gradEventVolume)"
                        name={\`evt_\${id}\`}
                        activeDot={{ r: 6, fill: ACCENT_BLUE, stroke: '#fff', strokeWidth: 2 }}
                        isAnimationActive={false}
                        hide={hiddenSeries[\`evt_\${id}\`]}
                      />
                    );
                  })}

                  {/* Precise Breach Markers (Scatter with red pointer) */}
                  <Scatter
                    dataKey="breachMarker"
                    name="breachMarker"
                    fill={BREACH_RED}
                    hide={hiddenSeries["breachMarker"]}
                    shape={(props) => {
                      const { cx, cy } = props;
                      if (cx == null || cy == null) return null;
                      return (
                        <g>
                          <circle cx={cx} cy={cy} r={6} fill={BREACH_RED} stroke="#fff" strokeWidth={1.5} />
                          <path d={\`M\${cx},\${cy + 6} L\${cx - 4},\${cy + 14} L\${cx + 4},\${cy + 14} Z\`} fill={BREACH_RED} />
                        </g>
                      );
                    }}
                    isAnimationActive={false}
                  />

                  <Brush
                    dataKey="windowStart"
                    height={22}
                    stroke="rgba(99,102,241,0.4)"
                    fill="rgba(8,12,28,0.9)"
                    tickFormatter={formatTime}
                    travellerWidth={6}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>`;

content = content.replace(oldJSX, newJSX);

// Now remove the separate LineChart for Aggregation Metric Values
const lineChartBlockRegex = /\{\/\* Aggregation Metric Values Chart \*\/\}\s*\{aggLines\.length > 0 && \([\s\S]*?<\/div>\s*<\/div>\s*\)\}/;
content = content.replace(lineChartBlockRegex, "");

fs.writeFileSync("src/components/AggregatedAnalysis.jsx", content);
console.log("Refactor complete");
