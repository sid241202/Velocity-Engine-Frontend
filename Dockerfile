FROM harbor-registry-non-prod.uidai.gov.in/base/node:24-alpine AS build
WORKDIR /app

RUN npm config set registry http://10.10.206.59:8080/repository/npm-proxy/

COPY package.json package-lock.json ./
RUN npm ci --include=dev

RUN npm install -g @cyclonedx/cyclonedx-npm@1.15.0
COPY . .

# Add this line to fix the "Permission denied" error
RUN chmod -R +x ./node_modules/.bin

RUN node -e "console.log('NODE_ENV=', process.env.NODE_ENV)"

# Generate CycloneDX SBOM
RUN cyclonedx-npm --spec-version 1.6 --ignore-npm-errors --output-file /app/SCA-bom.json
RUN npm run build

#FROM harbor-registry-non-prod.uidai.gov.in/base/nginx:stable-alpine3.21-slim AS runtime
FROM mndc-harbor-registry-non-prod.uidai.net.in/base/nginx:ubuntu22.04_stable_20260623 As runtime

RUN rm -rf /usr/share/nginx/html/* \
    && rm -f /etc/nginx/conf.d/default.conf

# Removed for auth related issue
# COPY nginx.conf /etc/nginx/templates/default.conf.template

# Newly Added for auth related issues
# COPY nginx.conf /etc/nginx/conf.d/default.conf

# Newly added: replace the base image's master nginx.conf and supply our
# own default.conf server block so we control everything nginx loads
# RUN rm -rf /etc/nginx/nginx.conf
# COPY nginx.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /app/SCA-bom.json /tmp/SCA-bom.json
# Generates /usr/share/nginx/html/env-config.js at container start from the
# VITE_* env vars defined in deployment.yaml. The CMD below invokes this
# script directly, so it must be executable (chmod +x below). Keep this
# script's var list in sync with env.ts's RuntimeConfig and authConfig.js.
# COPY docker-entrypoint.d/40-env-config.sh /docker-entrypoint.d/40-env-config.sh
# RUN chmod +x /docker-entrypoint.d/40-env-config.sh

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost/ || exit 1
CMD ["/usr/sbin/nginx", "-g", "daemon off;"]