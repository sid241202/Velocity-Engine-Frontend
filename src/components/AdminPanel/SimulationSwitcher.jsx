import React from 'react';
import { FlaskConical, RotateCcw } from 'lucide-react';
import { PERSONAS, getCurrentPersonaKey, setCurrentPersonaKey, resetSimulation } from '../../simulation/mockAdminData';

/**
 * SimulationSwitcher — admin-panel-simulation branch only. Lets a reviewer
 * flip between personas to compare what a super admin sees vs. what a team
 * lead sees vs. a regular member, without needing devtools. A full reload
 * is the simplest way to get every already-mounted panel (RBACContext,
 * AdminPanel's own fetch, Dashboard's tab-visibility) to re-derive from the
 * newly chosen persona consistently, so that's what this does.
 */
export default function SimulationSwitcher() {
  const current = getCurrentPersonaKey();

  const handleChange = (e) => {
    setCurrentPersonaKey(e.target.value);
    window.location.reload();
  };

  const handleReset = () => {
    resetSimulation();
    window.location.reload();
  };

  return (
    <div
      style={{
        position: 'fixed', top: 10, right: 10, zIndex: 2000,
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        background: 'var(--surface-3)', border: '1px solid var(--border-2)',
        borderRadius: 8, padding: '0.4rem 0.6rem',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      <FlaskConical size={13} color="var(--amber)" />
      <span style={{ fontSize: '0.7rem', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Viewing as</span>
      <select value={current} onChange={handleChange} style={{ fontSize: '0.75rem', padding: '0.25rem 0.4rem', maxWidth: 260 }}>
        {PERSONAS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
      </select>
      <button className="btn btn-ghost" title="Reset simulation data to defaults" onClick={handleReset} style={{ padding: '0.25rem 0.35rem' }}>
        <RotateCcw size={12} />
      </button>
    </div>
  );
}
