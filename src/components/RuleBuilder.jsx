import React, { useState } from 'react';
import { Save, Plus, Trash2, AlertTriangle, ChevronDown, ChevronRight, Zap, Clock, Database, Filter, BarChart2, Bell } from 'lucide-react';
import VisualThresholdBuilder from './VisualThresholdBuilder';
import VisualFilterBuilder, { processFilterTree } from './VisualFilterBuilder';
import { API_BASE, DEFAULT_SOURCE_TOPIC, DEFAULT_PENALTY_TTL_SEC, DEFAULT_WINDOW_SIZE_SEC, DEFAULT_SLIDE_SEC } from '../config/appConfig';

/* ─── Helpers ─────────────────────────────────────────────────── */
function Tip({ text }) {
  return (
    <span className="tooltip-wrap">
      <span className="tooltip-icon">?</span>
      <span className="tooltip-text">{text}</span>
    </span>
  );
}

function FieldLabel({ label, tip, required }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '0.3rem' }}>
      <span className="form-label">
        {label}
        {required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
      </span>
      {tip && <Tip text={tip} />}
    </div>
  );
}

function Accordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        className={`accordion-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span>{title}</span>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {open && <div className="accordion-content">{children}</div>}
    </div>
  );
}

/* ─── Section wrapper ─────────────────────────────────────────── */
function Section({ icon: Icon, iconColor = 'var(--violet-light)', title, tip, badge, children, error }) {
  return (
    <div style={{
      marginBottom: '0.75rem',
      borderRadius: '8px',
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.625rem 1rem',
        background: 'var(--surface-3)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: 5,
          background: `${iconColor}15`,
          border: `1px solid ${iconColor}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={12} color={iconColor} strokeWidth={2.2} />
        </div>
        <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-1)', letterSpacing: '0.005em' }}>{title}</span>
        {tip && <Tip text={tip} />}
        {badge && <span className="badge badge-violet" style={{ marginLeft: 'auto' }}>{badge}</span>}
        {error && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginLeft: badge ? '0.5rem' : 'auto', color: 'var(--danger)', fontSize: '0.71rem' }}>
            <AlertTriangle size={11} /> {error}
          </span>
        )}
      </div>
      <div style={{ padding: '0.875rem 1rem' }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Sink Card ──────────────────────────────────────────────── */
function SinkCard({ id, accentColor, title, subtitle, checked, onChange }) {
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.6rem',
        padding: '0.75rem 0.875rem',
        borderRadius: '7px',
        border: checked ? `1px solid ${accentColor}40` : '1px solid var(--border)',
        background: checked ? `${accentColor}0d` : 'var(--surface-3)',
        cursor: 'pointer',
        transition: 'all 0.14s ease',
        flex: '1 1 0',
        minWidth: '140px',
      }}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ width: 'auto', marginTop: 3, accentColor, flexShrink: 0 }}
      />
      <span>
        <span style={{ color: checked ? accentColor : 'var(--text-1)', fontWeight: 600, fontSize: '0.8rem', display: 'block', marginBottom: '0.18rem', transition: 'color 0.15s' }}>
          {title}
        </span>
        <span style={{ color: 'var(--text-3)', fontSize: '0.7rem', lineHeight: 1.45 }}>{subtitle}</span>
      </span>
    </label>
  );
}

/* ─── TTL Unit Converter ──────────────────────────────────────── */
const TTL_UNITS = [
  { label: 'Seconds', value: 'sec',  factor: 1 },
  { label: 'Minutes', value: 'min',  factor: 60 },
  { label: 'Hours',   value: 'hr',   factor: 3600 },
  { label: 'Days',    value: 'day',  factor: 86400 },
];

function ttlToSeconds(amount, unit) {
  const u = TTL_UNITS.find(u => u.value === unit);
  return Math.round(Number(amount) * (u ? u.factor : 1));
}

