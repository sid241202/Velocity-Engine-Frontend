import React from 'react';
import { ShieldOff } from 'lucide-react';

/**
 * AccessDenied — the 403 state shown by PermissionGuard when the current
 * role lacks the permission required for a page/tab. Matches the visual
 * language of ErrorBoundary's fallback so a forbidden page reads as an
 * expected, calm state rather than a broken one.
 */
export default function AccessDenied({ label = 'This section', message }) {
  return (
    <div
      className="glass-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '320px',
        gap: '1.25rem',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <ShieldOff size={40} color="var(--warning)" style={{ opacity: 0.8 }} />
      <div>
        <p style={{ color: '#f1f5f9', fontSize: '1rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
          Access Denied
        </p>
        <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.85rem', maxWidth: '420px', lineHeight: 1.6, margin: '0 auto' }}>
          {message || `${label} requires a permission your current role doesn't have. Contact an administrator if you believe this is a mistake.`}
        </p>
      </div>
    </div>
  );
}
