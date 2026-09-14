/**
 * interceptFetch.js — replaces window.fetch with a router over the
 * simulated data/store modules. Every real component (LiveAnalysis,
 * AggregatedAnalysis, HistoricalAnalysis, RuleBuilder, RuleSummaryPanel,
 * RBACContext, AdminPanel/adminApi.js, AuthService.js) keeps making its
 * normal fetch() calls to /api/... — none of them know this exists.
 */
import { generateWindows, generateAnomalies, generateHistoricalRows, generateHistoricalBreakdown } from './dataGenerators';
import { parseBackendOrIsoToEpochMs } from './istTime';
import * as ruleStore from './ruleStore';
import * as admin from './adminData';
import { VIEWER_USER_ID } from './adminData';

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
      user_id: VIEWER_USER_ID,
      roles: ['SUPER_ADMIN'],
      permissions: admin.roles.find(r => r.name === 'SUPER_ADMIN').permissions,
      led_team_ids: [],
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
    for (const ruleId of ruleIds) results[ruleId] = generateWindows(ruleId, now - hours * 3600 * 1000, now, { stepMs: 5000 });
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

  // ── Admin Panel ────────────────────────────────────────────────────────
  if (path === '/api/admin/users' && method === 'GET') return jsonResponse(admin.users);
  if (path === '/api/admin/teams' && method === 'GET') return jsonResponse(admin.teams);
  if (path === '/api/admin/roles' && method === 'GET') return jsonResponse(admin.roles);
  if (path === '/api/admin/audit-log' && method === 'GET') return jsonResponse(admin.auditLog);
  if (path === '/api/admin/teams' && method === 'POST') {
    const body = await readJsonBody(init);
    return jsonResponse(admin.createTeam(body));
  }
  if ((m = path.match(/^\/api\/admin\/users\/([^/]+)$/)) && method === 'PATCH') {
    const body = await readJsonBody(init);
    return jsonResponse(admin.updateUser(m[1], body));
  }
  if ((m = path.match(/^\/api\/admin\/teams\/([^/]+)\/leads$/)) && method === 'POST') {
    const body = await readJsonBody(init);
    return jsonResponse(admin.grantTeamLead(m[1], body?.user_id));
  }
  if ((m = path.match(/^\/api\/admin\/teams\/([^/]+)\/leads\/([^/]+)$/)) && method === 'DELETE') {
    return jsonResponse(admin.revokeTeamLead(m[1], m[2]));
  }

  console.warn('[simulation] unhandled request', method, path);
  return jsonResponse({ detail: 'Not found (simulation)' }, 404);
}

export function installFetchInterceptor() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input.url;
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
