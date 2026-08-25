#!/bin/sh
# Runtime environment configuration for the Velocity Engine control-plane UI.
#
# Regenerates /usr/share/nginx/html/env-config.js from real container
# environment variables at container start, then execs nginx. This is what
# makes the image pick up config from the Gitea-managed ConfigMap/Secret
# (see resources/configmap-release.txt) instead of whatever is baked into
# the checked-in public/env-config.js (that file is a local-dev fallback
# only — see its own header comment).
#
# Keep this variable list in sync with getEnvVar() calls in
# src/config/appConfig.js.
set -eu

cat > /usr/share/nginx/html/env-config.js << EOF
window._env_ = {
  REACT_APP_WSO2_AUTHORITY: "${REACT_APP_WSO2_AUTHORITY:-https://sso.uidai.net.in/oauth2}",
  REACT_APP_CLIENT_ID: "${REACT_APP_CLIENT_ID:-}",
  REACT_APP_CLIENT_SECRET: "${REACT_APP_CLIENT_SECRET:-}",
  REACT_APP_REDIRECT_URI: "${REACT_APP_REDIRECT_URI:-}",
  REACT_APP_POST_LOGOUT_REDIRECT_URI: "${REACT_APP_POST_LOGOUT_REDIRECT_URI:-}",
  REACT_APP_SILENT_REDIRECT_URI: "${REACT_APP_SILENT_REDIRECT_URI:-}"
};
EOF

echo "Runtime environment configuration generated (client_secret omitted from this log on purpose):"
sed 's/REACT_APP_CLIENT_SECRET: ".*"/REACT_APP_CLIENT_SECRET: "***"/' /usr/share/nginx/html/env-config.js

exec /usr/sbin/nginx -g "daemon off;"
