import React, { useState } from 'react';
import { UserCog, ShieldAlert, Lock } from 'lucide-react';
import { Modal } from '../ui/Overlay';
import * as adminApi from '../../services/adminApi';

const ALL_ROLES = ['SUPER_ADMIN', 'RULE_MANAGER', 'RULE_EDITOR', 'READ_ONLY_ANALYST'];

export default function UserEditModal({ user, isSelf, isLastActiveSuperAdmin, onClose, onSaved }) {
  const [role, setRole] = useState(user.role);
  const [status, setStatus] = useState(user.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const locked = isSelf || isLastActiveSuperAdmin;
  const roleGoingToSuperAdmin = role === 'SUPER_ADMIN' && role !== user.role;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await adminApi.updateUser(user.id, { role, status });
      onSaved();
    } catch (e) {
      setError(e.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} icon={UserCog} title={user.display_name} subtitle={user.email} width={480}>
      {locked ? (
        <div className="card-sm" style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
          <Lock size={16} color="var(--warning)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
            {isSelf
              ? "You can't change your own role or status here — ask another admin to make this change."
              : "This is the last active SUPER_ADMIN account — it can't be demoted or disabled, or the system would have no administrator left. Promote someone else to SUPER_ADMIN first."}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div className="form-group">
            <label>Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ALL_ROLES.map((r) => <option key={r} value={r}>{r.replaceAll('_', ' ')}</option>)}
            </select>
            {roleGoingToSuperAdmin && (
              <div style={{ fontSize: '0.72rem', color: 'var(--warning)', marginTop: '0.3rem', display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                <ShieldAlert size={12} /> Grants full system access, including user/role administration.
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ACTIVE">Active</option>
              <option value="DISABLED">Disabled</option>
            </select>
          </div>

          {error && <div style={{ color: 'var(--danger)', fontSize: '0.8rem' }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.4rem' }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
