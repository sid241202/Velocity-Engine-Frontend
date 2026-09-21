/**
 * interceptFetch.js — replaces window.fetch with a router over the
 * simulated data/store modules. Every real component (LiveAnalysis,
 * AggregatedAnalysis, HistoricalAnalysis, RuleBuilder, RuleSummaryPanel,
 * RBACContext, AdminPanel/adminApi.js, AuthService.js) keeps making its
 * normal fetch() calls to /api/... — none of them know this exists. Also
 * catches the one non-/api/ absolute URL this app calls directly: WSO2's
 * token endpoint, hit once by AuthService.handleCallback() during the
 * simulated SSO round-trip (see interceptAuth.js) — never let that request
 * reach the real network, both because there's nothing there to answer it
 * correctly and because it would otherwise be a real request toward a
 * production government SSO host.
 */
import { generateWindows, generateAnomalies, generateTopGroups, generateGroupDetail, generateHistoricalRows, generateHistoricalBreakdown } from './dataGenerators.js';
import { parseBackendOrIsoToEpochMs } from './istTime.js';
import { handleSimulatedTokenExchange, isTokenEndpoint } from './interceptAuth.js';
import * as ruleStore from './ruleStore.js';
import * as admin from './adminData.js';
import { SIMULATED_ROLE, SIM_PROFILE } from './simIdentity.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function parseRange(query, fallbackMs = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  const startTs = query.get('start_ts');
  const endTs = query.get('end_ts');
  const startMs = startTs ? parseBackendOrIsoToEpochMs(startTs) : now - fallbackMs;
  const endMs = endTs ? parseBackendOrIsoToEpochMs(endTs) : now;
  return { startMs: isNaN(startMs) ? now - fallbackMs : startMs, endMs: isNaN(endMs) ? now : endMs };
}

async function readJsonBody(init) {
  if (!init || !init.body) return null;
  try { return JSON.parse(init.body); } catch { return null; }
}

