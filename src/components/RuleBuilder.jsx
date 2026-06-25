import React, { useState } from 'react';
import { Save, Plus, Trash2, AlertTriangle } from 'lucide-react';
import VisualThresholdBuilder from './VisualThresholdBuilder';
import VisualFilterBuilder, { processFilterTree } from './VisualFilterBuilder';

export default function RuleBuilder({ rules, fetchRules, onFieldFocus }) {

  // Basic Metadata
  const [ruleId, setRuleId] = useState(crypto.randomUUID());
  const [severity, setSeverity] = useState('HIGH');
  const [penaltyTtl, setPenaltyTtl] = useState(3600);

  // Windowing
  const [windowType, setWindowType] = useState('SLIDING');
  const [timeType, setTimeType] = useState('EVENT_TIME');
  const [eventTimeSource, setEventTimeSource] = useState('KAFKA_TIMESTAMP');
  const [customTsField, setCustomTsField] = useState('');
  const [customTsFormat, setCustomTsFormat] = useState('EPOCH_MILLIS');
  const [windowSize, setWindowSize] = useState(300);
  const [windowSlide, setWindowSlide] = useState(60);
  const [lateness, setLateness] = useState(0);

  // Window Alignment
  const [alignHour, setAlignHour] = useState(0);
  const [alignMinute, setAlignMinute] = useState(0);
  const [alignSecond, setAlignSecond] = useState(0);

  // Grouping
  const [keys, setKeys] = useState(['_data.aua']);
  const [isGlobal, setIsGlobal] = useState(false);
  const [entityName, setEntityName] = useState('');
  const [useAnomalyEntityField, setUseAnomalyEntityField] = useState(false);
  const [anomalyEntityField, setAnomalyEntityField] = useState('');

  // Filters (tree-based)
  const [filterTree, setFilterTree] = useState({ type: 'group', logic: 'AND', conditions: [] });

  // Aggregations
  const [aggregations, setAggregations] = useState([
    { alias: 'total_count', field: '_data.authCode', function: 'COUNT', cardinality_hint: 'LOW' }
  ]);

  // Having Thresholds
  const [jexlExpression, setJexlExpression] = useState('');

  // Sink Configuration — at least one must be enabled
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

    if (!atLeastOneSink) {
      alert('At least one sink must be enabled.');
      return;
    }
    if (windowSize <= 0) { alert('Window size must be greater than 0.'); return; }
    if (windowType === 'SLIDING' && windowSlide > windowSize) { alert('Slide interval cannot exceed window size.'); return; }
    if (aggregations.length > 3) { alert('Maximum of 3 aggregations allowed per rule.'); return; }

    const size_ms = Math.round(windowSize * 1000);
    const slide_ms = windowType === 'TUMBLING' ? size_ms : Math.round(windowSlide * 1000);
    const processedFilters = processFilterTree(filterTree);
    const alignment_offset_ms = (alignHour * 3600 + alignMinute * 60 + alignSecond) * 1000;
    const execution_routing = { target_source_topic: "BI.AUTH.AUTH_TXN.UNION.V1", target_cluster: "auth-cluster" };

    const groupingPayload = {
      keys: isGlobal ? ["__GLOBAL__"] : keys.filter(k => k.trim() !== ''),
      entity_name: entityName.trim() || undefined,
    };
    if (useAnomalyEntityField && anomalyEntityField.trim()) {
      groupingPayload.anomaly_entity_field = anomalyEntityField.trim();
    }

    const payload = {
      rule_metadata: { rule_id: ruleId, status: "DRAFT", severity_level: severity, penalty_ttl_seconds: penaltyTtl },
      execution_routing,
      filters: processedFilters,
      grouping: groupingPayload,
      windowing: {
        type: windowType,
        time_type: timeType,
        timestamp_field: timeType === 'EVENT_TIME' && eventTimeSource === 'CUSTOM' ? customTsField : "_event_timestamp_epoch_ms",
        timestamp_format: timeType === 'EVENT_TIME' && eventTimeSource === 'CUSTOM' ? customTsFormat : 'EPOCH_MILLIS',
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
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert('Rule saved successfully!');
        fetchRules();
        resetForm();
      } else {
        alert('Failed to save. Check backend logs.');
      }
    } catch (err) {
      console.error('Save error:', err);
      alert('Network error saving rule. Please try again.');
    }
  };

  return (
    <div style={{ display: 'block' }}>
      <div className="glass-panel" style={{ maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>
          <h2 style={{ color: 'white', margin: 0 }}>Advanced Rule Designer</h2>
        </div>

        <form onSubmit={handleSave}>

          {/* Metadata Section */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Rule ID (UUID Auto-Generated)</label>
              <input value={ruleId} onChange={e => setRuleId(e.target.value)} required />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Severity</label>
              <select value={severity} onChange={e => setSeverity(e.target.value)} onFocus={() => onFieldFocus?.('severity')}>
                <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option>
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Penalty TTL (Seconds)</label>
              <input type="number" value={penaltyTtl} onChange={e => setPenaltyTtl(Number(e.target.value))} required min="1" onFocus={() => onFieldFocus?.('penalty_ttl')} />
            </div>
          </div>

          {/* Sink Configuration */}
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: !atLeastOneSink ? '1px solid var(--danger)' : '1px solid rgba(96,165,250,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <label style={{ color: 'white', fontSize: '0.95rem' }}>Sink Configuration</label>
              {!atLeastOneSink && (
                <span style={{ color: 'var(--danger)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertTriangle size={14} /> At least one sink required
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', color: 'white' }}>
                <input type="checkbox" checked={aggSinkEnabled} onChange={e => setAggSinkEnabled(e.target.checked)} style={{ width: 'auto', marginTop: '2px', accentColor: '#60a5fa' }} />
                <span>
                  <span style={{ color: '#60a5fa', fontWeight: 600, fontSize: '0.9rem' }}>Agg Sink</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>All window results → RESULTS_TOPIC (ClickHouse via Kafka Engine)</span>
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', color: 'white' }}>
                <input type="checkbox" checked={anomalySinkEnabled} onChange={e => setAnomalySinkEnabled(e.target.checked)} style={{ width: 'auto', marginTop: '2px', accentColor: '#f472b6' }} />
                <span>
                  <span style={{ color: '#f472b6', fontWeight: 600, fontSize: '0.9rem' }}>Anomaly Sink</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>Threshold breaches (once/window) → ANOMALY_TOPIC</span>
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', color: 'white' }}>
                <input type="checkbox" checked={anomalyStoreSinkEnabled} onChange={e => setAnomalyStoreSinkEnabled(e.target.checked)} style={{ width: 'auto', marginTop: '2px', accentColor: '#34d399' }} />
                <span>
                  <span style={{ color: '#34d399', fontWeight: 600, fontSize: '0.9rem' }}>Anomaly Store</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>Breached entity values → Redis SET (penalty TTL)</span>
                </span>
              </label>
            </div>
          </div>

          {/* Grouping Keys */}
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }} onClick={() => onFieldFocus?.('grouping_keys')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
              <label style={{ color: 'white' }}>Grouping Keys</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" id="globalKey" checked={isGlobal} onChange={e => { setIsGlobal(e.target.checked); onFieldFocus?.('global_key'); }} style={{ width: 'auto' }} />
                <label htmlFor="globalKey" style={{ color: '#60a5fa', cursor: 'pointer', margin: 0 }}>Global Aggregation (No Grouping)</label>
              </div>
              {!isGlobal && <button type="button" className="btn btn-accent" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setKeys([...keys, ''])}><Plus size={14} /> Add Key</button>}
            </div>
            {!isGlobal && keys.map((k, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input value={k} onChange={e => { const nk = [...keys]; nk[i] = e.target.value; setKeys(nk); }} placeholder="_data.aua" required />
                {keys.length > 1 && <button type="button" className="btn" style={{ background: 'var(--danger)' }} onClick={() => setKeys(keys.filter((_, idx) => idx !== i))}><Trash2 size={16} /></button>}
              </div>
            ))}
            {!isGlobal && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Separate Flink state by these fields. No comma separation needed, add keys dynamically.</p>}
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.4rem' }}>Entity Display Name (optional)</label>
              <input value={entityName} onChange={e => setEntityName(e.target.value)} placeholder={isGlobal ? 'e.g. Global' : 'e.g. Reference ID, AUA Code, User ID'} style={{ width: '100%' }} onFocus={() => onFieldFocus?.('entity_name')} />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>Human-readable label for the grouping entity. Shown in analysis dashboards.</p>
            </div>

            {/* Anomaly entity field — only shown when anomaly sinks are enabled */}
            {(anomalySinkEnabled || anomalyStoreSinkEnabled) && (
              <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(244,114,182,0.05)', borderRadius: '6px', border: '1px solid rgba(244,114,182,0.2)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: '#f472b6', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  <input type="checkbox" checked={useAnomalyEntityField} onChange={e => setUseAnomalyEntityField(e.target.checked)} style={{ width: 'auto' }} />
                  Use custom field as anomaly entity value (overrides grouping key for Anomaly Sink + Store)
                </label>
                {useAnomalyEntityField && (
                  <div>
                    <input value={anomalyEntityField} onChange={e => setAnomalyEntityField(e.target.value)} placeholder="e.g. _data.refId" style={{ width: '100%' }} required />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                      Extracted from the event at breach-time. Falls back to grouping key if field is absent.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Windowing */}
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
            <label style={{ color: 'white', display: 'block', marginBottom: '0.5rem' }}>Time Semantics &amp; Windowing</label>
            <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'white' }}>
                <input type="radio" checked={timeType === 'EVENT_TIME'} onChange={() => setTimeType('EVENT_TIME')} onClick={() => onFieldFocus?.('event_time')} style={{ width: 'auto', margin: 0 }} /> Event Time (Recommended)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'white' }}>
                <input type="radio" checked={timeType === 'PROCESSING_TIME'} onChange={() => setTimeType('PROCESSING_TIME')} onClick={() => onFieldFocus?.('processing_time')} style={{ width: 'auto', margin: 0 }} /> Processing Time
              </label>
            </div>
            {timeType === 'EVENT_TIME' && (
              <div style={{ padding: '1rem', border: '1px solid #334155', borderRadius: '4px', marginBottom: '1rem', background: 'rgba(15,23,42,0.4)' }}>
                <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Event Timestamp Source:</label>
                <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input type="radio" checked={eventTimeSource === 'KAFKA_TIMESTAMP'} onChange={() => setEventTimeSource('KAFKA_TIMESTAMP')} onClick={() => onFieldFocus?.('kafka_timestamp')} style={{ width: 'auto', margin: 0 }} /> Kafka Arrival Timestamp
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                    <input type="radio" checked={eventTimeSource === 'CUSTOM'} onChange={() => setEventTimeSource('CUSTOM')} onClick={() => onFieldFocus?.('custom_ts_field')} style={{ width: 'auto', margin: 0 }} /> Custom Payload Field
                  </label>
                </div>
                {eventTimeSource === 'CUSTOM' && (
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <input value={customTsField} onChange={e => setCustomTsField(e.target.value)} placeholder="e.g. _event_timestamp" required style={{ flex: 2, margin: 0 }} />
                    <select value={customTsFormat} onChange={e => setCustomTsFormat(e.target.value)} style={{ flex: 1, margin: 0 }}>
                      <option value="ISO_STRING">ISO 8601 STRING</option>
                      <option value="EPOCH_MILLIS">EPOCH MILLIS</option>
                    </select>
                  </div>
                )}
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.5rem 0 0 0' }}>
                  Note: If a Custom Field is invalid or missing, Flink will fallback to the Kafka Arrival Timestamp.
                </p>
              </div>
            )}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Window Type</label>
                <select value={windowType} onChange={e => setWindowType(e.target.value)} onFocus={() => onFieldFocus?.(windowType === 'SLIDING' ? 'window_type_SLIDING' : 'window_type_TUMBLING')}>
                  <option>SLIDING</option><option>TUMBLING</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Window Size (sec)</label>
                <input type="number" value={windowSize} onChange={e => setWindowSize(Number(e.target.value))} min="0.1" step="0.1" onFocus={() => onFieldFocus?.('window_size')} />
              </div>
              {windowType === 'SLIDING' && (
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Slide Interval (sec)</label>
                  <input type="number" value={windowSlide} onChange={e => setWindowSlide(Number(e.target.value))} min="0.1" step="0.1" onFocus={() => onFieldFocus?.('slide_interval')} />
                </div>
              )}
              <div className="form-group" style={{ flex: 1 }}>
                <label>Allowed Lateness (sec)</label>
                <input type="number" value={lateness} onChange={e => setLateness(Number(e.target.value))} min="0" onFocus={() => onFieldFocus?.('lateness')} />
              </div>
            </div>
            <div style={{ marginTop: '1rem' }} onClick={() => onFieldFocus?.('alignment')}>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>Window Alignment (start of day, 24h format)</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>HH</label>
                  <input type="number" value={alignHour} onChange={e => setAlignHour(Math.min(23, Math.max(0, Number(e.target.value))))} min={0} max={23} />
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem', paddingTop: '1rem' }}>:</span>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>MM</label>
                  <input type="number" value={alignMinute} onChange={e => setAlignMinute(Math.min(59, Math.max(0, Number(e.target.value))))} min={0} max={59} />
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem', paddingTop: '1rem' }}>:</span>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <label style={{ fontSize: '0.75rem' }}>SS</label>
                  <input type="number" value={alignSecond} onChange={e => setAlignSecond(Math.min(59, Math.max(0, Number(e.target.value))))} min={0} max={59} />
                </div>
              </div>
            </div>
          </div>

          {/* Filters (Tree-based) */}
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }} onClick={() => onFieldFocus?.('filters')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <label style={{ color: 'white' }}>Optional Data Filters</label>
            </div>
            {filterTree.conditions && filterTree.conditions.length === 0 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>No filters applied. Use the tree builder below to add filter conditions.</p>
            )}
            <VisualFilterBuilder filterTree={filterTree} setFilterTree={setFilterTree} />
          </div>

          {/* Aggregations */}
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }} onClick={() => onFieldFocus?.('aggregations')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <label style={{ color: 'white' }}>Aggregations (Max 3)</label>
              {aggregations.length < 3 && (
                <button type="button" className="btn btn-accent" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }} onClick={() => setAggregations([...aggregations, { alias: '', field: '', function: 'COUNT', cardinality_hint: 'LOW' }])}><Plus size={14} /> Add Aggregation</button>
              )}
            </div>
            {aggregations.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input value={a.alias} onChange={e => { const na = [...aggregations]; na[i].alias = e.target.value; setAggregations(na); }} placeholder="Alias (e.g. distinct_users)" required />
                <input value={a.field} onChange={e => { const na = [...aggregations]; na[i].field = e.target.value; setAggregations(na); }} placeholder="Field (e.g. _data.uid)" required />
                <select value={a.function} onChange={e => { const na = [...aggregations]; na[i].function = e.target.value; if (e.target.value === 'COUNT_DISTINCT') na[i].cardinality_hint = 'HIGH'; setAggregations(na); }}>
                  <option>COUNT</option><option>COUNT_DISTINCT</option><option>SUM</option><option>AVG</option><option>MIN</option><option>MAX</option>
                </select>
                {a.function === 'COUNT_DISTINCT' && (
                  <select value={a.cardinality_hint} onChange={e => { const na = [...aggregations]; na[i].cardinality_hint = e.target.value; setAggregations(na); }} onFocus={() => onFieldFocus?.('count_distinct_' + a.cardinality_hint)} style={{ width: '160px' }}>
                    <option value="LOW">LOW Cardinality</option>
                    <option value="HIGH">HIGH Cardinality</option>
                  </select>
                )}
                {aggregations.length > 1 && <button type="button" className="btn" style={{ background: 'var(--danger)' }} onClick={() => setAggregations(aggregations.filter((_, idx) => idx !== i))}><Trash2 size={16} /></button>}
              </div>
            ))}
          </div>

          {/* Having Thresholds */}
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }} onClick={() => onFieldFocus?.('having_thresholds')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
              <label style={{ color: 'white', margin: 0 }}>Visual Alert Threshold Logic</label>
            </div>
            <VisualThresholdBuilder expression={jexlExpression} setExpression={setJexlExpression} aggregations={aggregations} />
          </div>

          <button
            type="submit"
            className="btn btn-accent"
            style={{ width: '100%', justifyContent: 'center', fontSize: '1.1rem', padding: '0.75rem', opacity: atLeastOneSink ? 1 : 0.5 }}
          >
            <Save size={20} /> Build &amp; Save Rule Draft
          </button>
        </form>
      </div>
    </div>
  );
}
