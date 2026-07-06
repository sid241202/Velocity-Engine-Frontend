/**
 * istUtils.js — IST (Asia/Kolkata, UTC+05:30) utility functions.
 *
 * All user-facing date/time values in this application are in IST.
 * These helpers ensure that datetime-local inputs, display labels,
 * and API payloads are consistently in IST regardless of the
 * browser's local timezone setting.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+05:30 in milliseconds

/**
 * Converts a UTC epoch (ms) to an IST wall-clock Date object.
 * The returned Date has its internal value shifted so that
 * getFullYear/getMonth/getDate/getHours/getMinutes return IST values
 * when read as "local" (used only for formatting — not for arithmetic).
 */
function epochToISTWall(epochMs) {
  return new Date(epochMs + IST_OFFSET_MS);
}

/**
 * Pads a number to 2 digits.
 */
function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Returns an IST-based string suitable for a <input type="datetime-local"> value.
 * Format: "YYYY-MM-DDTHH:MM"
 *
 * @param {Date|number} dateOrEpoch — A JS Date or epoch milliseconds (UTC).
 * @returns {string} datetime-local value in IST.
 */
export function toISTDatetimeLocal(dateOrEpoch) {
  const epochMs = typeof dateOrEpoch === 'number' ? dateOrEpoch : dateOrEpoch.getTime();
  const wall = epochToISTWall(epochMs);
  const Y  = wall.getUTCFullYear();
  const Mo = pad(wall.getUTCMonth() + 1);
  const D  = pad(wall.getUTCDate());
  const H  = pad(wall.getUTCHours());
  const Mi = pad(wall.getUTCMinutes());
  return `${Y}-${Mo}-${D}T${H}:${Mi}`;
}

/**
 * Converts a datetime-local string (treated as IST wall time) to UTC epoch ms.
 * The string is in format "YYYY-MM-DDTHH:MM" or "YYYY-MM-DDTHH:MM:SS".
 *
 * @param {string} datetimeLocalStr — Value from <input type="datetime-local">.
 * @returns {number} UTC epoch milliseconds.
 */
export function istDatetimeLocalToEpochMs(datetimeLocalStr) {
  if (!datetimeLocalStr) return NaN;
  // Parse as ISO string with explicit IST offset (+05:30)
  const normalized = datetimeLocalStr.length === 16
    ? datetimeLocalStr + ':00'  // Add seconds if missing
    : datetimeLocalStr;
  return Date.parse(normalized + '+05:30');
}

/**
 * Converts a datetime-local string (treated as IST wall time) to a
 * backend-compatible naive datetime string: "YYYY-MM-DD HH:MM:SS"
 * This is the format expected by the Go backend's parseIST() function.
 *
 * @param {string} datetimeLocalStr — Value from <input type="datetime-local">.
 * @returns {string} Naive IST datetime string for backend API.
 */
export function istDatetimeLocalToBackendStr(datetimeLocalStr) {
  if (!datetimeLocalStr) return '';
  // Replace T with space and ensure seconds are present
  const withSpace = datetimeLocalStr.replace('T', ' ');
  return withSpace.length === 16 ? withSpace + ':00' : withSpace;
}

/**
 * Formats a timestamp (ISO string, space-separated, or epoch ms) as a
 * human-readable IST time string: "HH:MM" (for charts).
 *
 * @param {string|number|Date} ts
 * @returns {string}
 */
export function formatISTTime(ts) {
  if (!ts) return '';
  let epochMs;
  if (typeof ts === 'number') {
    epochMs = ts;
  } else if (ts instanceof Date) {
    epochMs = ts.getTime();
  } else {
    // Handle both "2026-06-29 10:30:00" (space) and "2026-06-29T10:30:00" (T) formats
    // and "2026-06-29T10:30:00+05:30" (with tz)
    const normalized = String(ts).replace(' ', 'T');
    const d = new Date(normalized.includes('+') || normalized.endsWith('Z')
      ? normalized
      : normalized + '+05:30'  // Treat naive strings as IST
    );
    if (isNaN(d.getTime())) return String(ts);
    epochMs = d.getTime();
  }
  const wall = epochToISTWall(epochMs);
  return `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`;
}

/**
 * Formats a timestamp as a full IST datetime: "DD MMM HH:MM" (for table cells).
 *
 * @param {string|number|Date} ts
 * @returns {string}
 */
export function formatISTDateTime(ts) {
  if (!ts) return '';
  let epochMs;
  if (typeof ts === 'number') {
    epochMs = ts;
  } else if (ts instanceof Date) {
    epochMs = ts.getTime();
  } else {
    const normalized = String(ts).replace(' ', 'T');
    const d = new Date(normalized.includes('+') || normalized.endsWith('Z')
      ? normalized
      : normalized + '+05:30'
    );
    if (isNaN(d.getTime())) return String(ts);
    epochMs = d.getTime();
  }

  try {
    return new Date(epochMs).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    const wall = epochToISTWall(epochMs);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${pad(wall.getUTCDate())} ${months[wall.getUTCMonth()]} ${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`;
  }
}

/**
 * Returns a min/max datetime-local value based on an IST epoch offset.
 * Use for min/max attributes on datetime-local inputs.
 */
export function toISTDatetimeLocalFromOffset(offsetMs) {
  return toISTDatetimeLocal(Date.now() + offsetMs);
}

/**
 * Parses a timestamp — naive "YYYY-MM-DD HH:MM:SS" (assumed IST, the
 * backend's convention), ISO string with an explicit offset/Z, or epoch ms —
 * into UTC epoch milliseconds. Shared so every panel resolves naive backend
 * timestamps the same way instead of re-deriving this logic locally.
 *
 * @param {string|number} ts
 * @returns {number} epoch ms, or NaN if unparseable.
 */
export function parseISTStringToEpochMs(ts) {
  if (!ts) return NaN;
  if (typeof ts === 'number') return ts;
  const raw = String(ts).replace(' ', 'T');
  const withZone = raw.includes('+') || raw.endsWith('Z') ? raw : raw + '+05:30';
  return Date.parse(withZone);
}

/**
 * Validates a datetime-local string (IST) range.
 * Returns an error string or '' if valid.
 *
 * @param {string} startStr
 * @param {string} endStr
 * @param {number} maxLookbackMs — maximum lookback window in ms (default 7 days)
 * @returns {string} error message or ''
 */
export function validateISTRange(startStr, endStr, maxLookbackMs = 7 * 24 * 60 * 60 * 1000) {
  const startEpoch = istDatetimeLocalToEpochMs(startStr);
  const endEpoch   = istDatetimeLocalToEpochMs(endStr);
  const nowEpoch   = Date.now();

  if (isNaN(startEpoch) || isNaN(endEpoch)) return 'Invalid date format.';
  if (startEpoch >= endEpoch) return 'Start must be before end.';
  if (startEpoch < nowEpoch - maxLookbackMs) return 'Start cannot be more than 7 days ago.';
  if (endEpoch > nowEpoch + 60000) return 'End cannot be in the future.'; // 1min grace
  return '';
}
