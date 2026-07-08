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
- `oidc-client-ts` for WSO2/OIDC — **currently disabled** for local
  testing/staging. `src/pages/ProtectedRoute.jsx` is a passthrough
  (`({children}) => children`) with the real auth-check implementation
  preserved in a comment block for when WSO2 is re-enabled. Don't repurpose
  `ProtectedRoute` for RBAC — it's authentication, RBAC is authorization,
  kept as separate concerns.

## Config

All configuration lives in `src/config/appConfig.js` — API/WS base URLs,
WebSocket reconnect tuning, rule builder defaults, RBAC endpoints/debug
identity constants, and the WSO2/OIDC `authConfig` (merged in from the
now-deleted `src/config/authConfig.js`). Don't add another `src/config/*.js`
file — extend this one.

**Known flagged issue, not yet fixed**: `appConfig.js` ships a hardcoded
WSO2 `client_secret` fallback — not actually secret once bundled into a
browser-served JS file. Recommended fix when WSO2 is re-enabled: switch to a
PKCE-only public-client flow (`code_challenge_method` is already `S256`,
which is correct) rather than shipping a secret. Flagged in a code comment;
don't silently change WSO2 client behavior without confirming first.

## RBAC (frontend half)

- `src/permissions.js` — `PERMISSIONS` (ten `resource:action` keys) and
  `ROLES` (four role names) constants. Must mirror
  `backend/internal/migrations/mysql/0001_init_rbac.sql` exactly (see
  `../CLAUDE.md` cross-repo contracts).
- `src/context/RBACContext.jsx` — `RBACProvider`/`useRBAC()`. Fetches
  `GET /me` once at mount, fails **closed** (empty permission set) on any
  error — never fail open.
- `src/components/RequirePermission.jsx` — component-level gate (hide or,
  via render-prop, disable-in-place).
- `src/components/PermissionGuard.jsx` — page/tab-panel-level gate,
  defaults fallback to `AccessDenied` (403 panel) instead of nothing.
- `src/components/DebugIdentitySwitcher.jsx` — **temporary** pre-WSO2 dev
  tool; sets the `X-Debug-User-Id` header RBACContext sends. Delete this
  once real WSO2/OIDC tokens replace the header shim.

## Branches

- `release` — stable/demo branch, has full UI feature parity with mock data
  fallbacks for demoing without a live backend.
- `test-simulation` — dedicated simulation branch; `SIMULATION_MODE` wiring
  with mock data generators, kept in sync with `release`'s components.
- `rbac` — current RBAC work, cut from `release`, **not yet merged back**
  (explicitly deferred by the user).

## Dev server

`npm run dev` (Vite, default port 3000, honors `PORT` env var if set —
`vite.config.js` was changed from a hardcoded `port: 3000` to
`process.env.PORT ? Number(process.env.PORT) : 3000` specifically so a
preview tool can run on an alternate port without a stray process on 3000
blocking it). Proxies `/api/*` to `http://localhost:8000` (the backend).
