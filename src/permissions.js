/**
 * permissions.js — RBAC permission and role constants.
 *
 * Mirrors internal/migrations/mysql/0001_init_rbac.sql on the backend
 * (uid-dp-velocity-engine-control-plane-backend) exactly — the ten seeded
 * "resource:action" permission keys and four seeded role names. Keep these
 * two files in sync if the backend's RBAC schema/seed data changes.
 */

export const PERMISSIONS = {
  RULES_CREATE: 'rules:create',
  RULES_READ: 'rules:read',
  RULES_UPDATE: 'rules:update',
  RULES_DELETE: 'rules:delete',
  RULES_PUBLISH: 'rules:publish',
  LIVE_ANALYSIS_READ: 'live_analysis:read',
  AGGREGATED_ANALYSIS_READ: 'aggregated_analysis:read',
  HISTORICAL_ANALYSIS_READ: 'historical_analysis:read',
  HISTORICAL_ANALYSIS_EXECUTE: 'historical_analysis:execute',
  IAM_MANAGE: 'iam:manage',
};

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  RULE_MANAGER: 'RULE_MANAGER',
  RULE_EDITOR: 'RULE_EDITOR',
  READ_ONLY_ANALYST: 'READ_ONLY_ANALYST',
};
