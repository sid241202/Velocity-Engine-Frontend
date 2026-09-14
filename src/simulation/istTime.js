/**
 * istTime.js — formats a JS epoch as the naive IST "YYYY-MM-DD HH:MM:SS"
 * string the real backend sends (see istUtils.js on the consuming side).
 * Kept separate from istUtils.js on purpose: this is what a backend row
 * would contain, not a UI-facing formatter.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function toISTBackendString(epochMs) {
  const ist = new Date(epochMs + IST_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())} ${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}:${pad(ist.getUTCSeconds())}`;
}

/** Parses "YYYY-MM-DD HH:MM:SS" (assumed IST) or an ISO string back to epoch ms. */
export function parseBackendOrIsoToEpochMs(s) {
  if (!s) return NaN;
  const raw = String(s).replace(' ', 'T');
  const withOffset = raw.includes('+') || raw.endsWith('Z') ? raw : `${raw}+05:30`;
  return new Date(withOffset).getTime();
}
