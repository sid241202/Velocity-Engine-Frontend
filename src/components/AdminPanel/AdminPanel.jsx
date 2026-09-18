import React, { useCallback, useEffect, useState } from 'react';
import { Users, ShieldQuestion, ScrollText, RefreshCw, AlertTriangle } from 'lucide-react';
import { useRBAC } from '../../context/RBACContext';
import * as adminApi from '../../services/adminApi';
import UserTable from './UserTable';
import RoleReference from './RoleReference';
import AuditLogTable from './AuditLogTable';
import './AdminPanel.css';

const SUB_TABS = [
  { key: 'users', label: 'Users', icon: Users },
  { key: 'roles', label: 'Role Reference', icon: ShieldQuestion },
  { key: 'audit', label: 'Audit Log', icon: ScrollText },
];

/**
 * AdminPanel — the control surface for users/roles. Reachable only by
 * iam:manage (SUPER_ADMIN) — gated at the tab level in Dashboard.jsx like
 * every other tab.
 *
 * All mutation is still re-verified server-side; nothing here is a trust
 * boundary.
 */
export default function AdminPanel() {
  const { userId, loading: rbacLoading } = useRBAC();
  const [activeSubTab, setActiveSubTab] = useState('users');
  const [data, setData] = useState({ users: [], roles: [], auditLog: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [users, roles, auditLog] = await Promise.all([
        adminApi.listUsers(),
        adminApi.listRoles(),
        adminApi.listAuditLog(),
      ]);
      setData({ users, roles, auditLog });
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="admin-subnav">
        {SUB_TABS.map(({ key, label, icon: Icon }) => (
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
        <UserTable users={data.users} viewerUserId={userId} onChanged={loadAll} />
      )}
      {activeSubTab === 'roles' && <RoleReference roles={data.roles} />}
      {activeSubTab === 'audit' && <AuditLogTable entries={data.auditLog} users={data.users} />}
    </div>
  );
}
