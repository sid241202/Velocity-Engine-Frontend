/**
 * bootstrapAuth.js — seeds sessionStorage so the real, unmodified
 * AuthService.js/ProtectedRoute.jsx see an already-authenticated WSO2
 * session at app boot. Same technique used to verify RBAC-gated UI in past
 * sessions against a real backend (see this repo's own memory notes on the
 * WSO2-login-bypass trick) — baked into the app here instead of being done
 * by hand through devtools each time.
 */
import { authConfig } from '../config/appConfig';

export function seedSimulatedSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 8 * 3600; // 8h — long enough for a whole session
  const profile = { sub: 'sim-super-admin', name: 'Simulation Admin', email: 'admin@uidai.net.in' };
  const oidcUser = {
    id_token: 'simulation.id.token',
    session_state: null,
    access_token: 'simulation-access-token',
    refresh_token: null,
    token_type: 'Bearer',
    scope: 'openid profile email',
    profile,
    expires_at: expiresAt,
  };
  const storageKey = `oidc.user:${authConfig.authority}:${authConfig.client_id}`;
  sessionStorage.setItem(storageKey, JSON.stringify(oidcUser));
  sessionStorage.setItem('access_token', oidcUser.access_token);
  sessionStorage.setItem('token_type', 'Bearer');
  sessionStorage.setItem('expires_at', String(expiresAt));
  sessionStorage.setItem('user_profile', JSON.stringify(profile));
}
