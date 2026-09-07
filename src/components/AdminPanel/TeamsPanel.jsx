import React, { useState } from 'react';
import { Plus, Crown, X } from 'lucide-react';
import * as adminApi from '../../services/adminApi';

/**
 * TeamsPanel — SUPER_ADMIN only. Creating teams and granting/revoking team
 * leadership are both kept out of a lead's own reach (see the design notes:
 * a lead can administer their team's *members*, but not decide who else
 * gets to administer a team — that stays a super-admin call).
 */
export default function TeamsPanel({ teams, users, onChanged }) {
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [grantPickerTeamId, setGrantPickerTeamId] = useState(null);
  const [grantUserId, setGrantUserId] = useState('');

  const usersById = Object.fromEntries(users.map((u) => [u.id, u]));

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    try {
      await adminApi.createTeam({ name: newName.trim(), description: newDesc.trim() });
      setNewName('');
      setNewDesc('');
      onChanged();
    } catch (e) {
      setError(e.message || 'Failed to create team');
    } finally {
      setCreating(false);
    }
  };

  const handleGrant = async (teamId) => {
    if (!grantUserId) return;
    try {
      await adminApi.grantTeamLead(teamId, Number(grantUserId));
      setGrantPickerTeamId(null);
      setGrantUserId('');
      onChanged();
    } catch (e) {
      setError(e.message || 'Failed to grant team lead');
    }
  };

  const handleRevoke = async (teamId, userId) => {
    try {
      await adminApi.revokeTeamLead(teamId, userId);
      onChanged();
    } catch (e) {
      setError(e.message || 'Failed to revoke team lead');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="glass-panel">
        <div style={{ fontWeight: 600, marginBottom: '0.6rem', color: 'var(--text-1)' }}>Create a team</div>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <input placeholder="Team name" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ maxWidth: 200 }} />
          <input placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <button className="btn btn-primary" onClick={handleCreate} disabled={creating || !newName.trim()}>
            <Plus size={14} /> Create
          </button>
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}>{error}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.8rem' }}>
        {teams.map((team) => {
          const members = users.filter((u) => u.team_id === team.id);
          const leads = (team.lead_user_ids || []).map((id) => usersById[id]).filter(Boolean);
          const eligibleForLead = members.filter((m) => !(team.lead_user_ids || []).includes(m.id));
          return (
            <div key={team.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-1)' }}>
                    {team.name} {team.is_default && <span className="badge badge-warning" style={{ marginLeft: 6 }}>Default pool</span>}
                  </div>
                  {team.description && <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 2 }}>{team.description}</div>}
                </div>
                <span className="badge badge-muted">{members.length} member{members.length === 1 ? '' : 's'}</span>
              </div>

              {!team.is_default && (
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem' }}>Team leads</div>
                  {leads.length === 0 && <div style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>No lead assigned yet.</div>}
                  {leads.map((lead) => (
                    <div key={lead.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                      <Crown size={12} color="var(--violet-light)" />
                      {lead.display_name}
                      <button className="btn btn-ghost" style={{ padding: '0.1rem 0.3rem', marginLeft: 'auto' }} title="Revoke lead" onClick={() => handleRevoke(team.id, lead.id)}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}

                  {grantPickerTeamId === team.id ? (
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                      <select value={grantUserId} onChange={(e) => setGrantUserId(e.target.value)} style={{ flex: 1 }}>
                        <option value="">Choose a member…</option>
                        {eligibleForLead.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                      </select>
                      <button className="btn btn-primary" style={{ padding: '0.3rem 0.6rem' }} onClick={() => handleGrant(team.id)} disabled={!grantUserId}>Grant</button>
                      <button className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem' }} onClick={() => setGrantPickerTeamId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', marginTop: '0.3rem' }} onClick={() => setGrantPickerTeamId(team.id)} disabled={eligibleForLead.length === 0}>
                      <Plus size={12} /> Grant lead
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
