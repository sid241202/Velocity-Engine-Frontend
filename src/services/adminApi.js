/**
 * adminApi.js — Admin Panel data access. Same conventions as the rest of the
 * app: native fetch, getAuthHeaders() attaches identity, backend independently
 * re-verifies every action (RequirePermission on the Go side) regardless of
 * what the UI allows — this layer is a thin transport, not a trust boundary.
 */
import {
  ADMIN_USERS_ENDPOINT,
  ADMIN_ROLES_ENDPOINT,
  ADMIN_AUDIT_LOG_ENDPOINT,
} from '../config/appConfig';
import { getAuthHeaders } from './apiClient';

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(await getAuthHeaders()), ...(options.headers || {}) },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed (HTTP ${res.status})`);
  }

  try {
    return await res.json();
  } catch {
    // A 2xx response that isn't valid JSON (a truncated body, a proxy/
    // gateway hiccup returning something other than the API response) is
    // just as much a load failure as a non-2xx status — surface it as one
    // instead of silently coercing to {} and letting callers that expect a
    // specific shape (e.g. requestList below) crash downstream.
    throw new Error('Received an invalid response from the server');
  }
}

// requestList additionally guards the contract every Admin Panel list
// endpoint (users/roles/audit-log) makes: a 2xx response is always a JSON
// array. Without this, an unexpected shape (wrong content, a caught-but-
// wrong-shaped success response, a future backend regression) would reach
// UserTable/RoleReference/AuditLogTable's array methods directly and crash
// the whole panel with an uncaught TypeError instead of the friendly
// "Couldn't load Admin Panel" retry state AdminPanel.jsx already has for
// exactly this kind of failure — fail closed, same as everywhere else in
// this app's RBAC/data-loading posture.
async function requestList(url, options = {}) {
  const body = await request(url, options);
  if (!Array.isArray(body)) {
    throw new Error('Received an unexpected response shape from the server');
  }
  return body;
}

export const listUsers = () => requestList(ADMIN_USERS_ENDPOINT);

export const listRoles = () => requestList(ADMIN_ROLES_ENDPOINT);

export const listAuditLog = () => requestList(ADMIN_AUDIT_LOG_ENDPOINT);

export const updateUser = (userId, patch) =>
  request(`${ADMIN_USERS_ENDPOINT}/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
