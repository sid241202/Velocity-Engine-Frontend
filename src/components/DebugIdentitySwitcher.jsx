import React, { useState } from 'react';
import { UserCog } from 'lucide-react';
import { useRBAC } from '../context/RBACContext';

/**
 * DebugIdentitySwitcher — TEMPORARY pre-WSO2 dev tool.
 *
 * Lets whoever is testing locally switch which MySQL `users.id` the app
 * authenticates as, by changing the X-Debug-User-Id header value that
 * RBACContext sends to GET /me (mirrors the backend's AuthDevMode identity
 * shim — see internal/middleware/auth.go). This has no effect once real
 * WSO2/OIDC tokens replace the header shim; delete this component then.
 *
 * There is no fixed dropdown of "known" users here because seed `users`
 * rows are created manually in each environment (only roles/permissions
 * are seeded by the migration) — so this just accepts a raw numeric id.
 */
export default function DebugIdentitySwitcher() {
  const { userId, roles, loading, error, debugUserId, setDebugUserId } = useRBAC();
  const [draft, setDraft] = useState(debugUserId);

  const applyDraft = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== debugUserId) setDebugUserId(trimmed);
  };

  return (
    <div
      title="Temporary pre-WSO2 dev tool — sets the X-Debug-User-Id header used to resolve RBAC permissions"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.2rem 0.5rem',
        borderRadius: '6px',
        border: '1px dashed rgba(245, 158, 11, 0.4)',
        background: 'rgba(245, 158, 11, 0.06)',
        fontSize: '0.7rem',
      }}
    >
      <UserCog size={12} color="var(--amber, #f59e0b)" />
      <span style={{ color: 'var(--amber, #f59e0b)', letterSpacing: '0.03em' }}>DEBUG UID</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && applyDraft()}
        onBlur={applyDraft}
        style={{
          width: '2.75rem',
          padding: '0.1rem 0.3rem',
          background: 'rgba(0,0,0,0.3)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '4px',
          color: 'var(--text-main)',
          fontSize: '0.7rem',
        }}
      />
      <span style={{ color: 'var(--text-muted, #94a3b8)' }}>
        {loading ? 'loading…' : error ? 'no access' : roles.length > 0 ? roles.join(', ') : 'no roles'}
        {userId != null && !loading && !error ? ` (user ${userId})` : ''}
      </span>
    </div>
  );
}
