/**
 * appConfig.js — Single source of truth for all frontend configuration.
 * Change values here to affect the entire application.
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
