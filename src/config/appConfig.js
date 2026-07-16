/**
 * appConfig.js — Single source of truth for all frontend configuration.
 * Change values here to affect the entire application. Every config file in
 * this app (WSO2/OIDC, RBAC, API/WebSocket, rule builder defaults) lives here
 * — do not add another src/config/*.js file; extend this one instead.
 */

// ── API & WebSocket ──────────────────────────────────────────────────────────
// In production (served from nginx), the frontend proxies /api/* to the backend.
// In local dev, Vite proxies /api to the backend (see vite.config.js).
export const API_BASE = '/api';
export const WS_BASE  = ''; // Empty = same host. Override for cross-host: 'ws://host:port'

// ── WebSocket Config ─────────────────────────────────────────────────────────
export const WS_RECONNECT_DELAY_MS   = 2000;   // Initial reconnect delay
export const WS_RECONNECT_MAX_MS     = 30000;  // Max backoff cap
export const WS_RECONNECT_MULTIPLIER = 1.5;    // Exponential backoff multiplier

// ── Live Analysis Config ──────────────────────────────────────────────────────
export const LIVE_STORE_MAX_ROWS = 200;    // Max rows shown in live analysis table
export const LIVE_POLL_INTERVAL  = 0;     // 0 = WebSocket push, >0 = polling interval ms

// ── Historical Analysis Config ───────────────────────────────────────────────
export const HISTORICAL_MAX_DAYS = 7;     // Maximum lookback in days

// ── Rule Builder Defaults ────────────────────────────────────────────────────
export const DEFAULT_SOURCE_TOPIC     = 'BI.AUTH.AUTH_TXN.UNION.V1';
export const DEFAULT_PENALTY_TTL_SEC  = 3600;   // 1 hour — used as Redis key TTL
export const DEFAULT_WINDOW_SIZE_SEC  = 300;    // 5 minutes
export const DEFAULT_SLIDE_SEC        = 60;     // 1 minute
export const MAX_AGGREGATIONS         = 3;

// ── RBAC ──────────────────────────────────────────────────────────────────────
// ME_ENDPOINT: hydrates the frontend's authorization context once at bootstrap
// (see src/context/RBACContext.jsx). Returns { user_id, roles[], permissions[] }.
export const ME_ENDPOINT = `${API_BASE}/me`;

// TEMPORARY PRE-WSO2 IDENTITY SHIM — mirrors the backend's AuthDevMode
// (internal/middleware/auth.go). Real identity comes from a WSO2/OIDC token
// once that phase lands; until then, every authenticated request carries this
// header so the backend's dev-mode IdentityMiddleware can resolve a user id.
// Must be replaced by real token-based identity before any non-development
// deployment — same caveat as the backend side.
export const AUTH_DEBUG_HEADER_NAME     = 'X-Debug-User-Id';
export const AUTH_DEBUG_USER_ID_STORAGE_KEY = 'velocity_debug_user_id';
export const AUTH_DEBUG_DEFAULT_USER_ID = '1';

// ── WSO2 / OIDC Auth Config ───────────────────────────────────────────────────
// Consolidated from the former src/config/authConfig.js — see the "one common
// config file" note at the top of this file. Only src/services/AuthService.js
// imports this today.
//
// SECURITY NOTE: client_secret below is a hardcoded fallback shipped in the
// frontend bundle — anything sent to the browser is publicly visible to
// anyone who opens devtools, so this is not actually a secret once deployed.
// A public OIDC client (SPA) should not have a client_secret at all — it
// should use Authorization Code + PKCE only (code_challenge_method is
// already set to S256 below, which is correct). Flagging this for a
// deliberate decision, not silently changing WSO2 client behavior here.
const getEnvVar = (key, defaultValue) => {
  return (window._env_ && window._env_[key]) || import.meta.env[key] || defaultValue;
};

export const authConfig = {
  // WSO2 Identity Server Authority (Base URL)
  authority: getEnvVar('REACT_APP_WSO2_AUTHORITY', 'https://sso.uidai.net.in/oauth2'),

  client_id: getEnvVar('REACT_APP_CLIENT_ID', '9HGuTetQjRjxkx1vHmoP1v0fXm8a'),

  client_secret: getEnvVar('REACT_APP_CLIENT_SECRET', 'RlsK9p2f4kJ_iKBZLSgiBYuIKjQa'),

  redirect_uri: getEnvVar('REACT_APP_REDIRECT_URI', 'http://localhost:3000/callback'),

  post_logout_redirect_uri: getEnvVar('REACT_APP_POST_LOGOUT_REDIRECT_URI', 'http://localhost:3000/'),
  // Response type - using authorization code flow
  response_type: 'code',

  scope: 'openid profile email',

  automaticSilentRenew: false,

  silent_redirect_uri: getEnvVar('REACT_APP_SILENT_REDIRECT_URI', 'https://ilabel.uidai.net.in/silent-renew'),

  // Explicit metadata for WSO2 IS
  metadata: {
    issuer: 'https://sso.uidai.net.in/oauth2',
    authorization_endpoint: 'https://sso.uidai.net.in/oauth2/authorize',
    token_endpoint: 'https://sso.uidai.net.in/oauth2/token',
    userinfo_endpoint: 'https://sso.uidai.net.in/oauth2/userinfo',
    end_session_endpoint: 'https://sso.uidai.net.in/oidc/logout',
    jwks_uri: 'https://sso.uidai.net.in/oauth2/jwks',
  },

  // PKCE support - S256 is required by WSO2 when PKCE is mandatory (RFC 7636)
  code_challenge_method: 'S256',

  // Load user info after authentication
  loadUserInfo: true,

  // Filter OIDC protocol claims
  filterProtocolClaims: true,

  // Include ID token in silent renew
  includeIdTokenInSilentRenew: false,
};
