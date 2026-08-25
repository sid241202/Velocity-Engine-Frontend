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
// This is a confidential-client flow (client_secret_post at the token
// endpoint — see AuthService.js's handleCallback()), matching how this
// client_id's WSO2 service provider is actually registered IdP-side (same
// auth method operator-360's proven-working SP uses). An earlier revision of
// this file ran a public-client PKCE-only flow, but the WSO2 SP for this
// client_id was never switched to "Public Client" IdP-side, so every token
// exchange failed with invalid_client / "Unsupported Client Authentication
// Method!". Reverting to client_secret_post here is what actually matches
// the current IdP-side registration.
//
// No value is hardcoded below for client_id/client_secret/redirect_uris —
// every one of them comes only from window._env_ (see public/env-config.js
// and docker-entrypoint.sh, which regenerates that file from real container
// env vars at startup — sourced from the Gitea-managed ConfigMap/Secret,
// never checked into this repo). getEnvVar()'s hardcoded fallback below is
// deliberately empty/generic so a misconfigured deployment fails obviously
// (empty client_id → WSO2 rejects immediately) instead of silently running
// on stale defaults baked into the image.
export const authConfig = {
  // WSO2 Identity Server Authority (Base URL)
  authority: getEnvVar('REACT_APP_WSO2_AUTHORITY', 'https://sso.uidai.net.in/oauth2'),

  client_id: getEnvVar('REACT_APP_CLIENT_ID', ''),

  // Confidential client secret (client_secret_post at the token endpoint).
  // Must be supplied at container runtime via window._env_ — see
  // docker-entrypoint.sh — never hardcoded here or in public/env-config.js.
  client_secret: getEnvVar('REACT_APP_CLIENT_SECRET', ''),

  redirect_uri: getEnvVar('REACT_APP_REDIRECT_URI', 'https://velocity.uidai.net.in/callback'),

  post_logout_redirect_uri: getEnvVar('REACT_APP_POST_LOGOUT_REDIRECT_URI', 'https://velocity.uidai.net.in'),
  // Response type - using authorization code flow
  response_type: 'code',

  scope: 'openid profile email',

  automaticSilentRenew: false,

  silent_redirect_uri: getEnvVar('REACT_APP_SILENT_REDIRECT_URI', 'https://velocity.uidai.net.in/silent-renew'),

  // Explicit metadata for WSO2 IS
  metadata: {
    issuer: 'https://sso.uidai.net.in/oauth2',
    authorization_endpoint: 'https://sso.uidai.net.in/oauth2/authorize',
    token_endpoint: 'https://sso.uidai.net.in/oauth2/token',
    userinfo_endpoint: 'https://sso.uidai.net.in/oauth2/userinfo',
    end_session_endpoint: 'https://sso.uidai.net.in/oidc/logout',
    jwks_uri: 'https://sso.uidai.net.in/oauth2/jwks',
  },

  // Load user info after authentication
  loadUserInfo: true,

  // Filter OIDC protocol claims
  filterProtocolClaims: true,

  // Include ID token in silent renew
  includeIdTokenInSilentRenew: false,
};
