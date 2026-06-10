import React from 'react';
import { BookOpen, Lightbulb, Zap } from 'lucide-react';

const HELP_CONTENT = {
  rule_name: {
    title: 'Rule Name',
    description: 'Give your rule a descriptive, human-readable name. This name appears in ClickHouse results, alert notifications, and the sidebar.',
    tip: 'Use a naming convention like: "[Severity] [What it detects] [Entity]" — e.g., "HIGH Velocity OTP Ring SA"'
  },
  severity: {
    title: 'Severity Level',
    description: 'Classifies the urgency of alerts triggered by this rule. Stored with every breach event in ClickHouse.',
    tip: 'Use CRITICAL for fraud patterns, HIGH for anomalies, MEDIUM for rate monitoring, LOW for informational.'
  },
  penalty_ttl: {
    title: 'Penalty TTL (seconds)',
    description: 'After a threshold breach, suppress duplicate alerts for this many seconds. Prevents alert storms during sustained anomalies.',
    tip: 'Set to 3600 (1 hour) for most rules. Use shorter TTLs (300s) for rapidly changing patterns.'
  },
  grouping_keys: {
    title: 'Grouping Keys',
    description: 'Flink maintains INDEPENDENT state for each unique combination of these fields. Every distinct value gets its own counters, windows, and thresholds.',
    tip: 'Group by _data.aua to monitor each Authentication User Agency independently. Add multiple keys like _data.aua + _data.sa for finer granularity.'
  },
  global_key: {
    title: 'Global Aggregation',
    description: 'No grouping — a single counter aggregates ALL events regardless of field values. Useful for system-wide rate monitoring.',
    tip: 'Use this to monitor total authentication throughput across the entire system.'
  },
  continuous: {
    title: 'Continuous Counting',
    description: 'Disables window resets — counters grow indefinitely from Flink startup. Internally uses a 10-year window with 1-minute output intervals.',
    tip: 'Use for cumulative monitoring like "total auths since deployment" or detecting ever-growing distinct entity counts.'
  },
  event_time: {
    title: 'Event Time',
    description: 'Uses the timestamp from inside the event payload for windowing. Correctly handles out-of-order and late-arriving events.',
    tip: 'Recommended for production. Ensures accurate window boundaries even when Kafka consumers lag.'
  },
  processing_time: {
    title: 'Processing Time',
    description: 'Uses the wall-clock time when Flink processes the event. Simpler but cannot handle out-of-order data.',
    tip: 'Use only when payload timestamps are unreliable or when you want purely real-time (wall-clock) windowing.'
  },
  kafka_timestamp: {
    title: 'Kafka Arrival Timestamp',
    description: 'Uses the timestamp set by the Kafka broker when the message arrived. A reliable default for event-time semantics.',
    tip: 'Good default choice. The Kafka timestamp is always present and monotonically increasing per partition.'
  },
  custom_ts_field: {
    title: 'Custom Timestamp Field',
    description: 'Point to a specific field in your JSON payload (e.g., _event_timestamp). Choose ISO_STRING for dates like "2026-06-04T12:00:00" or EPOCH_MILLIS for numeric timestamps.',
    tip: 'If the custom field is missing or unparseable at runtime, Flink falls back to the Kafka timestamp automatically.'
  },
  window_type_SLIDING: {
    title: 'Sliding Window',
    description: 'Windows overlap — each event is counted in multiple windows. A 10-min window sliding every 2 min means each event participates in 5 windows.',
    tip: 'Better for catching short bursts. More computationally expensive but provides smoother detection.'
  },
  window_type_TUMBLING: {
    title: 'Tumbling Window',
    description: 'Windows are non-overlapping — each event appears in exactly one window. Simpler and more resource-efficient.',
    tip: 'Use for periodic batch-style analysis where you want clean, non-overlapping time buckets.'
  },
  window_size: {
    title: 'Window Size (minutes)',
    description: 'The total time span of each window. Events within this duration are aggregated together.',
    tip: 'Smaller windows (1-5 min) catch rapid anomalies. Larger windows (15-60 min) detect sustained patterns.'
  },
  slide_interval: {
    title: 'Slide Output Interval (minutes)',
    description: 'How often Flink emits a result. Must be ≤ window size. Smaller slide = more frequent outputs = finer granularity.',
    tip: 'A 10-min window with 1-min slide produces a result every minute, each covering the last 10 minutes.'
  },
  lateness: {
    title: 'Allowed Lateness (seconds)',
    description: 'How long after a window closes Flink still accepts late events. Late events update the window result retroactively.',
    tip: 'Set to 0 for processing-time rules. For event-time, 30-60 seconds handles typical Kafka partition skew.'
  },
  alignment: {
    title: 'Window Alignment (IST)',
    description: 'Aligns window boundaries to a specific time-of-day in IST. E.g., 00:00:00 means windows start exactly at midnight, 1am, 2am, etc.',
    tip: 'Useful when you want daily windows to align with business hours (e.g., 09:30:00 for market open).'
  },
  filters: {
    title: 'Data Filters',
    description: 'Pre-filter events BEFORE aggregation. Only events matching the filter tree enter the window. Supports AND/OR nesting, EQUALS, IN, REGEX, and comparison operators.',
    tip: 'Use filters to focus on specific scenarios — e.g., only OTP auths (_data.otpUsesFlag EQUALS 1.0) or only failed auths (_data.authResult EQUALS n).'
  },
  aggregations: {
    title: 'Aggregations (max 3)',
    description: 'Define what to compute inside each window. Each aggregation has an alias (used in thresholds), a target field, and a function (COUNT, SUM, AVG, MIN, MAX, COUNT_DISTINCT).',
    tip: 'The alias becomes a column in ClickHouse and a variable name in your threshold expression. Choose meaningful names like "total_otp" or "unique_auas".'
  },
  count_distinct_LOW: {
    title: 'COUNT_DISTINCT — Low Cardinality',
    description: 'Exact distinct count using a HashSet. Precise but uses memory proportional to the number of unique values per window.',
    tip: 'Safe for fields with < ~10,000 unique values per window (e.g., AUA codes, state codes). Risk of OOM with high-cardinality fields.'
  },
  count_distinct_HIGH: {
    title: 'COUNT_DISTINCT — High Cardinality (HyperLogLog)',
    description: 'Approximate distinct count using HyperLogLog. ~2% error margin but constant memory regardless of cardinality.',
    tip: 'Use for UIDs, transaction IDs, or enrollment reference IDs — any field with potentially millions of unique values.'
  },
  having_thresholds: {
    title: 'Alert Threshold Logic',
    description: 'A JEXL expression evaluated against your aggregation aliases. When the expression evaluates to TRUE, Flink marks the result as a breach and emits an alert.',
    tip: 'Reference aggregation aliases by name. Combine with && (AND) and || (OR). Example: (total_otp > 15) && (unique_auas >= 3)'
  }
};

