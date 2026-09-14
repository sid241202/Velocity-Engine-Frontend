/**
 * simulation/index.js — single entry point. Imported once, unconditionally,
 * from main.jsx on this branch only: this whole branch IS the simulation
 * environment, so there's no env flag to gate it behind. Order matters —
 * the session must be seeded before React (and therefore ProtectedRoute)
 * ever mounts.
 */
import { seedSimulatedSession } from './bootstrapAuth';
import { installFetchInterceptor } from './interceptFetch';
import { installMockWebSocket } from './mockWebSocket';

export function installSimulation() {
  seedSimulatedSession();
  installFetchInterceptor();
  installMockWebSocket();
  console.info('[simulation] Velocity Engine is running against simulated data — no backend required.');
}
