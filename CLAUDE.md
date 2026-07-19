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
- `oidc-client-ts` for WSO2/OIDC — present in `package.json` but unreachable
  on this branch: `src/App.jsx` never mounts a login route at all (no
  `Landing`/`Callback`/`ProtectedRoute`), it goes straight to `/dashboard`.
  `src/services/AuthService.js`/`src/config/appConfig.js`'s `authConfig`
  block are dead code as a result — nothing imports/calls them on any
  reachable code path. Left in place (not deleted) since removing WSO2
  wiring entirely wasn't asked for here; don't resurrect a login flow
  without being asked either.

## No auth/identity/RBAC layer — demo is a fully open application

As of 2026-07-20, this branch has **no login, no identity concept, and no
permission gating anywhere** — not a lighter-weight identity, not the
previous `X-Debug-User-Id` debug shim with checks removed, but nothing at
all. Every panel and action is unconditionally visible and enabled; the app
loads straight into `Dashboard` (see `src/App.jsx`). `release` (a
separately-diverged branch) has real WSO2/OIDC auth + RBAC — don't assume
parity, and don't port anything from it here without being asked.

Deleted entirely (not kept as no-ops): `src/components/DebugIdentitySwitcher.jsx`,
`src/context/RBACContext.jsx` (`RBACProvider`/`useRBAC`), `src/components/RequirePermission.jsx`,
`src/components/PermissionGuard.jsx`, `src/components/AccessDenied.jsx` (its
only caller was `PermissionGuard`). `src/App.jsx` no longer wraps the router
in `RBACProvider`. `src/pages/Dashboard.jsx`'s `NAV_ITEMS` no longer carry
permission keys, the nav bar no longer disables/dims any tab, and none of
the five tab-panels are wrapped in a permission guard anymore.
`src/components/RuleSummaryPanel.jsx`'s publish/delete calls no longer send
any identity header — the backend requires none. `src/config/appConfig.js`
no longer exports `ME_ENDPOINT` or any `AUTH_DEBUG_*` constant (there is no
`GET /me` on the backend to hydrate from anymore).

`src/permissions.js` (`PERMISSIONS`/`ROLES` constants) is **kept, not
deleted** — `release` still needs it and the two files must stay in sync if
`release`'s RBAC schema changes — but nothing on this branch imports or
applies it anymore.

## Branches

- `release` — stable/demo branch, real WSO2/OIDC auth + RBAC. Deliberately
  diverged from `demo` — verify `release`'s own `CLAUDE.md` and code
  directly rather than assuming parity with this file.
- `demo` (this branch) — no auth/identity/RBAC layer at all (see above).
  Not merged into `release`.
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
