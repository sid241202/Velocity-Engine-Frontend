/**
 * OIDC Authentication Configuration for WSO2 Identity Server 5.11
 * 
 * IMPORTANT: Replace the placeholder values with your actual WSO2 configuration
 */

// Support runtime environment variables from window._env_ (for Docker deployments)
const getEnvVar = (key, defaultValue) => {
  return (window._env_ && window._env_[key]) || import.meta.env[key] || defaultValue;
};

const authConfig = {
  // WSO2 Identity Server Authority (Base URL)
  authority: getEnvVar('REACT_APP_WSO2_AUTHORITY', 'https://sso.uidai.net.in/oauth2'),
  
  client_id: getEnvVar('REACT_APP_CLIENT_ID', '9HGuTetQjRjxkx1vHmoP1v0fXm8a'),
  
  client_secret: getEnvVar('REACT_APP_CLIENT_SECRET', 'RlsK9p2f4kJ_iKBZLSgiBYuIKjQa'),
  
  redirect_uri: getEnvVar('REACT_APP_REDIRECT_URI', 'http://localhost:3000/callback'),
  
  post_logout_redirect_uri: getEnvVar('REACT_APP_POST_LOGOUT_REDIRECT_URI', 'http://localhost:3000/'),
  // Response type - using authorization code flow
  response_type: 'code',

  scope: 'openid profile email',
  
  automaticSilentRenew: false,
  

  silent_redirect_uri: getEnvVar('REACT_APP_SILENT_REDIRECT_URI', 'https://ilabel.uidai.net.in/silent-renew'),
  
  // Explicit metadata for WSO2 IS
  metadata: {
    issuer: 'https://sso.uidai.net.in/oauth2',
    authorization_endpoint: 'https://sso.uidai.net.in/oauth2/authorize',
    token_endpoint: 'https://sso.uidai.net.in/oauth2/token',
    userinfo_endpoint: 'https://sso.uidai.net.in/oauth2/userinfo',
    end_session_endpoint: 'https://sso.uidai.net.in/oidc/logout',
    jwks_uri: 'https://sso.uidai.net.in/oauth2/jwks',
  },
  
  // PKCE support - S256 is required by WSO2 when PKCE is mandatory (RFC 7636)
  code_challenge_method: 'S256',
  
  // Load user info after authentication
  loadUserInfo: true,
  
  // Filter OIDC protocol claims
  filterProtocolClaims: true,
  
  // Include ID token in silent renew
  includeIdTokenInSilentRenew: false,
};

export default authConfig;