/* ─── Main Component ─────────────────────────────────────────── */
export default function RuleBuilder({ rules, fetchRules, onFieldFocus }) {
  // ── Core ───────────────────────────────────────────────────────
  const [ruleId, setRuleId]       = useState(crypto.randomUUID());

  const [severity, setSeverity]   = useState('HIGH');

  // TTL with unit picker
  const [ttlAmount, setTtlAmount] = useState(1);
  const [ttlUnit,   setTtlUnit]   = useState('hr');

  // ── Windowing ──────────────────────────────────────────────────
  const [windowType,       setWindowType]       = useState('SLIDING');
  const [timeType,         setTimeType]         = useState('EVENT_TIME');
  const [eventTimeSource,  setEventTimeSource]  = useState('KAFKA_TIMESTAMP');
  const [customTsField,    setCustomTsField]    = useState('');
  const [customTsFormat,   setCustomTsFormat]   = useState('EPOCH_MILLIS');
  const [windowSize,       setWindowSize]       = useState(DEFAULT_WINDOW_SIZE_SEC);
  const [windowSlide,      setWindowSlide]      = useState(DEFAULT_SLIDE_SEC);
  const [lateness,         setLateness]         = useState(0);
  const [alignHour,        setAlignHour]        = useState(0);
  const [alignMinute,      setAlignMinute]      = useState(0);
  const [alignSecond,      setAlignSecond]      = useState(0);

  // ── Grouping ───────────────────────────────────────────────────
  const [keys,                  setKeys]                  = useState(['_data.aua']);
  const [isGlobal,              setIsGlobal]              = useState(false);
  const [entityName,            setEntityName]            = useState('');
  const [useAnomalyEntityField, setUseAnomalyEntityField] = useState(false);
  const [anomalyEntityField,    setAnomalyEntityField]    = useState('');

  // ── Filters ───────────────────────────────────────────────────
  const [filterTree, setFilterTree] = useState({ type: 'group', logic: 'AND', conditions: [] });

  // ── Aggregations ──────────────────────────────────────────────
  const [aggregations, setAggregations] = useState([
    { alias: 'total_count', field: '_data.authCode', function: 'COUNT', cardinality_hint: 'LOW' }
  ]);

  // ── Alert Condition ───────────────────────────────────────────
  const [jexlExpression, setJexlExpression] = useState('');

  // ── Sinks ─────────────────────────────────────────────────────
  const [aggSinkEnabled,         setAggSinkEnabled]         = useState(true);
  const [anomalySinkEnabled,     setAnomalySinkEnabled]     = useState(true);
  const [anomalyStoreSinkEnabled,setAnomalyStoreSinkEnabled] = useState(true);
  const atLeastOneSink = aggSinkEnabled || anomalySinkEnabled || anomalyStoreSinkEnabled;

  const resetForm = () => {
    setRuleId(crypto.randomUUID());

    setSeverity('HIGH');
    setTtlAmount(1); setTtlUnit('hr');
    setWindowType('SLIDING'); setTimeType('EVENT_TIME');
    setEventTimeSource('KAFKA_TIMESTAMP');
    setCustomTsField(''); setCustomTsFormat('EPOCH_MILLIS');
    setWindowSize(DEFAULT_WINDOW_SIZE_SEC); setWindowSlide(DEFAULT_SLIDE_SEC);
    setLateness(0); setAlignHour(0); setAlignMinute(0); setAlignSecond(0);
    setKeys(['_data.aua']); setIsGlobal(false);
    setEntityName(''); setUseAnomalyEntityField(false); setAnomalyEntityField('');
    setFilterTree({ type: 'group', logic: 'AND', conditions: [] });
    setAggregations([{ alias: 'total_count', field: '_data.authCode', function: 'COUNT', cardinality_hint: 'LOW' }]);
    setJexlExpression('');
    setAggSinkEnabled(true); setAnomalySinkEnabled(true); setAnomalyStoreSinkEnabled(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!atLeastOneSink)           { alert('At least one output must be enabled.'); return; }
    if (windowSize <= 0)           { alert('Time window must be greater than 0 seconds.'); return; }
    if (windowType === 'SLIDING' && windowSlide > windowSize) {
      alert('Slide interval cannot exceed the window size.'); return;
    }
    if (aggregations.length > 3)   { alert('Maximum of 3 metrics allowed per rule.'); return; }

    const penaltyTtlSeconds   = ttlToSeconds(ttlAmount, ttlUnit);
    const size_ms             = Math.round(windowSize * 1000);
    const slide_ms            = windowType === 'TUMBLING' ? size_ms : Math.round(windowSlide * 1000);
    const processedFilters    = processFilterTree(filterTree);
    const alignment_offset_ms = (alignHour * 3600 + alignMinute * 60 + alignSecond) * 1000;

    const groupingPayload = {
      keys: isGlobal ? ['__GLOBAL__'] : keys.filter(k => k.trim() !== ''),
      entity_name: entityName.trim() || undefined,
    };
    if (useAnomalyEntityField && anomalyEntityField.trim()) {
      groupingPayload.anomaly_entity_field = anomalyEntityField.trim();
    }

    const payload = {
      rule_metadata: {
        rule_id:            ruleId,

        status:             'DRAFT',
        severity_level:     severity,
        penalty_ttl_seconds: penaltyTtlSeconds,
      },
      execution_routing: { target_source_topic: DEFAULT_SOURCE_TOPIC },
      filters: processedFilters,
      grouping: groupingPayload,
      windowing: {
        type:          windowType,
        time_type:     timeType,
        timestamp_field: timeType === 'EVENT_TIME' && eventTimeSource === 'CUSTOM'
          ? customTsField : '_event_timestamp_epoch_ms',
        timestamp_format: timeType === 'EVENT_TIME' && eventTimeSource === 'CUSTOM'
          ? customTsFormat : 'EPOCH_MILLIS',
        use_kafka_timestamp: timeType === 'EVENT_TIME' && eventTimeSource === 'KAFKA_TIMESTAMP',
        size_ms, slide_ms,
        allowed_lateness_ms:  lateness * 1000,
        alignment_offset_ms,
      },
      aggregations,
      having_thresholds: { expression: jexlExpression },
      sinks: {
        agg_sink_enabled:          aggSinkEnabled,
        anomaly_sink_enabled:      anomalySinkEnabled,
        anomaly_store_sink_enabled: anomalyStoreSinkEnabled,
      },
    };

    try {
      const res = await fetch(`${API_BASE}/rules`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (res.ok) {
        alert('Rule saved as draft. Go to Rule Details to review and publish.');
        fetchRules();
        resetForm();
      } else {
        const text = await res.text().catch(() => '');
        alert(`Failed to save rule.${text ? '\n\n' + text : ''}`);
      }
    } catch (err) {
      console.error('Save error:', err);
      alert('Network error. Please check your connection and try again.');
    }
  };

  const sinkCount = [aggSinkEnabled, anomalySinkEnabled, anomalyStoreSinkEnabled].filter(Boolean).length;

  return (
    <div
      className="glass-panel"
      style={{ maxHeight: 'calc(100vh - 108px)', overflowY: 'auto', paddingBottom: '1.5rem' }}
    >
      {/* ── Header ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        marginBottom: '1.25rem', paddingBottom: '1rem',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: 'linear-gradient(135deg, #5865f2 0%, #2dd4bf 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          boxShadow: '0 0 0 1px rgba(88,101,242,0.3), 0 2px 8px rgba(0,0,0,0.3)',
        }}>
          <Zap size={14} color="#fff" strokeWidth={2.5} />
        </div>
        <div>
          <h2 style={{ fontSize: '0.92rem', fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-1)', margin: 0 }}>
            New Detection Rule
          </h2>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: 0 }}>Saved as draft — publish when ready</p>
        </div>
        <span className="badge badge-draft" style={{ marginLeft: 'auto' }}>Draft</span>
      </div>

      <form onSubmit={handleSave}>

        {/* ── Section 1: Basics ───────────────────────────────── */}
        <Section icon={Zap} iconColor="var(--violet-light)" title="Identification">
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <FieldLabel label="Alert Severity" tip="Priority level assigned when this rule fires an alert." required />
              <select value={severity} onChange={e => setSeverity(e.target.value)}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
            <div>
              <FieldLabel
                label="Rule ID"
                tip="Unique system identifier. Auto-generated — you can customize it."
              />
              <input
                value={ruleId}
                onChange={e => setRuleId(e.target.value)}
                required
                style={{ fontFamily: 'monospace', fontSize: '0.78rem', letterSpacing: '-0.01em' }}
              />
            </div>
            <div>
              <FieldLabel
                label="Redis Key TTL"
                tip="How long a flagged entity stays in the Redis penalty list before it's automatically removed. Only used when 'Add to Penalty List' output is enabled."
              />
              <div className="input-unit-row">
                <input
                  type="number"
                  value={ttlAmount}
                  onChange={e => setTtlAmount(e.target.value)}
                  min="1"
                  step="1"
                  required
                  placeholder="1"
                />
                <select value={ttlUnit} onChange={e => setTtlUnit(e.target.value)}>
                  {TTL_UNITS.map(u => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>
              <p className="helper">= {ttlToSeconds(ttlAmount, ttlUnit).toLocaleString()} seconds</p>
            </div>
          </div>
        </Section>

        {/* ── Section 2: What to Track ────────────────────────── */}
        <Section icon={Filter} iconColor="var(--teal)" title="What to Track">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <FieldLabel
              label="Group By Field"
              tip="The event field used to separate entities. Each unique value is tracked independently (e.g., each AUA code gets its own counter)."
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.74rem', color: 'var(--teal)', fontWeight: 500, flexShrink: 0, marginLeft: '0.75rem' }}>
              <input
                type="checkbox"
                checked={isGlobal}
                onChange={e => setIsGlobal(e.target.checked)}
                style={{ width: 'auto', accentColor: 'var(--teal)' }}
              />
              Track all events together
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
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ padding: '0.45rem 0.55rem', flexShrink: 0 }}
                  onClick={() => setKeys(keys.filter((_, idx) => idx !== i))}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
          {!isGlobal && keys.length < 3 && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '0.76rem', marginTop: '0.2rem' }}
              onClick={() => setKeys([...keys, ''])}
            >
              <Plus size={12} /> Add field
            </button>
          )}
          {isGlobal && (
            <p className="helper">All events will be counted in a single global bucket — no per-entity breakdown.</p>
          )}

          <div style={{ marginTop: '0.875rem' }}>
            <FieldLabel label="Entity Label" tip="Optional friendly label shown in alerts and dashboards. Describe what you are tracking." />
            <input
              value={entityName}
              onChange={e => setEntityName(e.target.value)}
              placeholder={isGlobal ? 'e.g. Global Auth Traffic' : 'e.g. AUA Code, Reference ID'}
            />
          </div>

          {(anomalySinkEnabled || anomalyStoreSinkEnabled) && (
            <div style={{ marginTop: '0.875rem', padding: '0.7rem 0.875rem', background: 'rgba(124,58,237,0.06)', borderRadius: '7px', border: '1px solid rgba(124,58,237,0.15)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--violet-light)', fontWeight: 500, marginBottom: useAnomalyEntityField ? '0.5rem' : 0 }}>
                <input
                  type="checkbox"
                  checked={useAnomalyEntityField}
                  onChange={e => setUseAnomalyEntityField(e.target.checked)}
                  style={{ width: 'auto', accentColor: 'var(--violet)' }}
                />
                Use a specific field as the alert identifier
                <Tip text="When a breach is detected, this field's value will be stored in the alert and used as the Redis key. Falls back to the group-by value if the field is missing." />
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
        </Section>

        {/* ── Section 3: Filters ──────────────────────────────── */}
        <Section
          icon={Filter}
          iconColor="var(--amber)"
          title="Event Filters"
          tip="Only events matching these conditions will be included in the analysis. Leave empty to include all events."
          badge={filterTree.conditions?.length > 0 ? `${filterTree.conditions.length} conditions` : null}
        >
          {(!filterTree.conditions || filterTree.conditions.length === 0) && (
            <p className="helper" style={{ marginBottom: '0.75rem' }}>No filters — all events on the source topic are counted.</p>
          )}
          <VisualFilterBuilder filterTree={filterTree} setFilterTree={setFilterTree} />
        </Section>

        {/* ── Section 4: Time Window ──────────────────────────── */}
        <Section icon={Clock} iconColor="var(--teal)" title="Time Window">
          {/* Timing Mode */}
          <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {[
              { val: 'EVENT_TIME',      label: 'Actual Event Time',    tip: 'Uses the timestamp recorded inside each event. Most accurate.' },
              { val: 'PROCESSING_TIME', label: 'System Received Time', tip: 'Uses the time the platform received the event. Simpler, but may drift for delayed events.' },
            ].map(({ val, label, tip }) => (
              <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-2)', fontWeight: 500 }}>
                <input
                  type="radio"
                  checked={timeType === val}
                  onChange={() => setTimeType(val)}
                  style={{ width: 'auto', accentColor: 'var(--violet)' }}
                />
                {label}
                <Tip text={tip} />
              </label>
            ))}
          </div>

          {/* Event Time Source */}
          {timeType === 'EVENT_TIME' && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--surface-3)', borderRadius: '7px', border: '1px solid var(--border)' }}>
              <p className="form-label" style={{ marginBottom: '0.5rem' }}>Timestamp Source</p>
              <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                {[
                  { val: 'KAFKA_TIMESTAMP', label: 'Message arrival time', tip: 'The time the event arrived in the message queue. Best default choice.' },
                  { val: 'CUSTOM',          label: 'Field inside the event', tip: 'Use a timestamp field embedded in the event payload.' },
                ].map(({ val, label, tip }) => (
                  <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-2)' }}>
                    <input
                      type="radio"
                      checked={eventTimeSource === val}
                      onChange={() => setEventTimeSource(val)}
                      style={{ width: 'auto', accentColor: 'var(--violet)' }}
                    />
                    {label}
                    <Tip text={tip} />
                  </label>
                ))}
              </div>
              {eventTimeSource === 'CUSTOM' && (
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 2 }}>
                    <FieldLabel label="Timestamp Field Path" tip="JSON path to the timestamp inside each event." required />
                    <input
                      value={customTsField}
                      onChange={e => setCustomTsField(e.target.value)}
                      placeholder="e.g. _event_timestamp"
                      required
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <FieldLabel label="Format" />
                    <select value={customTsFormat} onChange={e => setCustomTsFormat(e.target.value)}>
                      <option value="EPOCH_MILLIS">Unix ms (epoch)</option>
                      <option value="ISO_STRING">ISO date string</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Window Config */}
          <div style={{ display: 'grid', gridTemplateColumns: windowType === 'SLIDING' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '0.75rem', alignItems: 'start' }}>
            <div>
              <FieldLabel label="Window Type" tip="Rolling: overlaps with the previous window. Fixed: discrete non-overlapping intervals." required />
              <select value={windowType} onChange={e => setWindowType(e.target.value)}>
                <option value="SLIDING">Rolling (overlapping)</option>
                <option value="TUMBLING">Fixed (non-overlapping)</option>
              </select>
            </div>
            <div>
              <FieldLabel label="Window Size (sec)" required />
              <input
                type="number"
                value={windowSize}
                onChange={e => setWindowSize(Number(e.target.value))}
                min="1" step="1" required
              />
            </div>
            {windowType === 'SLIDING' && (
              <div>
                <FieldLabel label="Slide By (sec)" tip="How frequently a new result is emitted. Must be ≤ window size." required />
                <input
                  type="number"
                  value={windowSlide}
                  onChange={e => setWindowSlide(Number(e.target.value))}
                  min="1" step="1" required
                />
              </div>
            )}
          </div>

          <div style={{ marginTop: '0.75rem' }}>
            <Accordion title="Advanced Timing">
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ flex: '0 1 180px' }}>
                  <FieldLabel label="Late Event Grace (sec)" tip="Accept events arriving late by this many seconds. 0 = discard all late events." />
                  <input
                    type="number"
                    value={lateness}
                    onChange={e => setLateness(Number(e.target.value))}
                    min="0"
                  />
                </div>
                <div style={{ flex: '0 1 auto' }}>
                  <FieldLabel label="Window Alignment (HH:MM:SS)" tip="Anchor windows to a specific time of day, e.g. midnight = 00:00:00." />
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    {[
                      { val: alignHour,   set: setAlignHour,   max: 23 },
                      { val: alignMinute, set: setAlignMinute, max: 59 },
                      { val: alignSecond, set: setAlignSecond, max: 59 },
                    ].map(({ val, set, max }, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span style={{ color: 'var(--text-3)', fontSize: '0.9rem', flexShrink: 0 }}>:</span>}
                        <input
                          type="number"
                          value={val}
                          onChange={e => set(Math.min(max, Math.max(0, Number(e.target.value))))}
                          min={0} max={max}
                          style={{ width: '58px' }}
                        />
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </Accordion>
          </div>
        </Section>

        {/* ── Section 5: Metrics ──────────────────────────────── */}
        <Section
          icon={BarChart2}
          iconColor="var(--violet-light)"
          title="Metrics to Compute"
          tip="Define what to measure per entity per time window. Maximum 3 metrics."
          badge={`${aggregations.length}/3`}
        >
          {aggregations.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1.6fr 1.1fr 28px',
              gap: '0.5rem',
              padding: '0 0 0.4rem',
              marginBottom: '0.1rem',
            }}>
              {['Name', 'Field', 'Function', ''].map(label => (
                <p key={label} style={{ fontSize: '0.61rem', color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>{label}</p>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.625rem' }}>
            {aggregations.map((a, i) => (
              <div key={i}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.6fr 1.1fr 28px',
                  gap: '0.5rem',
                  alignItems: 'center',
                  padding: '0.5rem 0.625rem',
                  background: 'var(--surface-3)',
                  borderRadius: a.function === 'COUNT_DISTINCT' ? '6px 6px 0 0' : '6px',
                  border: '1px solid var(--border)',
                  borderBottom: a.function === 'COUNT_DISTINCT' ? 'none' : '1px solid var(--border)',
                }}
                >
                  <input
                    value={a.alias}
                    onChange={e => { const na = [...aggregations]; na[i].alias = e.target.value; setAggregations(na); }}
                    placeholder="e.g. total_auths"
                    required
                  />
                  <input
                    value={a.field}
                    onChange={e => { const na = [...aggregations]; na[i].field = e.target.value; setAggregations(na); }}
                    placeholder="e.g. _data.uid"
                    required
                  />
                  <select
                    value={a.function}
                    onChange={e => {
                      const na = [...aggregations];
                      na[i].function = e.target.value;
                      if (e.target.value === 'COUNT_DISTINCT') na[i].cardinality_hint = 'HIGH';
                      setAggregations(na);
                    }}
                  >
                    <option value="COUNT">Count</option>
                    <option value="COUNT_DISTINCT">Count Unique</option>
                    <option value="SUM">Sum</option>
                    <option value="AVG">Average</option>
                    <option value="MIN">Minimum</option>
                    <option value="MAX">Maximum</option>
                  </select>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {aggregations.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ padding: '0.3rem 0.35rem', minWidth: 0, width: 28, height: 28, justifyContent: 'center' }}
                        onClick={() => setAggregations(aggregations.filter((_, idx) => idx !== i))}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
                {a.function === 'COUNT_DISTINCT' && (
                  <div style={{
                    padding: '0.35rem 0.625rem',
                    background: 'var(--surface-3)',
                    borderRadius: '0 0 6px 6px',
                    border: '1px solid var(--border)',
                    borderTop: '1px solid var(--border-2)',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                  }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', fontWeight: 500 }}>Uniqueness scale:</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-2)', fontWeight: 500 }}>
                      <input
                        type="radio"
                        checked={a.cardinality_hint === 'LOW'}
                        onChange={() => { const na = [...aggregations]; na[i].cardinality_hint = 'LOW'; setAggregations(na); }}
                        style={{ width: 'auto', accentColor: 'var(--violet)' }}
                      />
                      Few unique values
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--text-2)', fontWeight: 500 }}>
                      <input
                        type="radio"
                        checked={a.cardinality_hint === 'HIGH'}
                        onChange={() => { const na = [...aggregations]; na[i].cardinality_hint = 'HIGH'; setAggregations(na); }}
                        style={{ width: 'auto', accentColor: 'var(--violet)' }}
                      />
                      Many unique values
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
          {aggregations.length < 3 && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '0.75rem', marginTop: '0.1rem' }}
              onClick={() => setAggregations([...aggregations, { alias: '', field: '', function: 'COUNT', cardinality_hint: 'LOW' }])}
            >
              <Plus size={12} /> Add metric
            </button>
          )}
        </Section>

        {/* ── Section 6: Alert Condition ──────────────────────── */}
        <Section
          icon={Bell}
          iconColor="#f472b6"
          title="Alert Condition"
          tip="Define when this rule fires an alert. Use the metric names you defined above. Leave empty to always record data without alerting."
        >
          <VisualThresholdBuilder
            expression={jexlExpression}
            setExpression={setJexlExpression}
            aggregations={aggregations}
          />
        </Section>

        {/* ── Section 7: Outputs ──────────────────────────────── */}
        <Section
          icon={Database}
          iconColor="var(--teal)"
          title="Outputs"
          tip="Choose where results are sent. At least one must be enabled."
          badge={`${sinkCount} active`}
          error={!atLeastOneSink ? 'Select at least one' : null}
        >
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <SinkCard
              id="sink-agg"
              accentColor="var(--violet)"
              title="Save Summary Data"
              subtitle="Store aggregated metrics per time window. Use for trend analysis and dashboards."
              checked={aggSinkEnabled}
              onChange={e => setAggSinkEnabled(e.target.checked)}
            />
            <SinkCard
              id="sink-anomaly"
              accentColor="#f472b6"
              title="Send Breach Alerts"
              subtitle="Emit a real-time alert the moment a threshold is crossed."
              checked={anomalySinkEnabled}
              onChange={e => setAnomalySinkEnabled(e.target.checked)}
            />
            <SinkCard
              id="sink-store"
              accentColor="var(--teal)"
              title="Add to Penalty List"
              subtitle="Flag the breaching entity in Redis for immediate blocking by other services."
              checked={anomalyStoreSinkEnabled}
              onChange={e => setAnomalyStoreSinkEnabled(e.target.checked)}
            />
          </div>
        </Section>

        {/* ── Submit ──────────────────────────────────────────── */}
        <button
          type="submit"
          className="btn btn-accent"
          style={{
            width: '100%',
            justifyContent: 'center',
            fontSize: '0.83rem',
            fontWeight: 600,
            padding: '0.7rem 1rem',
            borderRadius: '7px',
            opacity: atLeastOneSink ? 1 : 0.4,
            marginTop: '0.625rem',
            letterSpacing: '0.01em',
            gap: '0.45rem',
          }}
          disabled={!atLeastOneSink}
        >
          <Save size={14} />
          Save as Draft
        </button>
      </form>
    </div>
  );
}
