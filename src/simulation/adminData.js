/**
 * adminData.js — fabricated Admin Panel state (users/teams/roles/audit log)
 * plus the mutation helpers TeamsPanel/UserEditModal call through
 * adminApi.js. Mutable module-level state — this is a simulation, not a
 * real store, so no persistence is needed beyond the page's lifetime.
 */
import { PERMISSIONS } from '../permissions';

export const VIEWER_USER_ID = 1;

const ALL_PERMS = Object.values(PERMISSIONS);
const NO_IAM = ALL_PERMS.filter(p => p !== PERMISSIONS.IAM_MANAGE);

export const roles = [
  { name: 'SUPER_ADMIN', description: 'Full system access — manage rules, view every analysis panel, and administer users, teams, and roles.', permissions: ALL_PERMS },
  {
    name: 'RULE_MANAGER',
    description: 'Owns the full rule lifecycle — create, edit, publish, and delete rules — plus every analysis panel.',
    permissions: NO_IAM,
  },
  {
    name: 'RULE_EDITOR',
    description: 'Builds and edits rules and can view all analysis panels, but cannot publish, delete, or administer users.',
    permissions: [PERMISSIONS.RULES_CREATE, PERMISSIONS.RULES_READ, PERMISSIONS.RULES_UPDATE, PERMISSIONS.LIVE_ANALYSIS_READ, PERMISSIONS.AGGREGATED_ANALYSIS_READ, PERMISSIONS.HISTORICAL_ANALYSIS_READ, PERMISSIONS.HISTORICAL_ANALYSIS_EXECUTE],
  },
  {
    name: 'READ_ONLY_ANALYST',
    description: 'Read-only across every analysis panel — no rule authoring, no historical replay execution, no admin access.',
    permissions: [PERMISSIONS.RULES_READ, PERMISSIONS.LIVE_ANALYSIS_READ, PERMISSIONS.AGGREGATED_ANALYSIS_READ, PERMISSIONS.HISTORICAL_ANALYSIS_READ],
  },
];

export const teams = [
  { id: 1, name: 'MISC', description: 'Default holding pool for not-yet-assigned users.', is_default: true, lead_user_ids: [] },
  { id: 2, name: 'Fraud Operations', description: 'Primary velocity-rule authoring and live monitoring team.', is_default: false, lead_user_ids: [3] },
  { id: 3, name: 'Compliance & Audit', description: 'Read-heavy oversight team for historical replay and audit review.', is_default: false, lead_user_ids: [] },
];

export const users = [
  { id: 1, display_name: 'Simulation Admin', email: 'admin@uidai.net.in', role: 'SUPER_ADMIN', team_id: null, status: 'ACTIVE' },
  { id: 2, display_name: 'Priya Sharma', email: 'priya.sharma@uidai.net.in', role: 'RULE_MANAGER', team_id: 2, status: 'ACTIVE' },
  { id: 3, display_name: 'Arjun Mehta', email: 'arjun.mehta@uidai.net.in', role: 'RULE_EDITOR', team_id: 2, status: 'ACTIVE' },
  { id: 4, display_name: 'Neha Verma', email: 'neha.verma@uidai.net.in', role: 'READ_ONLY_ANALYST', team_id: 3, status: 'ACTIVE' },
  { id: 5, display_name: 'Rohit Kulkarni', email: 'rohit.kulkarni@uidai.net.in', role: 'RULE_EDITOR', team_id: 1, status: 'ACTIVE' },
  { id: 6, display_name: 'Sana Iqbal', email: 'sana.iqbal@uidai.net.in', role: 'READ_ONLY_ANALYST', team_id: 2, status: 'DISABLED' },
];

const now = Date.now();
const hoursAgo = (h) => new Date(now - h * 3600 * 1000).toISOString();

export const auditLog = [
  { id: 1, actor_user_id: 1, action: 'user.jit_provision', target_type: 'user', target_id: 5, metadata: { email: 'rohit.kulkarni@uidai.net.in' }, created_at: hoursAgo(96) },
  { id: 2, actor_user_id: 1, action: 'team.create', target_type: 'team', target_id: 2, metadata: { name: 'Fraud Operations' }, created_at: hoursAgo(90) },
  { id: 3, actor_user_id: 1, action: 'team.create', target_type: 'team', target_id: 3, metadata: { name: 'Compliance & Audit' }, created_at: hoursAgo(90) },
  { id: 4, actor_user_id: 1, action: 'team.lead_grant', target_type: 'team', target_id: 2, metadata: { user: 'Arjun Mehta' }, created_at: hoursAgo(72) },
  { id: 5, actor_user_id: 1, action: 'role.assign', target_type: 'user', target_id: 2, metadata: { role: 'RULE_MANAGER' }, created_at: hoursAgo(48) },
  { id: 6, actor_user_id: 3, action: 'team.assign', target_type: 'user', target_id: 4, metadata: { team: 'Compliance & Audit' }, created_at: hoursAgo(24) },
  { id: 7, actor_user_id: 1, action: 'user.status_change', target_type: 'user', target_id: 6, metadata: { status: 'DISABLED' }, created_at: hoursAgo(6) },
];

let nextTeamId = 4;
let nextAuditId = 8;

function logAudit(action, target_type, target_id, metadata) {
  auditLog.unshift({ id: nextAuditId++, actor_user_id: VIEWER_USER_ID, action, target_type, target_id, metadata, created_at: new Date().toISOString() });
}

export function updateUser(userId, patch) {
  const u = users.find(x => x.id === Number(userId));
  if (!u) throw new Error('User not found');
  if (patch.role !== undefined && patch.role !== u.role) { u.role = patch.role; logAudit('role.assign', 'user', u.id, { role: patch.role }); }
  if (patch.team_id !== undefined && patch.team_id !== u.team_id) { u.team_id = patch.team_id; logAudit('team.assign', 'user', u.id, { team_id: patch.team_id }); }
  if (patch.status !== undefined && patch.status !== u.status) { u.status = patch.status; logAudit('user.status_change', 'user', u.id, { status: patch.status }); }
  return u;
}

export function createTeam(payload) {
  const team = { id: nextTeamId++, name: payload.name, description: payload.description || '', is_default: false, lead_user_ids: [] };
  teams.push(team);
  logAudit('team.create', 'team', team.id, { name: team.name });
  return team;
}

export function grantTeamLead(teamId, userId) {
  const team = teams.find(t => t.id === Number(teamId));
  if (!team) throw new Error('Team not found');
  if (!team.lead_user_ids.includes(Number(userId))) team.lead_user_ids.push(Number(userId));
  const user = users.find(u => u.id === Number(userId));
  logAudit('team.lead_grant', 'team', team.id, { user: user?.display_name || userId });
  return team;
}

export function revokeTeamLead(teamId, userId) {
  const team = teams.find(t => t.id === Number(teamId));
  if (!team) throw new Error('Team not found');
  team.lead_user_ids = team.lead_user_ids.filter(id => id !== Number(userId));
  const user = users.find(u => u.id === Number(userId));
  logAudit('team.lead_revoke', 'team', team.id, { user: user?.display_name || userId });
  return team;
}
