import {
  AUTH_MODE,
  AUTH_DEBUG_HEADER_NAME,
  AUTH_DEBUG_USER_ID_STORAGE_KEY,
  AUTH_DEBUG_DEFAULT_USER_ID,
} from '../config/appConfig';
import authService from './AuthService';

/**
 * getAuthHeaders — the single place that decides how outgoing requests
 * identify themselves to the backend, mirroring internal/middleware/auth.go's
 * AuthMode branch:
 *   - "wso2": Authorization: Bearer <access_token>. Deliberately the access
 *     token, not the ID token — see the demo-wso2 plan's frontend research
 *     (operator-360-ui's apiConfig.js uses the ID token, which is a real
 *     deviation from normal OIDC practice; not repeated here.
 *   - "dev": the X-Debug-User-Id header (read directly from localStorage —
 *     the same key RBACContext's debugUserId writes to — so this stays
 *     usable from plain fetch call sites that aren't React components).
 */
export async function getAuthHeaders() {
  if (AUTH_MODE === 'wso2') {
    const token = await authService.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  const debugUserId =
    (typeof window !== 'undefined' && window.localStorage.getItem(AUTH_DEBUG_USER_ID_STORAGE_KEY)) ||
    AUTH_DEBUG_DEFAULT_USER_ID;
  return { [AUTH_DEBUG_HEADER_NAME]: debugUserId };
}
