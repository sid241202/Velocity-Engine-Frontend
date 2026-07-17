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

// getEnvVar: checks a runtime-injected window._env_ override first (see
// public/env-config.js in Docker deployments), then build-time Vite env,
// then falls back to the given default.
const getEnvVar = (key, defaultValue) => {
  return (window._env_ && window._env_[key]) || import.meta.env[key] || defaultValue;
};

// ── WSO2 / OIDC Auth Config ───────────────────────────────────────────────────
// Consolidated from the former src/config/authConfig.js — see the "one common
// config file" note at the top of this file. Only src/services/AuthService.js
// imports this today.
//
// client_secret was removed here (demo-wso2): this is now a pure public-
// client PKCE flow (code_challenge_method: 'S256' below, already correct;
// AuthService.js's login()/handleCallback() already generate and send a real
// PKCE code_verifier/code_challenge). Requires the WSO2 service provider for
// this client_id to be registered as a public client (no secret) IdP-side.
//
// Defaults below point at this app's actual staging target, 10.10.79.27:32515
// (a raw IP:port — no DNS name, unlike operator-360's staging/prod, which
// both use https://<dns-name>/... — hence http, not https, here; no TLS
// termination on a bare IP). Path structure (bare origin for
// post_logout_redirect_uri, "/callback" for redirect_uri, "/silent-renew"
// for silent_redirect_uri) matches operator-360's actual
// .env.staging/.env.production convention, cross-checked directly rather
// than assumed. "/callback" also matches this app's own registered route in
// App.jsx. Override via REACT_APP_REDIRECT_URI etc. (or public/env-config.js
// at runtime) for any other environment.
export const authConfig = {
  // WSO2 Identity Server Authority (Base URL)
  authority: getEnvVar('REACT_APP_WSO2_AUTHORITY', 'https://sso.uidai.net.in/oauth2'),

  client_id: getEnvVar('REACT_APP_CLIENT_ID', '9HGuTetQjRjxkx1vHmoP1v0fXm8a'),

  redirect_uri: getEnvVar('REACT_APP_REDIRECT_URI', 'http://10.10.79.27:32515/callback'),

  post_logout_redirect_uri: getEnvVar('REACT_APP_POST_LOGOUT_REDIRECT_URI', 'http://10.10.79.27:32515'),
  // Response type - using authorization code flow
  response_type: 'code',

  scope: 'openid profile email',

  automaticSilentRenew: false,

  silent_redirect_uri: getEnvVar('REACT_APP_SILENT_REDIRECT_URI', 'http://10.10.79.27:32515/silent-renew'),

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
