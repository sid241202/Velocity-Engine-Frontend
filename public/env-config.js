// Runtime environment configuration — see the frontend CLAUDE.md for why
// this file, not a build-time env var, is the channel that actually reaches
// the browser (Vite's default envPrefix is "VITE_", so REACT_APP_* build-time
// vars never reach import.meta.env in this app — window._env_, populated
// here, is checked first by getEnvVar() in src/config/appConfig.js).
//
// No REACT_APP_CLIENT_SECRET here (demo-wso2 is a pure PKCE public-client
// flow — see appConfig.js's authConfig — this key is not read at all). No
// REACT_APP_AUTH_MODE either — this branch has no dev/wso2 toggle at all
// (see src/pages/ProtectedRoute.jsx), so that key would do nothing.
window._env_ = window._env_ || {
  REACT_APP_WSO2_AUTHORITY: "https://sso.uidai.net.in/oauth2",
  REACT_APP_CLIENT_ID: "9HGuTetQjRjxkx1vHmoP1v0fXm8a",
  REACT_APP_REDIRECT_URI: "http://10.10.79.27:32515/callback",
  REACT_APP_POST_LOGOUT_REDIRECT_URI: "http://10.10.79.27:32515",
  REACT_APP_SILENT_REDIRECT_URI: "http://10.10.79.27:32515/silent-renew",
};
