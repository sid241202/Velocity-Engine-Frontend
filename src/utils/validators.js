/**
 * Velocity Engine — Field Validators
 * All validation functions return true = valid, false = invalid.
 */

/** Rule ID: 3–64 chars, letters/numbers/dashes/underscores only */
export const isValidRuleId = (s) =>
  typeof s === 'string' && /^[a-zA-Z0-9_\-]{3,64}$/.test(s.trim());

/** Non-empty, non-whitespace string */
export const isNonEmpty = (s) =>
  typeof s === 'string' && s.trim().length > 0;

/** Valid JEXL variable name: starts with letter or _, followed by alphanumeric/_ */
export const isValidJexlAlias = (s) =>
  typeof s === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]{0,49}$/.test(s.trim());

/** Epoch milliseconds: 10–15 digit positive integer */
export const isValidEpochMs = (s) =>
  typeof s === 'string' && /^\d{10,15}$/.test(s.trim()) && Number(s.trim()) > 0;

/** ISO 8601 date string (accepts +05:30 IST offset or Z) */
export const isValidIsoDate = (s) => {
  if (!s || !s.trim()) return false;
  const d = new Date(s.trim());
  return !isNaN(d.getTime());
};

/** Positive integer */
export const isPositiveInt = (n) =>
  Number.isFinite(Number(n)) && Number(n) > 0 && Number.isInteger(Number(n));
