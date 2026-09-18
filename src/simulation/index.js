/**
 * simulation/index.js — single entry point. Imported once, unconditionally,
 * from main.jsx on this branch only: this whole branch IS the simulation
 * environment, so there's no env flag to gate it behind.
 *
 * Deliberately does NOT pre-seed an authenticated session (see
 * interceptAuth.js) — the app boots genuinely signed out, showing the real
 * Landing page. installAuthSimulation() only wraps login()/logout() so the
 * "Sign In with SSO" click plays out the real post-login transition instead
 * of attempting a real WSO2 redirect.
 */
import { installAuthSimulation } from './interceptAuth';
import { installFetchInterceptor } from './interceptFetch';
import { installMockWebSocket } from './mockWebSocket';

export function installSimulation() {
  installAuthSimulation();
  installFetchInterceptor();
  installMockWebSocket();
  console.info('[simulation] Velocity Engine is running against simulated data — no backend required.');
}
