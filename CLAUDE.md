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
  runs a real confidential-client authorization-code flow against WSO2
  (manual `fetch`-based token exchange, not `oidc-client-ts`'s own redirect
  handling — see that file). `src/pages/ProtectedRoute.jsx` does a real
  `authService.isAuthenticated()` check, not a passthrough. Don't repurpose
  `ProtectedRoute` for RBAC — it's authentication, RBAC is authorization,
  kept as separate concerns.

## Config

All configuration lives in `src/config/appConfig.js` — API/WS base URLs,
WebSocket reconnect tuning, rule builder defaults, and the WSO2/OIDC
`authConfig` (merged in from the now-deleted `src/config/authConfig.js`).
Don't add another `src/config/*.js` file — extend this one. No debug-identity
constants remain in this file on this branch.

WSO2/OIDC is a **confidential client**: `AuthService.js`'s `handleCallback()`
sends `client_secret` (`client_secret_post`) to the token endpoint — no PKCE.
A prior revision ran PKCE-only public-client auth instead, but the WSO2
service provider for this `client_id` was never switched to "Public Client"
IdP-side, so every token exchange failed with `invalid_client` /
`"Unsupported Client Authentication Method!"`. Reverting to
`client_secret_post` is what actually matches the SP's real registration
(same auth method `operator-360-ui`'s proven-working SP uses).

**No config value is ever hardcoded in this repo.** `getEnvVar()` in
`appConfig.js` reads `window._env_` first, which `docker-entrypoint.sh`
(wired into the Dockerfile's `CMD`) regenerates from real container env vars
at every container start — sourced from the Gitea-managed
ConfigMap/Secret, see `resources/configmap-release.txt`. The checked-in
`public/env-config.js` is a local-dev-only fallback (empty `client_id`/
`client_secret`, localhost URLs) — if you see a real client_id/secret show
up in it, that's a mistake, not a deployment shortcut. `REACT_APP_CLIENT_SECRET`
in particular must come from a Kubernetes **Secret** (`secretKeyRef`), never
a plain ConfigMap value.

## UI/UX design system

This app's visual language and reusable component set evolved across
several dedicated design passes, all on sandbox branches (never directly on
`release` — see Branches below for exactly which branch has what). Read
this before starting UI/UX work so it builds on what already exists instead
of reinventing it.

**Design tokens (Castle-inspired v3, `src/index.css`)** — currently live on
`test-castle` only, **not yet ported to `release`** (release still runs the
original approximated dark palette: `--violet: #5865f2`, `--teal:
#2dd4bf`). Confirm which of these you're targeting before writing new CSS —
don't assume Castle's tokens are already in effect unless you've checked
the actual branch. The full, exact palette (extracted directly from
https://castle.io's computed styles, not approximated):
- Neutral scale: `--slate-1: #111113` (page bg) → `--slate-12: #edeef0`
  (primary text), with `2 #18191b, 3 #212225, 4 #272a2d, 5 #2e3135,
  6 #363a3f, 7 #43484e, 8 #5a6169, 9 #696e77, 10 #777b84, 11 #b0b4ba`
  giving the full range of card/border/muted-text stops in between.
- Primary accent (rebased `--violet`): `#3d63dd` (Castle's blue-9).
- Secondary accent (rebased `--teal`): `#29a383` (Castle's jade-9).
- Font: "Inter Variable". Base corner radius: `0.75rem` (12px,
  `--radius-lg`).
- Semantic danger/warning/success tokens and card/glass-panel treatment are
  layered on top of this scale — see `src/index.css` directly for the
  full derived-variant list rather than assuming only the above exist.

**Reusable component library (`src/components/ui/`)** — built across the
interactivity and Castle-fidelity passes, all still `test-castle`-only
except where noted:
- `Overlay.jsx` — the shared Modal/Drawer/RuleLink primitive. Every panel's
  click-to-drill-down interaction (entity detail, window/hour detail,
  breach list, rule-name links) is built on this — extend it rather than
  building a new modal/drawer from scratch.
- `ScoreTriad.jsx` — compact three-number colored score badge, for showing
  multiple related metrics inline in a table row.
- `JsonViewer.jsx` — line-numbered raw-payload viewer, for showing an
  event/result's underlying JSON in a drill-down.
- `LinkedEntityList.jsx` — collapsible grouped list with per-row hide/show,
  for entity relationship views.
- `ChartSwitcher.jsx` — tabbed control for flipping one chart between
  multiple views of the same underlying data.

**UX principles established and validated across this project's iterations
— hold new work to the same bar:**
- Every panel needs a real treatment for loading, empty-data, and
  API/WebSocket-failure states — never a blank panel or an unhandled
  console error (verified live in a browser, not assumed from source).
- Copy should read in plain language for a non-technical analyst, not
  engineering jargon (see the 2026-07 "plain-language pass" commits on the
  `test` lineage for the established tone).
- Displayed timestamps must be correct in IST — this project has a
  recurring "double-shift" bug class (reading a UTC accessor without first
  adding the IST offset); verify against a known wall-clock value, don't
  assume.
- RBAC-driven show/hide/disable (`RequirePermission`/`PermissionGuard`) is
  UX only, never a security boundary — see the RBAC section below.
- Don't clone a design reference's specific brand assets/copy/illustrations
  even when told to match it closely — match its design *system* (colors,
  type, spacing, component patterns) applied to this app's own real
  content. This line was drawn deliberately during the Castle-inspired work
  and should hold for any future reference-site-inspired pass too.

**How to actually verify UI/UX work** (in order of preference, established
across multiple sessions): run the real app shell against a real or
Dockerized backend when one's reachable (most faithful — confirmed better
than an isolated component harness at catching real integration issues);
otherwise a standalone Vite harness importing the real, unmodified
component files still beats reading source alone for anything visual. See
this repo's memory entries (if you have access to them) for the exact
mechanics of both techniques, including the WSO2-login-bypass trick for
exercising RBAC-gated UI without a live WSO2 tenant. Reading source and
reasoning about how a component "should" look is not a substitute for
actually rendering it — this project has repeatedly found real bugs (lint
config, a missing `<script>` tag breaking runtime config, RBAC gaps) only
by actually running the app, not by code review alone.

## RBAC (frontend half)

- `src/permissions.js` — `PERMISSIONS` (ten `resource:action` keys) and
  `ROLES` (four role names) constants. Must mirror
  `backend/internal/migrations/mysql/0001_init_rbac.sql` exactly (see
  `../CLAUDE.md` cross-repo contracts).
- `src/context/RBACContext.jsx` — `RBACProvider`/`useRBAC()`. Fetches
  `GET /me` once at mount, fails **closed** (empty permission set) on any
  error — never fail open.
- `src/services/apiClient.js` — `getAuthHeaders()` is the single place that
  attaches identity to an outgoing request: `Authorization: Bearer
  <access_token>` (kept for forward-compat, not currently checked
  backend-side) and `X-User-Subject: <sub>` (the WSO2 `sub` claim decoded
  client-side from the id_token — **this is what the backend actually
  trusts**, see below). Every fetch that hits a backend route gated with
  `RequirePermission` on the backend side must call this and spread the
  result into its `headers` — a call that forgets this will 401 once the
  corresponding backend route is gated (this has happened before:
  `RuleBuilder.jsx`'s save call and `RuleSummaryPanel.jsx`'s status-change
  call both shipped without it and were fixed in 2026-07-20's RBAC audit
  pass).

  **2026-09-04, known/deliberate/temporary security gap**: the backend
  (`internal/middleware/auth.go`'s `IdentityMiddleware`) no longer verifies
  the WSO2 token's signature — it trusts `X-User-Subject` as-is. This
  replaced real JWKS-based verification because the backend pod couldn't
  reach `https://sso.uidai.net.in/oauth2/jwks` from its pod network in the
  UIDAI prod cluster (TLS handshake timeout, then EOF). Mirrors
  fraud-investigation-system-ui's (Prahari) `X-User-Adid` model — see that
  repo's `docs/AUTHENTICATION.md` and `agentic-fms/auth/README.md`, which
  document the same underlying WSO2-JWKS-unreachable problem. RBAC
  (`RequirePermission` on the backend) is the only real access-control
  boundary past this point; there is no server-side proof `X-User-Subject`
  wasn't forged. Revisit once JWKS reachability from the backend's pod
  network is fixed — the previous implementation is recoverable from git
  history on both repos.
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
