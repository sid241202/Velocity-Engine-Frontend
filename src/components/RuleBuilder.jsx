import React, { useState } from 'react';
import { Save, Plus, Trash2, AlertTriangle, ChevronDown, ChevronRight, Info } from 'lucide-react';
import VisualThresholdBuilder from './VisualThresholdBuilder';
import VisualFilterBuilder, { processFilterTree } from './VisualFilterBuilder';

/* ─── Small helper: Tooltip ─────────────────────────────────── */
function Tip({ text }) {
  return (
    <span className="tooltip-wrap">
      <span className="tooltip-icon">?</span>
      <span className="tooltip-text">{text}</span>
    </span>
  );
}

/* ─── Advanced Settings Accordion ───────────────────────────── */
function Accordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <button
        type="button"
        className={`accordion-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span>{title}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="accordion-content">{children}</div>}
    </div>
  );
}

/* ─── Sink Card ──────────────────────────────────────────────── */
function SinkCard({ id, color, title, subtitle, checked, onChange }) {
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        borderRadius: '8px',
        border: checked ? `1px solid ${color}40` : '1px solid var(--border)',
        background: checked ? `${color}0d` : 'var(--surface-raised)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        flex: 1,
        minWidth: '170px',
      }}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ width: 'auto', marginTop: '2px', accentColor: color, flexShrink: 0 }}
      />
      <span>
        <span style={{ color, fontWeight: 600, fontSize: '0.82rem', display: 'block', marginBottom: '0.2rem' }}>{title}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', lineHeight: 1.4 }}>{subtitle}</span>
      </span>
    </label>
  );
}

export default function RuleBuilder({ rules, fetchRules, onFieldFocus }) {
  // ── Core Fields ────────────────────────────────────────────
  const [ruleId, setRuleId] = useState(crypto.randomUUID());
  const [severity, setSeverity] = useState('HIGH');
  const [penaltyTtl, setPenaltyTtl] = useState(3600);

  // ── Windowing ──────────────────────────────────────────────
  const [windowType, setWindowType] = useState('SLIDING');
  const [timeType, setTimeType] = useState('EVENT_TIME');
  const [eventTimeSource, setEventTimeSource] = useState('KAFKA_TIMESTAMP');
  const [customTsField, setCustomTsField] = useState('');
  const [customTsFormat, setCustomTsFormat] = useState('EPOCH_MILLIS');
  const [windowSize, setWindowSize] = useState(300);
  const [windowSlide, setWindowSlide] = useState(60);
  const [lateness, setLateness] = useState(0);

  // ── Window Alignment (Advanced) ────────────────────────────
  const [alignHour, setAlignHour] = useState(0);
  const [alignMinute, setAlignMinute] = useState(0);
  const [alignSecond, setAlignSecond] = useState(0);

  // ── Grouping ───────────────────────────────────────────────
  const [keys, setKeys] = useState(['_data.aua']);
  const [isGlobal, setIsGlobal] = useState(false);
  const [entityName, setEntityName] = useState('');
  const [useAnomalyEntityField, setUseAnomalyEntityField] = useState(false);
  const [anomalyEntityField, setAnomalyEntityField] = useState('');

  // ── Filters ────────────────────────────────────────────────
  const [filterTree, setFilterTree] = useState({ type: 'group', logic: 'AND', conditions: [] });

  // ── Aggregations ───────────────────────────────────────────
  const [aggregations, setAggregations] = useState([
    { alias: 'total_count', field: '_data.authCode', function: 'COUNT', cardinality_hint: 'LOW' }
  ]);

  // ── Alert Condition ─────────────────────────────────────────
  const [jexlExpression, setJexlExpression] = useState('');

  // ── Sinks ───────────────────────────────────────────────────
  const [aggSinkEnabled, setAggSinkEnabled] = useState(true);
  const [anomalySinkEnabled, setAnomalySinkEnabled] = useState(true);
  const [anomalyStoreSinkEnabled, setAnomalyStoreSinkEnabled] = useState(true);
  const atLeastOneSink = aggSinkEnabled || anomalySinkEnabled || anomalyStoreSinkEnabled;

  const resetForm = () => {
    setRuleId(crypto.randomUUID());
    setSeverity('HIGH');
    setPenaltyTtl(3600);
    setWindowType('SLIDING');
    setTimeType('EVENT_TIME');
    setEventTimeSource('KAFKA_TIMESTAMP');
    setCustomTsField('');
    setCustomTsFormat('EPOCH_MILLIS');
    setWindowSize(300);
    setWindowSlide(60);
    setLateness(0);
    setAlignHour(0); setAlignMinute(0); setAlignSecond(0);
    setKeys(['_data.aua']);
    setIsGlobal(false);
    setEntityName('');
    setUseAnomalyEntityField(false);
    setAnomalyEntityField('');
    setFilterTree({ type: 'group', logic: 'AND', conditions: [] });
    setAggregations([{ alias: 'total_count', field: '_data.authCode', function: 'COUNT', cardinality_hint: 'LOW' }]);
    setJexlExpression('');
    setAggSinkEnabled(true);
    setAnomalySinkEnabled(true);
    setAnomalyStoreSinkEnabled(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!atLeastOneSink) { alert('At least one output must be enabled.'); return; }
    if (windowSize <= 0) { alert('Time window must be greater than 0 seconds.'); return; }
    if (windowType === 'SLIDING' && windowSlide > windowSize) { alert('Slide interval cannot exceed the window size.'); return; }
    if (aggregations.length > 3) { alert('Maximum of 3 metrics allowed per rule.'); return; }

    const size_ms = Math.round(windowSize * 1000);
    const slide_ms = windowType === 'TUMBLING' ? size_ms : Math.round(windowSlide * 1000);
    const processedFilters = processFilterTree(filterTree);
    const alignment_offset_ms = (alignHour * 3600 + alignMinute * 60 + alignSecond) * 1000;
    // Cluster removed — only source topic is needed
    const execution_routing = { target_source_topic: 'BI.AUTH.AUTH_TXN.UNION.V1' };

    const groupingPayload = {
      keys: isGlobal ? ['__GLOBAL__'] : keys.filter(k => k.trim() !== ''),
      entity_name: entityName.trim() || undefined,
    };
    if (useAnomalyEntityField && anomalyEntityField.trim()) {
      groupingPayload.anomaly_entity_field = anomalyEntityField.trim();
    }

    const payload = {
      rule_metadata: {
        rule_id: ruleId,
        status: 'DRAFT',
        severity_level: severity,
        penalty_ttl_seconds: penaltyTtl
      },
      execution_routing,
      filters: processedFilters,
      grouping: groupingPayload,
      windowing: {
        type: windowType,
        time_type: timeType,
        timestamp_field: timeType === 'EVENT_TIME' && eventTimeSource === 'CUSTOM'
          ? customTsField : '_event_timestamp_epoch_ms',
        timestamp_format: timeType === 'EVENT_TIME' && eventTimeSource === 'CUSTOM'
          ? customTsFormat : 'EPOCH_MILLIS',
        use_kafka_timestamp: timeType === 'EVENT_TIME' && eventTimeSource === 'KAFKA_TIMESTAMP',
        size_ms, slide_ms,
        allowed_lateness_ms: lateness * 1000,
        alignment_offset_ms
      },
      aggregations,
      having_thresholds: { expression: jexlExpression },
      sinks: {
        agg_sink_enabled: aggSinkEnabled,
        anomaly_sink_enabled: anomalySinkEnabled,
        anomaly_store_sink_enabled: anomalyStoreSinkEnabled,
      }
    };

    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert('Rule saved successfully!');
        fetchRules();
        resetForm();
      } else {
        alert('Failed to save rule. Please check backend logs.');
      }
    } catch (err) {
      console.error('Save error:', err);
      alert('Network error. Please try again.');
    }
  };

  const fieldLabel = (label, tip) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '0.35rem' }}>
      <span className="section-title" style={{ textTransform: 'none', fontSize: '0.74rem' }}>{label}</span>
      {tip && <Tip text={tip} />}
    </div>
  );

  return (
    <div className="glass-panel" style={{ maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
      {/* Header */}
      <div className="section-header" style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0 }}>
          New Detection Rule
        </h2>
        <span className="badge badge-indigo">Draft</span>
      </div>

      <form onSubmit={handleSave}>

        {/* ── Step 1: Basics ── */}
        <div style={{ marginBottom: '1.5rem' }}>
          <p className="section-title" style={{ marginBottom: '0.75rem' }}>① Basics</p>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem' }}>
            <div>
              {fieldLabel('Rule ID', 'Auto-generated unique identifier. You can keep this or enter your own.')}
              <input value={ruleId} onChange={e => setRuleId(e.target.value)} required />
            </div>
            <div>
              {fieldLabel('Alert Severity', 'How severe is a breach of this rule?')}
              <select value={severity} onChange={e => setSeverity(e.target.value)}>
                <option>LOW</option>
                <option>MEDIUM</option>
                <option>HIGH</option>
                <option>CRITICAL</option>
              </select>
            </div>
            <div>
              {fieldLabel('Cooldown Period (sec)', 'How long to suppress repeat alerts for the same entity after a breach.')}
              <input type="number" value={penaltyTtl} onChange={e => setPenaltyTtl(Number(e.target.value))} min="1" required />
            </div>
          </div>
        </div>

        {/* ── Step 2: What to track ── */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-raised)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <p className="section-title" style={{ marginBottom: '0.75rem' }}>② What to Track</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {fieldLabel('Group By Field', 'The event field used to separate entities. Each unique value is tracked independently.')}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', color: 'var(--accent-cyan)', fontSize: '0.78rem', fontWeight: 500 }}>
              <input
                type="checkbox"
                checked={isGlobal}
                onChange={e => setIsGlobal(e.target.checked)}
                style={{ width: 'auto', accentColor: 'var(--accent-cyan)' }}
              />
              Monitor all events as one (no grouping)
            </label>
          </div>

          {!isGlobal && keys.map((k, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <input
                value={k}
                onChange={e => { const nk = [...keys]; nk[i] = e.target.value; setKeys(nk); }}
                placeholder="e.g. _data.aua or _data.uid"
                required
              />
              {keys.length > 1 && (
                <button type="button" className="btn btn-danger" style={{ padding: '0.45rem 0.6rem' }}
                  onClick={() => setKeys(keys.filter((_, idx) => idx !== i))}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {!isGlobal && (
            <button type="button" className="btn btn-ghost" style={{ fontSize: '0.78rem', marginTop: '0.25rem' }}
              onClick={() => setKeys([...keys, ''])}>
              <Plus size={13} /> Add another field
            </button>
          )}
          {isGlobal && (
            <p className="helper" style={{ marginTop: '0.5rem' }}>All incoming events will be counted together in a single global bucket.</p>
          )}

          <div style={{ marginTop: '1rem' }}>
            {fieldLabel('Entity Label', 'A friendly name for what you are tracking — shown in dashboards and alerts. Optional.')}
            <input
              value={entityName}
              onChange={e => setEntityName(e.target.value)}
              placeholder={isGlobal ? 'e.g. Global Auth Traffic' : 'e.g. AUA Code, Reference ID, User ID'}
            />
          </div>

          {/* Anomaly entity field — only shown when anomaly sinks enabled */}
          {(anomalySinkEnabled || anomalyStoreSinkEnabled) && (
            <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(244,114,182,0.04)', borderRadius: '6px', border: '1px solid rgba(244,114,182,0.15)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.78rem', color: '#f472b6', fontWeight: 500, marginBottom: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={useAnomalyEntityField}
                  onChange={e => setUseAnomalyEntityField(e.target.checked)}
                  style={{ width: 'auto', accentColor: '#f472b6' }}
                />
                Use a specific field as the alert identifier
                <Tip text="When a breach occurs, this field's value will be stored in the alert and penalty blocklist. If the field is missing, the group-by value is used as a fallback." />
              </label>
              {useAnomalyEntityField && (
                <input
                  value={anomalyEntityField}
                  onChange={e => setAnomalyEntityField(e.target.value)}
                  placeholder="e.g. _data.refId"
                  required
                />
              )}
            </div>
          )}
        </div>

        {/* ── Step 3: Filters ── */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-raised)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <p className="section-title" style={{ marginBottom: '0.75rem' }}>③ Event Filters
            <Tip text="Only events matching ALL these conditions will be counted. Leave empty to count all events." />
          </p>
          {filterTree.conditions && filterTree.conditions.length === 0 && (
            <p className="helper" style={{ marginBottom: '0.75rem' }}>No filters — all events are counted. Use the builder below to add conditions.</p>
          )}
          <VisualFilterBuilder filterTree={filterTree} setFilterTree={setFilterTree} />
        </div>

        {/* ── Step 4: Time Window ── */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-raised)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <p className="section-title" style={{ marginBottom: '0.75rem' }}>④ Time Window</p>
          <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.84rem' }}>
              <input type="radio" checked={timeType === 'EVENT_TIME'} onChange={() => setTimeType('EVENT_TIME')} style={{ width: 'auto', accentColor: 'var(--accent-indigo)' }} />
              Actual Event Time
              <Tip text="Uses the timestamp recorded inside the event itself. Recommended for accuracy." />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.84rem' }}>
              <input type="radio" checked={timeType === 'PROCESSING_TIME'} onChange={() => setTimeType('PROCESSING_TIME')} style={{ width: 'auto', accentColor: 'var(--accent-indigo)' }} />
              System Received Time
              <Tip text="Uses the time the system received the event. Simpler, but may be inaccurate for delayed events." />
            </label>
          </div>

          {timeType === 'EVENT_TIME' && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(99,102,241,0.05)', borderRadius: '6px', border: '1px solid rgba(99,102,241,0.15)' }}>
              <p style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                Timestamp Source
              </p>
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                  <input type="radio" checked={eventTimeSource === 'KAFKA_TIMESTAMP'} onChange={() => setEventTimeSource('KAFKA_TIMESTAMP')} style={{ width: 'auto', accentColor: 'var(--accent-indigo)' }} />
                  Message arrival time
                  <Tip text="The time the event was received by the message queue. Best default choice." />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                  <input type="radio" checked={eventTimeSource === 'CUSTOM'} onChange={() => setEventTimeSource('CUSTOM')} style={{ width: 'auto', accentColor: 'var(--accent-indigo)' }} />
                  Custom field in event
                </label>
              </div>
              {eventTimeSource === 'CUSTOM' && (
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', alignItems: 'flex-end' }}>
                  <div style={{ flex: 2 }}>
                    {fieldLabel('Field Path', 'Path to the timestamp field inside the event. Falls back to arrival time if missing.')}
                    <input value={customTsField} onChange={e => setCustomTsField(e.target.value)} placeholder="e.g. _event_timestamp" required />
                  </div>
                  <div style={{ flex: 1 }}>
                    {fieldLabel('Format')}
                    <select value={customTsFormat} onChange={e => setCustomTsFormat(e.target.value)}>
                      <option value="ISO_STRING">ISO Date String</option>
                      <option value="EPOCH_MILLIS">Unix Timestamp (ms)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 150px' }}>
              {fieldLabel('Window Type', '"Rolling" overlaps with previous windows; "Fixed" creates discrete, non-overlapping periods.')}
              <select value={windowType} onChange={e => setWindowType(e.target.value)}>
                <option value="SLIDING">Rolling Time Interval</option>
                <option value="TUMBLING">Fixed Time Interval</option>
              </select>
            </div>
            <div style={{ flex: '0 1 140px' }}>
              {fieldLabel('Window Size (sec)', 'How many seconds of events to include in each analysis window.')}
              <input type="number" value={windowSize} onChange={e => setWindowSize(Number(e.target.value))} min="1" step="1" required />
            </div>
            {windowType === 'SLIDING' && (
              <div style={{ flex: '0 1 140px' }}>
                {fieldLabel('Emit Every (sec)', 'How often to produce a result. Must be ≤ window size.')}
                <input type="number" value={windowSlide} onChange={e => setWindowSlide(Number(e.target.value))} min="1" step="1" required />
              </div>
            )}
          </div>

          {/* Advanced windowing settings */}
          <div style={{ marginTop: '1rem' }}>
            <Accordion title="Advanced Timing Settings">
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '0 1 180px' }}>
                  {fieldLabel('Late Event Grace Period (sec)', 'Accept events that arrive late by up to this many seconds. Set to 0 to discard all late events.')}
                  <input type="number" value={lateness} onChange={e => setLateness(Number(e.target.value))} min="0" />
                </div>
                <div style={{ flex: '0 1 auto' }}>
                  {fieldLabel('Window Start Alignment (HH:MM:SS)', 'Anchor windows to a specific time of day (e.g. midnight = 00:00:00). Usually leave at 00:00:00.')}
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <input type="number" value={alignHour} onChange={e => setAlignHour(Math.min(23, Math.max(0, Number(e.target.value))))} min={0} max={23} style={{ width: '60px' }} />
                    <span style={{ color: 'var(--text-muted)' }}>:</span>
                    <input type="number" value={alignMinute} onChange={e => setAlignMinute(Math.min(59, Math.max(0, Number(e.target.value))))} min={0} max={59} style={{ width: '60px' }} />
                    <span style={{ color: 'var(--text-muted)' }}>:</span>
                    <input type="number" value={alignSecond} onChange={e => setAlignSecond(Math.min(59, Math.max(0, Number(e.target.value))))} min={0} max={59} style={{ width: '60px' }} />
                  </div>
                </div>
              </div>
            </Accordion>
          </div>
        </div>

        {/* ── Step 5: Metrics ── */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-raised)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div className="section-header">
            <p className="section-title">⑤ Metrics to Compute
              <Tip text="Define what to measure per entity per time window. Maximum 3 metrics per rule." />
            </p>
            {aggregations.length < 3 && (
              <button type="button" className="btn btn-ghost" style={{ fontSize: '0.78rem' }}
                onClick={() => setAggregations([...aggregations, { alias: '', field: '', function: 'COUNT', cardinality_hint: 'LOW' }])}>
                <Plus size={13} /> Add metric
              </button>
            )}
          </div>
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {aggregations.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.6rem', background: 'var(--surface)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <div style={{ flex: '1 1 130px' }}>
                  {i === 0 && <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>METRIC NAME</p>}
                  <input value={a.alias} onChange={e => { const na = [...aggregations]; na[i].alias = e.target.value; setAggregations(na); }} placeholder="e.g. total_auths" required />
                </div>
                <div style={{ flex: '2 1 160px' }}>
                  {i === 0 && <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>FIELD TO MEASURE</p>}
                  <input value={a.field} onChange={e => { const na = [...aggregations]; na[i].field = e.target.value; setAggregations(na); }} placeholder="e.g. _data.uid" required />
                </div>
                <div style={{ flex: '1 1 120px' }}>
                  {i === 0 && <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>FUNCTION</p>}
                  <select value={a.function} onChange={e => { const na = [...aggregations]; na[i].function = e.target.value; if (e.target.value === 'COUNT_DISTINCT') na[i].cardinality_hint = 'HIGH'; setAggregations(na); }}>
                    <option value="COUNT">Count</option>
                    <option value="COUNT_DISTINCT">Count Unique Values</option>
                    <option value="SUM">Sum</option>
                    <option value="AVG">Average</option>
                    <option value="MIN">Minimum</option>
                    <option value="MAX">Maximum</option>
                  </select>
                </div>
                {a.function === 'COUNT_DISTINCT' && (
                  <div style={{ flex: '0 1 140px' }}>
                    {i === 0 && <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>DATA UNIQUENESS</p>}
                    <select value={a.cardinality_hint} onChange={e => { const na = [...aggregations]; na[i].cardinality_hint = e.target.value; setAggregations(na); }}>
                      <option value="LOW">Few unique values</option>
                      <option value="HIGH">Many unique values</option>
                    </select>
                  </div>
                )}
                {aggregations.length > 1 && (
                  <button type="button" className="btn btn-danger" style={{ padding: '0.45rem 0.5rem', flexShrink: 0 }}
                    onClick={() => setAggregations(aggregations.filter((_, idx) => idx !== i))}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Step 6: Alert Condition ── */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-raised)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <p className="section-title" style={{ marginBottom: '0.75rem' }}>⑥ Alert Condition
            <Tip text="Define when this rule should fire an alert. Use the metric names you defined above. If no condition is set, data is always recorded but no alerts are sent." />
          </p>
          <VisualThresholdBuilder expression={jexlExpression} setExpression={setJexlExpression} aggregations={aggregations} />
        </div>

        {/* ── Step 7: Outputs ── */}
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--surface-raised)', borderRadius: '8px', border: !atLeastOneSink ? '1px solid var(--danger)' : '1px solid var(--border)', borderRadius: '8px' }}>
          <div className="section-header">
            <p className="section-title">⑦ Outputs
              <Tip text="Choose where results are sent. At least one output must be enabled." />
            </p>
            {!atLeastOneSink && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--danger)', fontSize: '0.75rem' }}>
                <AlertTriangle size={13} /> Select at least one
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <SinkCard id="sink-agg" color="var(--accent-indigo)"
              title="Save Summary Data"
              subtitle="Store aggregated metrics per time window in ClickHouse. Use for trend analysis."
              checked={aggSinkEnabled} onChange={e => setAggSinkEnabled(e.target.checked)} />
            <SinkCard id="sink-anomaly" color="#f472b6"
              title="Send Breach Alerts"
              subtitle="Emit an alert to the anomaly topic the moment a threshold is crossed."
              checked={anomalySinkEnabled} onChange={e => setAnomalySinkEnabled(e.target.checked)} />
            <SinkCard id="sink-store" color="var(--accent-emerald)"
              title="Add to Penalty List"
              subtitle="Add the breaching entity to Redis for real-time blocking by other services."
              checked={anomalyStoreSinkEnabled} onChange={e => setAnomalyStoreSinkEnabled(e.target.checked)} />
          </div>
        </div>

        {/* ── Submit ── */}
        <button
          type="submit"
          className="btn btn-accent"
          style={{ width: '100%', justifyContent: 'center', fontSize: '0.9rem', padding: '0.7rem', opacity: atLeastOneSink ? 1 : 0.5 }}
          disabled={!atLeastOneSink}
        >
          <Save size={16} /> Save Rule as Draft
        </button>
      </form>
    </div>
  );
}
