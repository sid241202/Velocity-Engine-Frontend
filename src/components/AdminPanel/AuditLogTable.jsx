import React from 'react';
import { ScrollText } from 'lucide-react';
import { formatISTDateTime } from '../../utils/istUtils';

const ACTION_LABELS = {
  'role.assign': 'Role changed',
  'team.assign': 'Team changed',
  'user.status_change': 'Status changed',
  'user.jit_provision': 'Auto-provisioned on first login',
  'team.create': 'Team created',
  'team.lead_grant': 'Team lead granted',
  'team.lead_revoke': 'Team lead revoked',
};

/**
 * AuditLogTable — read-only. First real consumer of the audit_log table
 * (see internal/migrations/mysql/0001_init_rbac.sql) — nothing wrote to it
 * before this feature. Scoping (a lead seeing only their team's entries vs.
 * a super admin seeing everything) is expected to happen server-side; this
 * just renders whatever the endpoint returns.
 */
export default function AuditLogTable({ entries, users }) {
  const usersById = Object.fromEntries(users.map((u) => [u.id, u]));

  return (
    <div className="glass-panel">
      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>When (IST)</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const actor = e.actor_user_id ? usersById[e.actor_user_id] : null;
              return (
                <tr key={e.id}>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--text-3)', fontSize: '0.78rem' }}>{formatISTDateTime(e.created_at)}</td>
                  <td>{actor ? actor.display_name : <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>System</span>}</td>
                  <td>{ACTION_LABELS[e.action] || e.action}</td>
                  <td style={{ color: 'var(--text-2)' }}>{e.target_type} #{e.target_id}</td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                    {e.metadata ? Object.entries(e.metadata).map(([k, v]) => `${k}: ${v}`).join(', ') : ''}
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '1.5rem' }}>
                  <ScrollText size={18} style={{ opacity: 0.5, marginBottom: 6 }} /><br />
                  No audit events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
