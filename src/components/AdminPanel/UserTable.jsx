import React, { useState } from 'react';
import { Search, Pencil, UserX2 } from 'lucide-react';
import UserEditModal from './UserEditModal';

function statusBadge(status) {
  return status === 'ACTIVE'
    ? <span className="badge badge-success">Active</span>
    : <span className="badge badge-muted">Disabled</span>;
}

function roleBadge(role) {
  const cls = role === 'SUPER_ADMIN' ? 'badge-violet'
    : role === 'RULE_MANAGER' ? 'badge-teal'
    : role === 'RULE_EDITOR' ? 'badge-amber'
    : 'badge-muted';
  return <span className={`badge ${cls}`}>{role.replaceAll('_', ' ')}</span>;
}

/**
 * UserTable — searchable user list. Reachable only by iam:manage
 * (SUPER_ADMIN), so every listed user is editable without further scoping.
 */
export default function UserTable({ users, viewerUserId, onChanged }) {
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState(null);

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return u.display_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const superAdminCount = users.filter((u) => u.role === 'SUPER_ADMIN' && u.status === 'ACTIVE').length;

  return (
    <div className="glass-panel">
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.9rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="input-unit-row" style={{ maxWidth: 280, flex: 1 }}>
          <input
            type="text"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '2rem' }}
          />
          <Search size={14} style={{ position: 'relative', left: 28, marginRight: -22, color: 'var(--text-3)', pointerEvents: 'none' }} />
        </div>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-3)' }}>
          {filtered.length} of {users.length} user{users.length === 1 ? '' : 's'}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>
                  <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{u.display_name}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{u.email}</div>
                </td>
                <td>{roleBadge(u.role)}</td>
                <td>{statusBadge(u.status)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '0.3rem 0.55rem' }}
                    title="Edit user"
                    onClick={() => setEditingUser(u)}
                  >
                    <Pencil size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '1.5rem' }}>
                  <UserX2 size={18} style={{ opacity: 0.5, marginBottom: 6 }} /><br />
                  No users match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingUser && (
        <UserEditModal
          user={editingUser}
          isSelf={editingUser.id === viewerUserId}
          isLastActiveSuperAdmin={editingUser.role === 'SUPER_ADMIN' && editingUser.status === 'ACTIVE' && superAdminCount <= 1}
          onClose={() => setEditingUser(null)}
          onSaved={() => { setEditingUser(null); onChanged(); }}
        />
      )}
    </div>
  );
}
