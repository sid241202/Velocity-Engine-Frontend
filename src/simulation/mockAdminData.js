/**
 * mockAdminData.js — SIMULATION MODE for the Admin Panel.
 *
 * This branch (admin-panel-simulation) exists purely to be clicked through
 * and judged before any real backend work happens — see
 * uid-dp-velocity-engine-control-plane-backend's /admin/* routes, which
 * don't exist yet. Nothing here talks to a network; all data lives in
 * sessionStorage so edits survive a page reload (needed because switching
 * "viewing as" persona reloads the page) but reset on a fresh tab.
 *
 * To disable simulation mode and go back to hitting the real backend,
 * change SIMULATION_MODE to false (or delete this file and the branches
 * that import it in RBACContext.jsx / ProtectedRoute.jsx / adminApi.js).
 * This branch is never meant to be merged into release — see
 * src/simulation/README equivalent note in the PR description instead.
 */
export const SIMULATION_MODE = true;

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: [
    'rules:create', 'rules:read', 'rules:update', 'rules:delete', 'rules:publish',
    'live_analysis:read', 'aggregated_analysis:read', 'historical_analysis:read',
    'historical_analysis:execute', 'iam:manage',
  ],
  RULE_MANAGER: [
    'rules:create', 'rules:read', 'rules:update', 'rules:delete', 'rules:publish',
    'live_analysis:read', 'aggregated_analysis:read', 'historical_analysis:read',
    'historical_analysis:execute',
  ],
  RULE_EDITOR: ['rules:create', 'rules:read', 'rules:update', 'live_analysis:read', 'aggregated_analysis:read', 'historical_analysis:read'],
  READ_ONLY_ANALYST: ['rules:read', 'live_analysis:read', 'aggregated_analysis:read', 'historical_analysis:read'],
};

const ROLE_DESCRIPTIONS = {
  SUPER_ADMIN: 'Full system access, including user and role administration.',
  RULE_MANAGER: 'Full rule lifecycle (create/edit/publish/delete) and full analysis read access.',
  RULE_EDITOR: 'Can draft and edit rules but cannot publish or delete them.',
  READ_ONLY_ANALYST: 'Read-only access to all analysis views; no rule mutation rights.',
};

const DEFAULT_STATE = {
  teams: [
    { id: 1, name: 'MISC', description: 'Default team for users not yet assigned to a specific team.', is_default: true },
    { id: 2, name: 'Team Alpha', description: 'Velocity rules for UPI-linked auth flows.', is_default: false },
    { id: 3, name: 'Team Bravo', description: 'Velocity rules for biometric auth flows.', is_default: false },
  ],
  users: [
    { id: 1, display_name: 'Super Admin', email: 'super.admin@uidai.gov.in', role: 'SUPER_ADMIN', team_id: null, status: 'ACTIVE' },
    { id: 2, display_name: 'Lead Alpha', email: 'lead.alpha@uidai.gov.in', role: 'RULE_MANAGER', team_id: 2, status: 'ACTIVE' },
    { id: 3, display_name: 'Priya Sharma', email: 'priya.sharma@uidai.gov.in', role: 'RULE_EDITOR', team_id: 2, status: 'ACTIVE' },
    { id: 4, display_name: 'Arjun Mehta', email: 'arjun.mehta@uidai.gov.in', role: 'READ_ONLY_ANALYST', team_id: 3, status: 'ACTIVE' },
    { id: 5, display_name: 'Member Beta', email: 'member.beta@uidai.gov.in', role: 'READ_ONLY_ANALYST', team_id: 3, status: 'ACTIVE' },
    { id: 6, display_name: 'New Hire', email: 'new.hire@uidai.gov.in', role: 'READ_ONLY_ANALYST', team_id: 1, status: 'ACTIVE' },
    { id: 7, display_name: 'Old Contractor', email: 'old.contractor@uidai.gov.in', role: 'READ_ONLY_ANALYST', team_id: 1, status: 'DISABLED' },
    { id: 8, display_name: 'Lead Bravo', email: 'lead.bravo@uidai.gov.in', role: 'RULE_EDITOR', team_id: 3, status: 'ACTIVE' },
  ],
  teamLeads: [{ team_id: 2, user_id: 2 }, { team_id: 3, user_id: 8 }],
  auditLog: [
    { id: 1, actor_user_id: 1, action: 'team.create', target_type: 'team', target_id: '2', metadata: { name: 'Team Alpha' }, created_at: '2026-09-01T04:30:00Z' },
    { id: 2, actor_user_id: 1, action: 'team.create', target_type: 'team', target_id: '3', metadata: { name: 'Team Bravo' }, created_at: '2026-09-01T04:31:00Z' },
    { id: 3, actor_user_id: 1, action: 'team.lead_grant', target_type: 'user', target_id: '2', metadata: { team: 'Team Alpha' }, created_at: '2026-09-01T04:35:00Z' },
    { id: 4, actor_user_id: 1, action: 'team.lead_grant', target_type: 'user', target_id: '8', metadata: { team: 'Team Bravo' }, created_at: '2026-09-01T04:36:00Z' },
    { id: 5, actor_user_id: null, action: 'user.jit_provision', target_type: 'user', target_id: '6', metadata: { subject: 'wso2|new.hire' }, created_at: '2026-09-06T09:12:00Z' },
  ],
  nextTeamId: 4,
  nextAuditId: 6,
};