async function route(path, method, query, init) {
  // ── Identity / RBAC ────────────────────────────────────────────────────
  if (path === '/api/me') {
    return jsonResponse({
      user_id: SIM_PROFILE.id,
      roles: [SIMULATED_ROLE],
      permissions: admin.roles.find(r => r.name === SIMULATED_ROLE).permissions,
    });
  }

  // ── Rules CRUD ─────────────────────────────────────────────────────────
  if (path === '/api/rules' && method === 'GET') {
    return jsonResponse(ruleStore.rules);
  }
  if (path === '/api/rules' && method === 'POST') {
    const payload = await readJsonBody(init);
    return jsonResponse(ruleStore.createRule(payload));
  }
  let m;
  if ((m = path.match(/^\/api\/rules\/([^/]+)$/)) && method === 'PUT') {
    const payload = await readJsonBody(init);
    return jsonResponse(ruleStore.updateRule(m[1], payload));
  }
  if ((m = path.match(/^\/api\/rules\/([^/]+)$/)) && method === 'DELETE') {
    ruleStore.deleteRule(m[1]);
    return jsonResponse({ ok: true });
  }
  if ((m = path.match(/^\/api\/rules\/([^/]+)\/prod$/)) && method === 'POST') {
    return jsonResponse(ruleStore.publishRule(m[1]));
  }
  if ((m = path.match(/^\/api\/rules\/([^/]+)\/status$/)) && method === 'POST') {
    const body = await readJsonBody(init);
    return jsonResponse(ruleStore.setRuleStatus(m[1], body?.status || 'PAUSED'));
  }

  // ── Analysis panels ────────────────────────────────────────────────────
  if (path === '/api/rules/live-analysis' && method === 'GET') {
    const ruleIds = (query.get('rule_ids') || '').split(',').filter(Boolean);
    const hours = Number(query.get('hours')) || 24;
    const now = Date.now();
    const results = {};
    for (const ruleId of ruleIds) results[ruleId] = generateWindows(ruleId, now - hours * 3600 * 1000, now, { stepMs: 60000 });
    return jsonResponse({ results });
  }

  if (path === '/api/rules/agg-analysis' && method === 'GET') {
    const ruleIds = (query.get('rule_ids') || '').split(',').filter(Boolean);
    const { startMs, endMs } = parseRange(query);
    const results = {};
    for (const ruleId of ruleIds) results[ruleId] = generateWindows(ruleId, startMs, endMs);
    return jsonResponse({ results });
  }

  if (path === '/api/rules/anomaly-analysis' && method === 'GET') {
    const ruleIds = (query.get('rule_ids') || '').split(',').filter(Boolean);
    const limit = Number(query.get('limit')) || 500;
    const all = ruleIds.flatMap(ruleId => generateAnomalies(ruleId, { limit }));
    all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return jsonResponse({ results: all.slice(0, limit) });
  }

  // ── Scalable entity ranking (high-cardinality rules) ──────────────────
  if ((m = path.match(/^\/api\/rules\/([^/]+)\/top-groups$/)) && method === 'GET') {
    const { startMs, endMs } = parseRange(query);
    const limit = Math.min(200, Math.max(1, Number(query.get('limit')) || 50));
    const offset = Math.max(0, Number(query.get('offset')) || 0);
    const { groups } = generateTopGroups(m[1], startMs, endMs, { limit, offset });
    return jsonResponse({ groups, limit, offset });
  }

  if ((m = path.match(/^\/api\/rules\/([^/]+)\/group-detail$/)) && method === 'GET') {
    const key = query.get('key') || '';
    const { startMs, endMs } = parseRange(query);
    return jsonResponse({ results: generateGroupDetail(m[1], key, startMs, endMs) });
  }

  if (path === '/api/rules/historical-analysis' && method === 'POST') {
    const body = await readJsonBody(init);
    const ruleId = body?.rule_metadata?.rule_id || 'unknown-rule';
    const { startMs, endMs } = parseRange(query, 24 * 60 * 60 * 1000);
    return jsonResponse({ results: generateHistoricalRows(ruleId, startMs, endMs) });
  }

  if (path === '/api/rules/historical-breakdown' && method === 'POST') {
    const body = await readJsonBody(init);
    const ruleId = body?.rule_metadata?.rule_id || 'unknown-rule';
    const { startMs, endMs } = parseRange(query, 24 * 60 * 60 * 1000);
    return jsonResponse({ result: generateHistoricalBreakdown(ruleId, startMs, endMs) });
  }

  // ── Admin Panel (no teams — release removed multi-team RBAC scoping) ──
  if (path === '/api/admin/users' && method === 'GET') return jsonResponse(admin.users);
  if (path === '/api/admin/roles' && method === 'GET') return jsonResponse(admin.roles);
  if (path === '/api/admin/audit-log' && method === 'GET') return jsonResponse(admin.auditLog);
  if ((m = path.match(/^\/api\/admin\/users\/([^/]+)$/)) && method === 'PATCH') {
    const body = await readJsonBody(init);
    return jsonResponse(admin.updateUser(m[1], body));
  }

  console.warn('[simulation] unhandled request', method, path);
  return jsonResponse({ detail: 'Not found (simulation)' }, 404);
}

export function installFetchInterceptor() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input.url;

    if (isTokenEndpoint(rawUrl)) {
      const { status, body } = handleSimulatedTokenExchange(init);
      return jsonResponse(body, status);
    }

    if (!rawUrl.startsWith('/api/')) return realFetch(input, init);

    const url = new URL(rawUrl, window.location.origin);
    const method = (init?.method || 'GET').toUpperCase();
    try {
      return await route(url.pathname, method, url.searchParams, init);
    } catch (e) {
      return jsonResponse({ detail: e.message || 'Simulation error' }, 400);
    }
  };
}
