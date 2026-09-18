/**
 * adminData.js — fabricated Admin Panel state (users/roles/audit log) plus
 * the mutation helpers UserEditModal calls through adminApi.js. No teams —
 * release removed multi-team RBAC scoping entirely (the app now serves only
 * the Auth team); Admin Panel access and every action inside it gate on
 * plain PERMISSIONS.IAM_MANAGE, same as the real backend/frontend. Mutable
 * module-level state — this is a simulation, not a real store, so no
 * persistence is needed beyond the page's lifetime.
 */
import { PERMISSIONS } from '../permissions';

export const VIEWER_USER_ID = 1;

const ALL_PERMS = Object.values(PERMISSIONS);
const NO_IAM = ALL_PERMS.filter(p => p !== PERMISSIONS.IAM_MANAGE);

export const roles = [
  { name: 'SUPER_ADMIN', description: 'Full system access — manage rules, view every analysis panel, and administer users and roles.', permissions: ALL_PERMS },
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

export const users = [
  { id: 1, display_name: 'Simulation Admin', email: 'admin@uidai.net.in', role: 'SUPER_ADMIN', status: 'ACTIVE' },
  { id: 2, display_name: 'Priya Sharma', email: 'priya.sharma@uidai.net.in', role: 'RULE_MANAGER', status: 'ACTIVE' },
  { id: 3, display_name: 'Arjun Mehta', email: 'arjun.mehta@uidai.net.in', role: 'RULE_EDITOR', status: 'ACTIVE' },
  { id: 4, display_name: 'Neha Verma', email: 'neha.verma@uidai.net.in', role: 'READ_ONLY_ANALYST', status: 'ACTIVE' },
  { id: 5, display_name: 'Rohit Kulkarni', email: 'rohit.kulkarni@uidai.net.in', role: 'RULE_EDITOR', status: 'ACTIVE' },
  { id: 6, display_name: 'Sana Iqbal', email: 'sana.iqbal@uidai.net.in', role: 'READ_ONLY_ANALYST', status: 'DISABLED' },
];

const now = Date.now();
const hoursAgo = (h) => new Date(now - h * 3600 * 1000).toISOString();

export const auditLog = [
  { id: 1, actor_user_id: 1, action: 'user.jit_provision', target_type: 'user', target_id: 5, metadata: { email: 'rohit.kulkarni@uidai.net.in' }, created_at: hoursAgo(96) },
  { id: 2, actor_user_id: 1, action: 'role.assign', target_type: 'user', target_id: 2, metadata: { role: 'RULE_MANAGER' }, created_at: hoursAgo(48) },
  { id: 3, actor_user_id: 1, action: 'role.assign', target_type: 'user', target_id: 3, metadata: { role: 'RULE_EDITOR' }, created_at: hoursAgo(40) },
  { id: 4, actor_user_id: 1, action: 'role.assign', target_type: 'user', target_id: 4, metadata: { role: 'READ_ONLY_ANALYST' }, created_at: hoursAgo(24) },
  { id: 5, actor_user_id: 1, action: 'user.status_change', target_type: 'user', target_id: 6, metadata: { status: 'DISABLED' }, created_at: hoursAgo(6) },
];

let nextAuditId = 6;

function logAudit(action, target_type, target_id, metadata) {
  auditLog.unshift({ id: nextAuditId++, actor_user_id: VIEWER_USER_ID, action, target_type, target_id, metadata, created_at: new Date().toISOString() });
}

export function updateUser(userId, patch) {
  const u = users.find(x => x.id === Number(userId));
  if (!u) throw new Error('User not found');
  if (patch.role !== undefined && patch.role !== u.role) { u.role = patch.role; logAudit('role.assign', 'user', u.id, { role: patch.role }); }
  if (patch.status !== undefined && patch.status !== u.status) { u.status = patch.status; logAudit('user.status_change', 'user', u.id, { status: patch.status }); }
  return u;
}