export const PERSONAS = [
  { key: 'super_admin', userId: 1, label: 'Super Admin — Super Admin' },
  { key: 'lead_alpha', userId: 2, label: 'Lead Alpha — Team Alpha lead, also Rule Manager' },
  { key: 'lead_bravo', userId: 8, label: 'Lead Bravo — Team Bravo lead, Rule Editor' },
  { key: 'member_beta', userId: 5, label: 'Member Beta — Read-Only Analyst, no admin access' },
];

const STATE_KEY = 'sim_admin_data_v1';
const PERSONA_KEY = 'sim_persona_v1';

function loadState() {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to defaults
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

let state = loadState();

function saveState() {
  sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
}

export function getCurrentPersonaKey() {
  const stored = sessionStorage.getItem(PERSONA_KEY);
  return PERSONAS.some((p) => p.key === stored) ? stored : 'super_admin';
}

export function setCurrentPersonaKey(key) {
  sessionStorage.setItem(PERSONA_KEY, key);
}

export function resetSimulation() {
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(PERSONA_KEY);
  state = loadState();
}

function currentActor() {
  const persona = PERSONAS.find((p) => p.key === getCurrentPersonaKey()) || PERSONAS[0];
  return state.users.find((u) => u.id === persona.userId);
}

function actorScope(actor) {
  const isSuperAdmin = actor.role === 'SUPER_ADMIN';
  const ledTeamIds = state.teamLeads.filter((tl) => tl.user_id === actor.id).map((tl) => tl.team_id);
  const miscId = state.teams.find((t) => t.is_default).id;
  return { isSuperAdmin, ledTeamIds, miscId, scopedTeamIds: isSuperAdmin ? state.teams.map((t) => t.id) : [...ledTeamIds, miscId] };
}

function audit(actorUserId, action, targetType, targetId, metadata) {
  state.auditLog.unshift({ id: state.nextAuditId++, actor_user_id: actorUserId, action, target_type: targetType, target_id: String(targetId), metadata: metadata || null, created_at: new Date().toISOString() });
}

// Every function below returns a resolved Promise so adminApi.js's
// simulation branch has the exact same async shape as the real fetch-based
// implementation it stands in for.

export async function getMe() {
  const actor = currentActor();
  const led = state.teamLeads.filter((tl) => tl.user_id === actor.id).map((tl) => tl.team_id);
  return { user_id: actor.id, roles: [actor.role], permissions: ROLE_PERMISSIONS[actor.role], led_team_ids: led };
}

export async function listUsers() {
  return state.users;
}

export async function listTeams() {
  return state.teams.map((t) => ({ ...t, lead_user_ids: state.teamLeads.filter((tl) => tl.team_id === t.id).map((tl) => tl.user_id) }));
}

export async function listRoles() {
  return Object.keys(ROLE_PERMISSIONS).map((name) => ({ name, description: ROLE_DESCRIPTIONS[name], permissions: ROLE_PERMISSIONS[name] }));
}

export async function listAuditLog() {
  return state.auditLog;
}

export async function updateUser(userId, patch) {
  const actor = currentActor();
  const scope = actorScope(actor);
  const target = state.users.find((u) => u.id === userId);
  if (!target) throw new Error('user not found');
  if (!scope.isSuperAdmin && scope.ledTeamIds.length === 0) throw new Error('no admin access');
  if (target.id === actor.id) throw new Error("you can't edit your own account here");

  const activeSuperAdmins = state.users.filter((u) => u.role === 'SUPER_ADMIN' && u.status === 'ACTIVE');
  const isLastActiveSuperAdmin = target.role === 'SUPER_ADMIN' && target.status === 'ACTIVE' && activeSuperAdmins.length <= 1;
  if (isLastActiveSuperAdmin && (patch.role !== 'SUPER_ADMIN' || patch.status !== 'ACTIVE')) {
    throw new Error('cannot demote or disable the last active super admin');
  }

  if (!scope.isSuperAdmin) {
    if (!scope.scopedTeamIds.includes(target.team_id)) throw new Error("target is outside your team's scope");
    if (patch.role === 'SUPER_ADMIN') throw new Error('only a super admin can grant SUPER_ADMIN');
    if (patch.team_id !== null && !scope.scopedTeamIds.includes(patch.team_id)) throw new Error('you can only move users between your team and the unassigned pool');
  }

  if (patch.role && patch.role !== target.role) audit(actor.id, 'role.assign', 'user', target.id, { from: target.role, to: patch.role });
  if (patch.team_id !== undefined && patch.team_id !== target.team_id) audit(actor.id, 'team.assign', 'user', target.id, { from: target.team_id, to: patch.team_id });
  if (patch.status && patch.status !== target.status) audit(actor.id, 'user.status_change', 'user', target.id, { from: target.status, to: patch.status });

  Object.assign(target, {
    role: patch.role ?? target.role,
    team_id: patch.team_id === undefined ? target.team_id : patch.team_id,
    status: patch.status ?? target.status,
  });
  saveState();
  return target;
}

export async function createTeam(payload) {
  const actor = currentActor();
  const scope = actorScope(actor);
  if (!scope.isSuperAdmin) throw new Error('Only a super admin can create teams');
  if (!payload.name) throw new Error('name is required');
  const team = { id: state.nextTeamId++, name: payload.name, description: payload.description || '', is_default: false };
  state.teams.push(team);
  audit(actor.id, 'team.create', 'team', team.id, { name: team.name });
  saveState();
  return team;
}

export async function grantTeamLead(teamId, userId) {
  const actor = currentActor();
  const scope = actorScope(actor);
  if (!scope.isSuperAdmin) throw new Error('Only a super admin can grant team leadership');
  const target = state.users.find((u) => u.id === userId);
  if (!target) throw new Error('user not found');
  if (target.team_id !== teamId) throw new Error('user must belong to the team before being made its lead');
  if (!state.teamLeads.some((tl) => tl.team_id === teamId && tl.user_id === target.id)) {
    state.teamLeads.push({ team_id: teamId, user_id: target.id });
    audit(actor.id, 'team.lead_grant', 'user', target.id, { team: state.teams.find((t) => t.id === teamId).name });
    saveState();
  }
  return { ok: true };
}

export async function revokeTeamLead(teamId, userId) {
  const actor = currentActor();
  const scope = actorScope(actor);
  if (!scope.isSuperAdmin) throw new Error('Only a super admin can revoke team leadership');
  state.teamLeads = state.teamLeads.filter((tl) => !(tl.team_id === teamId && tl.user_id === userId));
  audit(actor.id, 'team.lead_revoke', 'user', userId, { team: state.teams.find((t) => t.id === teamId)?.name });
  saveState();
  return { ok: true };
}
