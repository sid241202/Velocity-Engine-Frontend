/**
 * interceptAuth.js — simulates the WSO2 OAuth round-trip client-side so the
 * real, unmodified Landing -> AuthService.login() -> /callback ->
 * AuthService.handleCallback() -> AuthContext/ProtectedRoute flow (the exact
 * flow release runs, including the single-transition SessionLoading fix)
 * plays out with no WSO2 server reachable and without ever leaving this tab.
 *
 * AuthService.login()'s real body does `window.location.href = <WSO2
 * authorization_endpoint>` — an external, cross-origin redirect this
 * simulation can't (and must never try to) satisfy for real. login() is
 * wrapped here (not rewritten in AuthService.js — that file stays byte-for-
 * byte the same as release) to replicate its real state/return-url
 * bookkeeping exactly, then navigate straight to this app's own /callback
 * with a fake authorization code instead of a real external hop.
 * handleCallback() itself is untouched: its POST to the token endpoint is
 * caught by the fetch interceptor (see interceptFetch.js, which calls
 * handleSimulatedTokenExchange below) and answered with a realistic token
 * response — including a real base64url-encoded fake-signed ID token — so
 * handleCallback()'s own JWT-decode logic runs completely unmodified too.
 *
 * Deliberately NOT pre-seeding a session at boot (unlike this branch's
 * earlier iteration): the whole point of this pass is to show the *actual*
 * landing page and the actual "Sign In with SSO" click triggering the real
 * post-login transition, not skip straight past it.
 */
import authService from '../services/AuthService';
import { authConfig } from '../config/appConfig';

const SIM_PROFILE = {
  sub: 'sim-super-admin',
  preferred_username: 'admin@uidai.net.in',
  email: 'admin@uidai.net.in',
  name: 'Simulation Admin',
};

const SIMULATED_CODE = 'simulated-authorization-code';

// Mirrors AuthService.handleCallback()'s own decode direction exactly
// (base64Url -> '+'/'/' -> atob) — padding kept (not stripped) so atob()
// never has to guess at it.
function base64url(obj) {
  const json = JSON.stringify(obj);
  const b64 = window.btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_');
}

function makeFakeIdToken(expiresAt) {
  const header = base64url({ alg: 'none', typ: 'JWT' });
  const payload = base64url({ ...SIM_PROFILE, iat: Math.floor(Date.now() / 1000), exp: expiresAt });
  return `${header}.${payload}.simulated-signature`;
}

/** Called from interceptFetch's router when a POST hits authConfig.metadata.token_endpoint. */
export function handleSimulatedTokenExchange(init) {
  let body = {};
  try { body = Object.fromEntries(new URLSearchParams(init?.body || '')); } catch { /* ignore */ }

  if (body.code !== SIMULATED_CODE) {
    return { status: 400, body: { error: 'invalid_grant', error_description: 'Unknown simulated authorization code.' } };
  }

  const expiresIn = 3600;
  const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
  return {
    status: 200,
    body: {
      access_token: 'simulation-access-token',
      token_type: 'Bearer',
      expires_in: expiresIn,
      id_token: makeFakeIdToken(expiresAt),
      refresh_token: null,
      scope: authConfig.scope,
    },
  };
}

export function isTokenEndpoint(url) {
  return url === authConfig.metadata.token_endpoint;
}

/** Wraps authService.login()/logout() to stay entirely in-tab. */
export function installAuthSimulation() {
  authService.login = async function simulatedLogin() {
    const returnUrl = window.location.pathname;
    sessionStorage.setItem('redirectPath', returnUrl);

    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    const state = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');

    sessionStorage.setItem('oauth_state', state);
    sessionStorage.setItem('oauth_return_url', returnUrl);
    localStorage.setItem('oauth_state', state);
    localStorage.setItem('oauth_return_url', returnUrl);

    console.info('[simulation] Skipping the real WSO2 redirect — simulating the IdP round-trip in-tab.');

    // A believable beat before "returning" from the IdP — short enough not
    // to read as a hang, long enough that the SSO click doesn't feel instant/fake.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const callbackUrl = new URL('/callback', window.location.origin);
    callbackUrl.searchParams.set('code', SIMULATED_CODE);
    callbackUrl.searchParams.set('state', state);
    window.location.href = callbackUrl.toString();
  };

  authService.logout = async function simulatedLogout() {
    sessionStorage.clear();
    window.location.href = '/';
  };
}
