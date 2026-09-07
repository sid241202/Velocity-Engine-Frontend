/**
 * adminApi.js — Admin Panel data access. Same conventions as the rest of the
 * app: native fetch, getAuthHeaders() attaches identity, backend independently
 * re-verifies every action (RequirePermission / the team-scope check on the
 * Go side) regardless of what the UI allows — this layer is a thin transport,
 * not a trust boundary.
 */
import {
  ADMIN_USERS_ENDPOINT,
  ADMIN_TEAMS_ENDPOINT,
  ADMIN_ROLES_ENDPOINT,
  ADMIN_AUDIT_LOG_ENDPOINT,
} from '../config/appConfig';
import { getAuthHeaders } from './apiClient';

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(await getAuthHeaders()), ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || `Request failed (HTTP ${res.status})`);
  }
  return body;
}

export const listUsers = () => request(ADMIN_USERS_ENDPOINT);

export const listTeams = () => request(ADMIN_TEAMS_ENDPOINT);

export const listRoles = () => request(ADMIN_ROLES_ENDPOINT);

export const listAuditLog = () => request(ADMIN_AUDIT_LOG_ENDPOINT);

export const updateUser = (userId, patch) =>
  request(`${ADMIN_USERS_ENDPOINT}/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });

export const createTeam = (payload) =>
  request(ADMIN_TEAMS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const grantTeamLead = (teamId, userId) =>
  request(`${ADMIN_TEAMS_ENDPOINT}/${teamId}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId }),
  });

export const revokeTeamLead = (teamId, userId) =>
  request(`${ADMIN_TEAMS_ENDPOINT}/${teamId}/leads/${userId}`, { method: 'DELETE' });
