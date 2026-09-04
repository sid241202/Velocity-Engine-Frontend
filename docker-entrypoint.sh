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

# default.conf's `include /etc/nginx/conf.d/resolver.generated.conf;` needs
# this cluster's DNS server IP so nginx can re-resolve velocity-backend-svc
# per request instead of caching one lookup for the life of the worker
# process (see the comment on that `include` in nginx.conf for why that
# caching is what causes permanent 502s on a startup-order race). Kubelet
# always populates every pod's own /etc/resolv.conf with its cluster's real
# CoreDNS Service IP — reading it here means this works unchanged across
# environments/clusters without hardcoding an IP that could differ per
# deployment.
#
# Written to its own file rather than sed'd into default.conf itself
# because in the deployed cluster default.conf is a ConfigMap volume
# mounted with `subPath`, which Kubernetes always presents read-only —
# this path isn't covered by that mount, so it stays writable.
DNS_RESOLVER="$(sed -n 's/^nameserver[[:space:]]\+\([0-9a-fA-F:.]\+\).*/\1/p' /etc/resolv.conf 2>/dev/null | head -n1 || true)"
if [ -z "$DNS_RESOLVER" ]; then
  echo "FATAL: could not read a nameserver from /etc/resolv.conf — cannot configure nginx's resolver for backend service discovery." >&2
  exit 1
fi
echo "Using DNS resolver ${DNS_RESOLVER} (from /etc/resolv.conf) for nginx's backend service resolution."
cat > /etc/nginx/conf.d/resolver.generated.conf << EOF
resolver ${DNS_RESOLVER} valid=10s ipv6=off;
EOF

exec /usr/sbin/nginx -g "daemon off;"
