# Frontend — uid-dp-velocity-engine-control-plane-frontend

React/Vite control-plane UI for the Velocity Engine. See `../CLAUDE.md` (also
auto-loaded) for cross-repo rules, the session-continuity protocol, and the
autonomy/permission scope — this file only covers what's specific to this repo.

## Stack

- React 18 + Vite. `react-router-dom` is present but this app is effectively
  **tab-based**, not route-based: the only real route is `/dashboard`
  (`src/App.jsx`), and everything else is `activeTab` state inside
  `src/pages/Dashboard.jsx`. Keep that in mind before reaching for a new
  `<Route>` when "route guard" or "page" comes up in a request — it usually
  means a tab-panel inside Dashboard.
- Recharts for all charting.
- Plain hooks + Context API for state — no Redux/Zustand.
- Native `fetch` for all HTTP; no axios.
- `oidc-client-ts` for WSO2/OIDC — **live** on this branch. `src/services/AuthService.js`
  runs a real PKCE authorization-code flow against WSO2 (manual `fetch`-based
  token exchange, not `oidc-client-ts`'s own redirect handling — see that
  file). `src/pages/ProtectedRoute.jsx` does a real `authService.isAuthenticated()`
  check, not a passthrough. Don't repurpose `ProtectedRoute` for RBAC — it's
  authentication, RBAC is authorization, kept as separate concerns.

## Config

All configuration lives in `src/config/appConfig.js` — API/WS base URLs,
WebSocket reconnect tuning, rule builder defaults, and the WSO2/OIDC
`authConfig` (merged in from the now-deleted `src/config/authConfig.js`).
Don't add another `src/config/*.js` file — extend this one. No debug-identity
constants remain in this file on this branch.

The WSO2 `client_secret` this file used to ship (flagged as a real exposure —
not actually secret once bundled into browser JS) has been removed; this is
now a pure public-client PKCE flow (`code_challenge_method: 'S256'`,
`AuthService.js` generates a real `code_verifier`/`code_challenge`). Requires
the WSO2 service provider for this `client_id` to be registered as a public
client (no secret) IdP-side.

## RBAC (frontend half)

- `src/permissions.js` — `PERMISSIONS` (ten `resource:action` keys) and
  `ROLES` (four role names) constants. Must mirror
  `backend/internal/migrations/mysql/0001_init_rbac.sql` exactly (see
  `../CLAUDE.md` cross-repo contracts).
- `src/context/RBACContext.jsx` — `RBACProvider`/`useRBAC()`. Fetches
  `GET /me` once at mount, fails **closed** (empty permission set) on any
  error — never fail open.
- `src/services/apiClient.js` — `getAuthHeaders()` is the single place that
  attaches `Authorization: Bearer <access_token>` (the WSO2 access token,
  deliberately not the ID token) to an outgoing request. Every fetch that
  hits a backend route gated with `RequirePermission` on the backend side
  must call this and spread the result into its `headers` — a call that
  forgets this will 401 once the corresponding backend route is gated (this
  has happened before: `RuleBuilder.jsx`'s save call and
  `RuleSummaryPanel.jsx`'s status-change call both shipped without it and
  were fixed in 2026-07-20's RBAC audit pass).
- `src/components/RequirePermission.jsx` — component-level gate (hide or,
  via render-prop, disable-in-place). This is UX only; the backend
  independently re-verifies every permission-gated action.
- `src/components/PermissionGuard.jsx` — page/tab-panel-level gate,
  defaults fallback to `AccessDenied` (403 panel) instead of nothing.
- No debug-identity switcher exists on this branch — `X-Debug-User-Id` was a
  pre-WSO2 `demo`-branch-only concept; `demo` and `release` are deliberately
  diverged on identity (`demo` still uses the header shim), see `../CLAUDE.md`.

## Branches

- `release` — stable/demo branch. Has the full RBAC surface merged in
  (2026-07-16, `--no-ff` merge commit `70b2005` — real backend calls only,
  no `SIMULATION_MODE`/mock-data fallback), *and* the real WSO2/OIDC PKCE
  login flow merged in (2026-07-20, `wso2 integrated in version 3.0.0`,
  commit `e1e7674`). Only `release`, `demo`, and `test-simulation-refactored`
  exist as branches in this repo now; the original `rbac` and
  `test-simulation` branches have been merged and deleted.
- `demo` — a separate, deliberately-diverged branch, **not** merged into
  `release`. Still uses the pre-WSO2 `X-Debug-User-Id` debug-identity flow
  against the backend's `demo` branch (whose RBAC/rule-store storage layer
  differs from `release`'s — verify demo's own `CLAUDE.md` and code
  directly rather than assuming parity with this file) and may still have
  single-rule selection / a per-group chart filter not present on `release`.
- `test-simulation-refactored` — dedicated simulation branch (refactored
  plain-language UI pass + `SIMULATION_MODE`/mock data generators); the only
  simulation branch left. Deliberately never merged into `release` — still
  requires explicit permission to merge.
- The original `test-simulation` branch (pre-refactor) was superseded by
  `test-simulation-refactored` and deleted 2026-07-16, both locally and on
  `github`, at the user's explicit request — its full history is preserved
  via `test-simulation-refactored`'s ancestry, nothing was lost.

## Dev server

`npm run dev` (Vite, default port 3000, honors `PORT` env var if set —
`vite.config.js` was changed from a hardcoded `port: 3000` to
`process.env.PORT ? Number(process.env.PORT) : 3000` specifically so a
preview tool can run on an alternate port without a stray process on 3000
blocking it). Proxies `/api/*` to `http://localhost:8000` (the backend).