export default function RuleBuilderHelper({ focusedField }) {
  const help = focusedField ? HELP_CONTENT[focusedField] : null;

  return (
    <div className="glass-panel" style={{ height: 'calc(100vh - 180px)', overflowY: 'auto', padding: '1.25rem' }}>
      {help && (
        <div className="animate-fade-in" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Lightbulb size={18} color="#60a5fa" />
            <h4 style={{ color: '#93c5fd', margin: 0, fontSize: '1rem' }}>{help.title}</h4>
          </div>
          <p style={{ color: 'var(--text-main)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '0.75rem' }}>{help.description}</p>
          <div style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '6px', padding: '0.75rem', fontSize: '0.82rem', color: '#c4b5fd' }}>
            <strong>💡 Tip:</strong> {help.tip}
          </div>
        </div>
      )}

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <BookOpen size={18} color="var(--accent)" />
          <h3 style={{ color: 'white', margin: 0, fontSize: '1.05rem' }}>Sample Rule Reference</h3>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', fontSize: '0.85rem', lineHeight: 1.7 }}>
          <h4 style={{ color: '#60a5fa', marginBottom: '0.75rem' }}>OTP Bypass Ring Detector</h4>
          <div style={{ color: 'var(--text-main)' }}>
            <p style={{ marginBottom: '0.5rem' }}><strong style={{ color: 'var(--text-muted)' }}>Grouping:</strong> <code style={{ color: '#93c5fd' }}>_data.sa</code> (Sub-AUA)</p>
            <p style={{ marginBottom: '0.5rem' }}><strong style={{ color: 'var(--text-muted)' }}>Filter:</strong> <code style={{ color: '#93c5fd' }}>_data.otpUsesFlag</code> EQUALS <code style={{ color: '#fcd34d' }}>1.0</code></p>
            <p style={{ marginBottom: '0.5rem' }}><strong style={{ color: 'var(--text-muted)' }}>Window:</strong> SLIDING, 10 min size, 2 min slide, Event Time</p>
            <p style={{ marginBottom: '0.5rem' }}><strong style={{ color: 'var(--text-muted)' }}>Aggregations:</strong></p>
            <ul style={{ paddingLeft: '1.25rem', marginBottom: '0.5rem' }}>
              <li><code style={{ color: '#93c5fd' }}>total_otp</code> = COUNT(<code>_data.authCode</code>)</li>
              <li><code style={{ color: '#93c5fd' }}>unique_auas</code> = COUNT_DISTINCT(<code>_data.aua</code>, LOW)</li>
            </ul>
            <p style={{ marginBottom: '0.5rem' }}><strong style={{ color: 'var(--text-muted)' }}>Threshold:</strong> <code style={{ color: '#a78bfa' }}>(total_otp &gt; 15) &amp;&amp; (unique_auas &gt;= 3)</code></p>
            <p><strong style={{ color: 'var(--text-muted)' }}>Severity:</strong> <span style={{ color: '#fca5a5' }}>CRITICAL</span></p>
          </div>
        </div>
        <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '1rem', fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
          <Zap size={14} color="var(--success)" style={{ display: 'inline', marginRight: '0.3rem', verticalAlign: 'middle' }} />
          <strong>What this rule does:</strong> Monitors each Sub-AUA (SA) for suspicious OTP authentication patterns. Within every 10-minute sliding window, it counts total OTP attempts and the number of distinct AUAs being targeted. If a single SA has more than 15 OTP attempts AND targets 3+ different AUAs in the same window, an alert fires — indicating a potential OTP bypass ring.
        </div>
      </div>
    </div>
  );
}
