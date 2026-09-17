import React from 'react';
import { Fingerprint } from 'lucide-react';
import '../pages/Callback.css';

/**
 * SessionLoading — the one branded "still figuring out who you are"
 * transition, shown by Landing (initial session probe), ProtectedRoute
 * (session probe + the RBAC permission fetch that follows it), and
 * Callback (token exchange). Having a single component here means there is
 * exactly one loading visual anywhere in the auth bootstrap sequence,
 * instead of each caller rendering its own partial-state UI — which is
 * what produced the earlier landing-page/access-denied/disconnected flicker
 * between login and the dashboard settling.
 */
export default function SessionLoading({ message = 'Verifying secure access...' }) {
  return (
    <div className="cb-root">
      <div className="cb-dot-grid"></div>
      <div className="cb-glow cb-glow-left"></div>
      <div className="cb-glow cb-glow-right"></div>

      <div className="cb-card">
        <div className="cb-top-bar"></div>

        <div className="cb-icon-area">
          <div className="cb-fp-wrap">
            <Fingerprint className="cb-fp-icon" />
            <span className="cb-ring cb-ring-1"></span>
            <span className="cb-ring cb-ring-2"></span>
            <svg className="cb-spin-ring" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="46" stroke="#00d2a0" strokeWidth="2" strokeDasharray="60 230" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <h2 className="cb-title">Authenticating</h2>
        <p className="cb-message">{message}</p>

        <div className="cb-dots">
          <span className="cb-dot cb-dot-1"></span>
          <span className="cb-dot cb-dot-2"></span>
          <span className="cb-dot cb-dot-3"></span>
        </div>

        <p className="cb-footer">Secured by WSO2 Identity Server • OIDC</p>
      </div>
    </div>
  );
}
