import React from 'react';
import { ShieldCheck } from 'lucide-react';

const ROLE_COLOR = {
  SUPER_ADMIN: 'badge-violet',
  RULE_MANAGER: 'badge-teal',
  RULE_EDITOR: 'badge-amber',
  READ_ONLY_ANALYST: 'badge-muted',
};

/** Plain-language permission labels — same key format as backend permissions,
 * described in a way that doesn't require reading the resource:action table. */
const PERMISSION_LABELS = {
  'rules:create': 'Create draft rules',
  'rules:read': 'View rule definitions',
  'rules:update': 'Edit existing rules',
  'rules:delete': 'Delete rules',
  'rules:publish': 'Publish rules / change their status',
  'live_analysis:read': 'View Live Stream',
  'aggregated_analysis:read': 'View Analytics',
  'historical_analysis:read': 'View Historical Replay',
  'historical_analysis:execute': 'Run historical replay queries',
  'iam:manage': 'Manage users, roles, and teams (Admin Panel)',
};

/**
 * RoleReference — plain-language "what does each role actually mean" view,
 * so a new lead or admin doesn't have to reverse-engineer it from the raw
 * permission table. Descriptions come straight from the roles table
 * (roles.description) rather than being re-written here, so it can't drift.
 */
export default function RoleReference({ roles }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.8rem' }}>
      {roles.map((role) => (
        <div key={role.name} className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <ShieldCheck size={15} color="var(--violet-light)" />
            <span className={`badge ${ROLE_COLOR[role.name] || 'badge-muted'}`} style={{ fontSize: '0.72rem' }}>
              {role.name.replaceAll('_', ' ')}
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: '0 0 0.7rem', lineHeight: 1.5 }}>
            {role.description}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {role.permissions.map((p) => (
              <div key={p} style={{ fontSize: '0.75rem', color: 'var(--text-3)', display: 'flex', gap: '0.4rem' }}>
                <span style={{ color: 'var(--success)' }}>✓</span> {PERMISSION_LABELS[p] || p}
              </div>
            ))}
            {role.permissions.length === 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontStyle: 'italic' }}>No permissions.</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
