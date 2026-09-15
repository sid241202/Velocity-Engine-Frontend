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
several dedicated design passes. **Current state as of 2026-09-15**:
Castle-inspired tokens + the full component/UX library below (including the
`revamp`-originated Home page, guided Rule Builder, and Rules Browser) are
now live on **`release`** itself — ported directly from `revamp` (commit
`78529cb`) on 2026-09-15, simulation code stripped, at the user's explicit
request, bypassing the usual `test` → `test-simulation` → `release` cycle
for this one promotion. **`test` and `test-simulation` do NOT have this
work** — they still run the design system as of `8fc96b2` (tokens +
component library, but none of the `revamp` Home/Rule-Builder/Rules-Browser
work). This is a deliberate, temporary inversion of the usual "release is
always the most conservative branch" assumption: as of this port, `release`
is UI-ahead of `test`/`test-simulation`, not behind them. Don't assume
branch "distance from release" implies "how much UI work it has" until
someone ports this same work down into `test`/`test-simulation` too (not
yet done as of this writing). Always confirm which branch you're actually
on before writing new CSS. Read this section, the Branches section below,
and `.claude/STATE.md` before starting UI/UX work so it builds on what
already exists instead of reinventing it.

**Design tokens (Castle-inspired v3, `src/index.css`)** — the full, exact
palette (extracted directly from https://castle.io's computed styles, not
approximated):
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

**Reusable component library (`src/components/ui/`)**, live on `release`/
`test`/`revamp`:
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

**Customer-friendliness redesign, now on `release`** (originated on
`revamp` — see `.claude/STATE.md` for full round-by-round detail, this is
just the durable summary): `HomeView.jsx` (new tab-based landing screen,
default post-login tab, RBAC-gated explore/admin panels either side of a
Create Rule CTA), `RulesBrowser.jsx` (card-list landing state for Rule
Summary), `SimpleThresholdEditor.jsx` (plain-language alternative to the
raw AND/OR JEXL tree, behind a Simple/Advanced toggle in Rule Builder), and
a template-picker flow (4 starter patterns + "start from a blank rule") as
Rule Builder's new default landing state. `test`/`test-simulation` do not
have this yet (see UI/UX design system state note above).

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
- No debug-identity switcher exists in this repo's own auth flow —
  `X-Debug-User-Id` was a pre-WSO2 concept. The frontend has no `demo`
  branch any more (deleted 2026-09-14, see Branches below) — don't assume
  a currently-diverged frontend `demo` exists; that's now backend-only
  (backend's `demo` branch still uses the header-shim flow against its own
  diverged schema, see `../CLAUDE.md`).

## Branches

**Verify with `git branch -a` before trusting this section** — this repo's
branch set changes often (four branches were deleted in one batch on
2026-09-14, and two new ones plus a fifth-then-deleted have appeared since).
As of 2026-09-15:

- `release` — stable/production branch. Has the full RBAC surface (merged
  2026-07-16, `70b2005`), the real WSO2/OIDC login flow (merged 2026-07-20,
  `e1e7674`), **and now the full Castle-inspired design system plus the
  entire `revamp` UI/UX redesign** (Home page, guided Rule Builder,
  template picker, Rules Browser, etc.), ported directly from `revamp`
  (`78529cb`) on 2026-09-15 at the user's explicit request — simulation
  code (`src/simulation/`, the `installSimulation()` hook in `main.jsx`)
  was stripped out before this landed here, since `release` runs against
  the real backend. This promotion deliberately skipped the usual
  `test` → `test-simulation` → `release` cycle — see the note in UI/UX
  design system above about `release` now being temporarily UI-ahead of
  `test`/`test-simulation`. Nothing merges into `release` without the user
  explicitly saying so; this was.
- `test` — the design/feature-integration branch, cut from `release`. Has
  the Castle-inspired design system ported in (2026-09-14, `8fc96b2`,
  reconciled against everything `release` gained since the old `test-castle`
  diverged — WSO2/RBAC, Admin Panel), but **not yet** the `revamp` UI/UX
  redesign work that `release` gained on 2026-09-15 (above) — that still
  needs porting down into `test` separately if/when the user wants
  `test`/`test-simulation` brought back in line with `release`.
- `test-simulation` — verification branch for seeing UI/UX work run against
  simulated live data on localhost before it goes to `release`. Standing
  dev cycle: **`test` → `test-simulation` → `release`** — build/refine on
  `test`, port to `test-simulation` to eyeball it against the simulation,
  then merge `test` into `release` once approved. See
  [[project_velocity_engine_test_simulation_branch]] (memory) for the
  simulation architecture itself.
- `revamp` — cut from `test` (`8fc96b2`), the **current, temporary
  exception** to the standard cycle: an end-to-end customer-friendliness
  UI/UX redesign is being built and iterated on directly here, with the
  `test-simulation` module cherry-picked in and retuned for fast live
  discussion, so the user can react to real running changes round-by-round
  without a separate port step each time. **Do not push `revamp` to
  `github`** — local commits only, per the user's explicit instruction;
  this is a deliberate, standing exception to the auto-sync rule for this
  branch specifically (see root `CLAUDE.md`'s autonomy section). **Update
  2026-09-15**: rather than the originally-planned `revamp`→`test`→
  `test-simulation`→`release` path, the user asked to port `revamp`'s
  state as of round 9 (`78529cb`) straight to `release` instead (see
  `release`'s bullet above) — `revamp` itself is unaffected by this (still
  local-only, still the active branch for further UI/UX iteration if more
  rounds follow). If work continues here, remember `release` now already
  has round 9; a future port only needs to carry whatever changes land on
  `revamp` *after* `78529cb`. Full round-by-round history of what's been
  built on `revamp` lives in `.claude/STATE.md` — read it before continuing
  this work in a new session rather than re-deriving it from diffs.

## Dev server

`npm run dev` (Vite, default port 3000, honors `PORT` env var if set —
`vite.config.js` was changed from a hardcoded `port: 3000` to
`process.env.PORT ? Number(process.env.PORT) : 3000` specifically so a
preview tool can run on an alternate port without a stray process on 3000
blocking it). Proxies `/api/*` to `http://localhost:8000` (the backend).

**The user typically runs their own `npm run dev` directly at
`localhost:3000`**, separate from whatever port a session's own preview
tooling uses (e.g. `3022` per `E:\Projects\.claude\launch.json`). Vite HMR
picks up file edits live on whichever process is actually running — a
session's own preview instance and the user's real tab both reflect the
same code, but they are not the same browser tab. When there's a "why
don't I see this change" moment, check `localhost:3000` (the user's real
tab) directly rather than assuming your own preview port is what they're
looking at.
