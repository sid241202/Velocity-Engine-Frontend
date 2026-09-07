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
import { SIMULATION_MODE } from '../simulation/mockAdminData';
import * as mockAdmin from '../simulation/mockAdminData';

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

export const listUsers = () => (SIMULATION_MODE ? mockAdmin.listUsers() : request(ADMIN_USERS_ENDPOINT));

export const listTeams = () => (SIMULATION_MODE ? mockAdmin.listTeams() : request(ADMIN_TEAMS_ENDPOINT));

export const listRoles = () => (SIMULATION_MODE ? mockAdmin.listRoles() : request(ADMIN_ROLES_ENDPOINT));

export const listAuditLog = () => (SIMULATION_MODE ? mockAdmin.listAuditLog() : request(ADMIN_AUDIT_LOG_ENDPOINT));

export const updateUser = (userId, patch) =>
  SIMULATION_MODE
    ? mockAdmin.updateUser(userId, patch)
    : request(`${ADMIN_USERS_ENDPOINT}/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });

export const createTeam = (payload) =>
  SIMULATION_MODE
    ? mockAdmin.createTeam(payload)
    : request(ADMIN_TEAMS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

export const grantTeamLead = (teamId, userId) =>
  SIMULATION_MODE
    ? mockAdmin.grantTeamLead(teamId, userId)
    : request(`${ADMIN_TEAMS_ENDPOINT}/${teamId}/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });

export const revokeTeamLead = (teamId, userId) =>
  SIMULATION_MODE
    ? mockAdmin.revokeTeamLead(teamId, userId)
    : request(`${ADMIN_TEAMS_ENDPOINT}/${teamId}/leads/${userId}`, { method: 'DELETE' });
