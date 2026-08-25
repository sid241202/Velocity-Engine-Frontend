// Runtime environment configuration — see the frontend CLAUDE.md for why
// this file, not a build-time env var, is the channel that actually reaches
// the browser (Vite's default envPrefix is "VITE_", so REACT_APP_* build-time
// vars never reach import.meta.env in this app — window._env_, populated
// here, is checked first by getEnvVar() in src/config/appConfig.js).
//
// This checked-in copy is a LOCAL-DEV FALLBACK ONLY — deliberately no real
// client_id/client_secret/host values. In every deployed environment this
// file is overwritten at container start by docker-entrypoint.sh, which
// regenerates it from real container env vars sourced from the Gitea-managed
// ConfigMap/Secret (see resources/configmap-release.txt). Never hand-edit
// real credentials into this file — they'd ship inside the git history of a
// public-facing bundle.
//
// No REACT_APP_AUTH_MODE key — this branch has no dev/wso2 toggle at all
// (see src/pages/ProtectedRoute.jsx), so that key would do nothing.
window._env_ = window._env_ || {
  REACT_APP_WSO2_AUTHORITY: "https://sso.uidai.net.in/oauth2",
  REACT_APP_CLIENT_ID: "",
  REACT_APP_CLIENT_SECRET: "",
  REACT_APP_REDIRECT_URI: "http://localhost:3000/callback",
  REACT_APP_POST_LOGOUT_REDIRECT_URI: "http://localhost:3000",
  REACT_APP_SILENT_REDIRECT_URI: "http://localhost:3000/silent-renew",
};
