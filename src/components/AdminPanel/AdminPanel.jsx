import React, { useCallback, useEffect, useState } from 'react';
import { Users, Building2, ShieldQuestion, ScrollText, RefreshCw, AlertTriangle } from 'lucide-react';
import { useRBAC } from '../../context/RBACContext';
import * as adminApi from '../../services/adminApi';
import UserTable from './UserTable';
import TeamsPanel from './TeamsPanel';
import RoleReference from './RoleReference';
import AuditLogTable from './AuditLogTable';
import './AdminPanel.css';

const SUB_TABS = [
  { key: 'users', label: 'Users', icon: Users },
  { key: 'teams', label: 'Teams', icon: Building2, superAdminOnly: true },
  { key: 'roles', label: 'Role Reference', icon: ShieldQuestion },
  { key: 'audit', label: 'Audit Log', icon: ScrollText },
];

/**
 * AdminPanel — the control surface for users/teams/roles. Reachable by
 * anyone with iam:manage (full access, today only SUPER_ADMIN) OR a
 * non-empty ledTeamIds (a team lead, scoped to their own team plus the
 * MISC holding pool for not-yet-assigned users — see the team-scoping
 * design notes; this is why access here isn't a plain PERMISSIONS.* key
 * like every other tab in Dashboard.jsx).
 *
 * All mutation is still re-verified server-side; nothing here is a trust
 * boundary. Scoping the *options offered* to what the backend will actually
 * accept just keeps a lead from hitting an avoidable 403.
 */
export default function AdminPanel() {
  const { userId, isSuperAdmin, ledTeamIds, loading: rbacLoading } = useRBAC();
  const [activeSubTab, setActiveSubTab] = useState('users');
  const [data, setData] = useState({ users: [], teams: [], roles: [], auditLog: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [users, teams, roles, auditLog] = await Promise.all([
        adminApi.listUsers(),
        adminApi.listTeams(),
        adminApi.listRoles(),
        adminApi.listAuditLog(),
      ]);
      setData({ users, teams, roles, auditLog });
    } catch (e) {
      setError(e.message || 'Failed to load Admin Panel data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (rbacLoading || loading) {
    return (
      <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-3)', minHeight: 200, justifyContent: 'center' }}>
        <RefreshCw size={14} className="spin" /> Loading Admin Panel…
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', minHeight: 200, justifyContent: 'center', textAlign: 'center' }}>
        <AlertTriangle size={28} color="var(--danger)" />
        <div style={{ color: 'var(--text-1)', fontWeight: 600 }}>Couldn&apos;t load Admin Panel</div>
        <div style={{ color: 'var(--text-3)', fontSize: '0.8rem', maxWidth: 380 }}>{error}</div>
        <button className="btn btn-ghost" onClick={loadAll}><RefreshCw size={13} /> Retry</button>
      </div>
    );
  }

  const miscTeam = data.teams.find((t) => t.is_default);
  // scopedTeamIds: teams this viewer may move a user into/out of.
  // SUPER_ADMIN: every team. A lead: their own team(s) plus the MISC pool
  // (claim an unassigned user, or release one back to MISC) — never a team
  // they don't lead, which is what keeps "scoped to your own team" honest.
  const scopedTeamIds = isSuperAdmin
    ? data.teams.map((t) => t.id)
    : [...ledTeamIds, ...(miscTeam ? [miscTeam.id] : [])];

  const visibleSubTabs = SUB_TABS.filter((t) => !t.superAdminOnly || isSuperAdmin);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="admin-subnav">
        {visibleSubTabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`admin-subnav-btn ${activeSubTab === key ? 'active' : ''}`}
            onClick={() => setActiveSubTab(key)}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {activeSubTab === 'users' && (
        <UserTable
          users={data.users}
          teams={data.teams}
          viewerUserId={userId}
          isSuperAdmin={isSuperAdmin}
          scopedTeamIds={scopedTeamIds}
          miscTeamId={miscTeam?.id}
          onChanged={loadAll}
        />
      )}
      {activeSubTab === 'teams' && isSuperAdmin && (
        <TeamsPanel teams={data.teams} users={data.users} onChanged={loadAll} />
      )}
      {activeSubTab === 'roles' && <RoleReference roles={data.roles} />}
      {activeSubTab === 'audit' && <AuditLogTable entries={data.auditLog} users={data.users} />}
    </div>
  );
}
