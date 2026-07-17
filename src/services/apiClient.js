import authService from './AuthService';

/**
 * getAuthHeaders — the single place that decides how outgoing requests
 * identify themselves to the backend: Authorization: Bearer <access_token>.
 * Deliberately the access token, not the ID token — see the demo-wso2 plan's
 * frontend research (operator-360-ui's apiConfig.js uses the ID token,
 * which is a real deviation from normal OIDC practice; not repeated here).
 */
export async function getAuthHeaders() {
  const token = await authService.getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
