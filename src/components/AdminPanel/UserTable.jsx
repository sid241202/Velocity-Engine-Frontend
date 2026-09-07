import React, { useMemo, useState } from 'react';
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
 * UserTable — searchable/filterable user list. "Unassigned" surfaces
 * MISC-team users specifically so a JIT-provisioned user with no real team
 * yet doesn't sit invisible until someone thinks to look for them.
 */
export default function UserTable({ users, teams, roles, viewerUserId, isSuperAdmin, scopedTeamIds, miscTeamId, onChanged }) {
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [editingUser, setEditingUser] = useState(null);

  const teamById = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const leadTeamIdsByUser = useMemo(() => {
    const map = {};
    teams.forEach((t) => (t.lead_user_ids || []).forEach((uid) => {
      map[uid] = map[uid] || [];
      map[uid].push(t.id);
    }));
    return map;
  }, [teams]);

  const visibleUsers = useMemo(
    () => (isSuperAdmin ? users : users.filter((u) => scopedTeamIds.includes(u.team_id))),
    [users, isSuperAdmin, scopedTeamIds]
  );

  const unassignedCount = visibleUsers.filter((u) => u.team_id === miscTeamId).length;

  const filtered = visibleUsers.filter((u) => {
    if (teamFilter === 'UNASSIGNED' && u.team_id !== miscTeamId) return false;
    if (teamFilter !== 'ALL' && teamFilter !== 'UNASSIGNED' && String(u.team_id) !== teamFilter) return false;
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
        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
          <option value="ALL">All teams</option>
          <option value="UNASSIGNED">Unassigned (MISC){unassignedCount ? ` — ${unassignedCount}` : ''}</option>
          {(isSuperAdmin ? teams : teams.filter((t) => scopedTeamIds.includes(t.id))).map((t) => (
            <option key={t.id} value={String(t.id)}>{t.name}</option>
          ))}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-3)' }}>
          {filtered.length} of {visibleUsers.length} user{visibleUsers.length === 1 ? '' : 's'}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Team</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const team = teamById[u.team_id];
              const isUnassigned = u.team_id === miscTeamId;
              const isLeadOf = leadTeamIdsByUser[u.id] || [];
              const canEdit = isSuperAdmin || scopedTeamIds.includes(u.team_id);
              return (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{u.display_name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{u.email}</div>
                  </td>
                  <td>{roleBadge(u.role)}</td>
                  <td>
                    {isUnassigned
                      ? <span className="badge badge-warning">Unassigned</span>
                      : <span style={{ color: 'var(--text-2)' }}>{team?.name || '—'}</span>}
                    {isLeadOf.length > 0 && <span className="badge badge-violet" style={{ marginLeft: '0.35rem' }}>Lead</span>}
                  </td>
                  <td>{statusBadge(u.status)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '0.3rem 0.55rem' }}
                      disabled={!canEdit}
                      title={canEdit ? 'Edit user' : "Outside your team's scope"}
                      onClick={() => setEditingUser(u)}
                    >
                      <Pencil size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '1.5rem' }}>
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
          teams={teams}
          roles={roles}
          isSuperAdmin={isSuperAdmin}
          scopedTeamIds={scopedTeamIds}
          miscTeamId={miscTeamId}
          isSelf={editingUser.id === viewerUserId}
          isLastActiveSuperAdmin={editingUser.role === 'SUPER_ADMIN' && editingUser.status === 'ACTIVE' && superAdminCount <= 1}
          onClose={() => setEditingUser(null)}
          onSaved={() => { setEditingUser(null); onChanged(); }}
        />
      )}
    </div>
  );
}
