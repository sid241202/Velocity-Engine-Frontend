/**
 * simIdentity.js — single source of truth for which RBAC role this branch's
 * simulation runs as. interceptAuth.js (the fake WSO2 id_token) and
 * interceptFetch.js (the /api/me response) both read SIMULATED_ROLE from
 * here, so a role-specific simulation branch (test-simulation-<role>) is a
 * one-line diff against test-simulation rather than edits scattered across
 * both files.
 *
 * Each profile's id/email/display name matches an existing row in
 * adminData.js's `users` list, so the Admin Panel (when the simulated role
 * can even reach it) shows a self-consistent "you are this user" story.
 * Permissions themselves are never listed here — they're looked up from
 * adminData.js's `roles` list (which mirrors the backend's RBAC seed data
 * exactly) so there is exactly one place permission-to-role mapping lives.
 */
export const SIMULATED_ROLE = 'RULE_MANAGER';

export const SIM_PROFILES = {
  SUPER_ADMIN: { id: 1, sub: 'sim-super-admin', email: 'admin@uidai.net.in', name: 'Simulation Admin' },
  RULE_MANAGER: { id: 2, sub: 'sim-rule-manager', email: 'priya.sharma@uidai.net.in', name: 'Priya Sharma' },
  RULE_EDITOR: { id: 3, sub: 'sim-rule-editor', email: 'arjun.mehta@uidai.net.in', name: 'Arjun Mehta' },
  READ_ONLY_ANALYST: { id: 4, sub: 'sim-read-only-analyst', email: 'neha.verma@uidai.net.in', name: 'Neha Verma' },
};

export const SIM_PROFILE = SIM_PROFILES[SIMULATED_ROLE];
