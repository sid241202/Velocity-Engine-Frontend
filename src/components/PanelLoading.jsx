import React from 'react';
import { Loader2 } from 'lucide-react';

/**
 * PanelLoading — shown by PermissionGuard while the RBAC permission set is
 * still loading, so a panel that will ultimately be allowed doesn't flash
 * AccessDenied first just because permissions haven't resolved yet. Same
 * footprint as AccessDenied (glass-panel, 320px min height) so there's no
 * layout jump between the two.
 */
export default function PanelLoading({ label = 'Checking access…' }) {
  return (
    <div
      className="glass-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '320px',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <Loader2
        size={32}
        color="var(--text-muted, #94a3b8)"
        style={{ opacity: 0.8, animation: 'spin 0.8s linear infinite' }}
      />
      <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.85rem', margin: 0 }}>{label}</p>
    </div>
  );
}
