FROM harbor-registry-non-prod.uidai.gov.in/base/node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm config set registry http://10.10.206.59:8080/repository/npm-proxy/
RUN npm ci
COPY . .
RUN npm run build

FROM harbor-registry-non-prod.uidai.gov.in/base/nginx:stable-alpine3.21-slim AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost/ || exit 1
CMD ["/usr/sbin/nginx", "-g", "daemon off;"]
