import authService from './AuthService';

/**
 * getAuthHeaders — the single place that decides how outgoing requests
 * identify themselves to the backend. Sends two things:
 *
 *  - Authorization: Bearer <access_token> — kept for forward-compatibility
 *    with the backend's previous JWKS-based verification, but the backend
 *    does not currently validate it at all (see below).
 *  - X-User-Subject: <sub> — the WSO2 "sub" claim AuthService decoded
 *    client-side from the id_token in handleCallback() (base64-decoded, the
 *    signature is never checked). This is what the backend actually trusts
 *    as the caller's identity right now.
 *
 * KNOWN, DELIBERATE, TEMPORARY SECURITY GAP: this mirrors
 * fraud-investigation-system's (Prahari) X-User-Adid model — see that
 * repo's auth/README.md — adopted here because the backend could not reach
 * WSO2's JWKS endpoint (https://sso.uidai.net.in/oauth2/jwks) from its pod
 * network in this UIDAI prod cluster (TLS handshake timeout, then EOF — a
 * network-path problem, not a code/credentials bug). There is no
 * cryptographic proof the caller actually completed WSO2 login; RBAC
 * (internal/middleware.RequirePermission on the backend) is the only real
 * access-control boundary once past this. Revisit once JWKS reachability is
 * fixed — the previous verify-the-signature implementation is recoverable
 * from git history (see internal/services/jwtvalidator.go's deletion in
 * velocity-engine-control-plane-backend-go).
 */
export async function getAuthHeaders() {
  const token = await authService.getAccessToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  try {
    const profile = JSON.parse(sessionStorage.getItem('user_profile') || '{}');
    if (profile.sub) {
      headers['X-User-Subject'] = profile.sub;
    }
  } catch {
    // No usable profile — request goes out with no identity header, which
    // the backend rejects as 401, same as a missing token today.
  }

  return headers;
}
