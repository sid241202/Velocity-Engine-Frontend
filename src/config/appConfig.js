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

// AUTH_MODE selects which identity path is active, mirroring the backend's
// config.AuthMode ("dev" | "wso2"):
//   - "dev":  the X-Debug-User-Id header shim below, kept as a local dev/demo
//             fallback for when a live WSO2 instance isn't reachable.
//   - "wso2": real WSO2/OIDC tokens (see AuthService.js) — getAuthHeaders()
//             in apiClient.js attaches Authorization: Bearer <access_token>
//             instead of the debug header.
export const AUTH_MODE = getEnvVar('REACT_APP_AUTH_MODE', 'dev');

// TEMPORARY PRE-WSO2 IDENTITY SHIM — mirrors the backend's AuthDevMode
// (internal/middleware/auth.go). Only used when AUTH_MODE === 'dev'.
export const AUTH_DEBUG_HEADER_NAME     = 'X-Debug-User-Id';
export const AUTH_DEBUG_USER_ID_STORAGE_KEY = 'velocity_debug_user_id';
export const AUTH_DEBUG_DEFAULT_USER_ID = '1';

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
export const authConfig = {
  // WSO2 Identity Server Authority (Base URL)
  authority: getEnvVar('REACT_APP_WSO2_AUTHORITY', 'https://sso.uidai.net.in/oauth2'),

  client_id: getEnvVar('REACT_APP_CLIENT_ID', '9HGuTetQjRjxkx1vHmoP1v0fXm8a'),

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
