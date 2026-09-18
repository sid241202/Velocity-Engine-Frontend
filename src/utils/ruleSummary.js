/**
 * ruleSummary.js — the plain-language "what this rule does" sentence
 * generator, shared by RuleSummaryPanel (the detail view) and RulesBrowser
 * (the card-list view), so both describe a rule identically.
 */
export function formatMs(ms) {
  if (!ms && ms !== 0) return 'N/A';
  if (ms < 1000) return `${ms} ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return Number.isInteger(totalSeconds) ? `${totalSeconds} seconds` : `${totalSeconds.toFixed(1)} seconds`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  if (minutes < 60) return seconds > 0 ? `${minutes} min ${seconds} sec` : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h ${remainMinutes}m`;
}

export function formatTtl(seconds) {
  if (!seconds) return 'N/A';
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minutes`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h} hour${h > 1 ? 's' : ''}`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.round((seconds % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d} day${d > 1 ? 's' : ''}`;
}

export function generateSummary(rule) {
  const meta = rule.rule_metadata;
  const grouping = rule.grouping || {};
  const windowing = rule.windowing || {};
  const aggs = rule.aggregations || [];
  const having = rule.having_thresholds;
  const filters = rule.filters;

  const keys = grouping.keys || [];
  const isGlobal = keys.length === 1 && keys[0] === '__GLOBAL__';
  const groupDesc = isGlobal ? 'all events globally (no grouping)' : `events grouped by ${keys.map(k => k).join(' + ')}`;

  let windowDesc;
  const isNoWindow = !windowing.type || windowing.type === 'NONE';
  if (isNoWindow) {
    windowDesc = 'real-time stateless event evaluation (no aggregation window)';
  } else if (windowing.size_ms >= 315360000000) {
    windowDesc = 'a continuous (never-resetting) counter';
  } else {
    const slide = windowing.type === 'SLIDING' && windowing.slide_ms
      ? `, sliding by ${formatMs(windowing.slide_ms)}`
      : '';
    windowDesc = `a ${windowing.type === 'SLIDING' ? 'rolling' : 'fixed'} window of ${formatMs(windowing.size_ms)}${slide}`;
  }

  const timeDesc = windowing.time_type === 'EVENT_TIME'
    ? (windowing.use_kafka_timestamp ? 'message arrival timestamps' : `event timestamps from ${windowing.timestamp_field}`)
    : 'system time';

  const aggDescs = aggs.map(a => {
    const funcName = a.function === 'COUNT_DISTINCT' ? `distinct count (${a.cardinality_hint} cardinality)` : a.function.toLowerCase();
    return `${funcName} of ${a.field} as "${a.alias}"`;
  });

  let filterDesc = '';
  if (filters && filters.conditions && filters.conditions.length > 0) {
    filterDesc = ' Only events passing the defined filters are included.';
  }

  const thresholdDesc = having?.expression
    ? `An alert fires when: ${having.expression.replace(/&&/g, 'AND').replace(/\|\|/g, 'OR')}.`
    : 'No alert threshold is defined (data-only rule).';

  const aggPart = aggDescs.length > 0
    ? `, it computes: ${aggDescs.join('; ')}.`
    : '.';

  return `This rule monitors ${groupDesc}. Using ${windowDesc} based on ${timeDesc}${aggPart}${filterDesc} ${thresholdDesc} Severity: ${meta.severity_level}. After a breach, the same entity won't trigger another alert for ${formatTtl(meta.penalty_ttl_seconds)} (its cooldown period).`;
}

/** A shorter, one-line version for card lists — just what the rule
 * watches and what triggers it, without the full paragraph. */
export function generateShortSummary(rule) {
  const grouping = rule.grouping || {};
  const having = rule.having_thresholds || {};
  const keys = grouping.keys || [];
  const isGlobal = keys.length === 1 && keys[0] === '__GLOBAL__';
  const subject = isGlobal ? 'all traffic' : `each ${keys.join(' + ')}`;
  const condition = having.expression
    ? having.expression.replace(/&&/g, 'and').replace(/\|\|/g, 'or').replace(/[()]/g, '')
    : 'no condition set';
  return `Watches ${subject} — alerts when ${condition}.`;
}
