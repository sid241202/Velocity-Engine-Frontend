# Velocity Engine Control Plane — Frontend

## Overview
React (Vite) frontend for the Velocity Engine Control Plane. Provides a visual rule builder, live analysis dashboard, historical analysis, and aggregated analysis views.

## Tech Stack
- React 18, Vite 5
- Nginx (production serving + API proxy)
- Recharts (charting)

## Configuration
The frontend itself has no environment variables — all configuration is done via the **nginx.conf** which proxies API requests to the backend service.

### nginx.conf — Backend Service URL
Edit `nginx.conf` to point to your backend K8s service:
```nginx
location /api/ {
    proxy_pass http://velocity-backend-svc:8000/;  # ← Change this
}
location /api/ws/ {
    proxy_pass http://velocity-backend-svc:8000/ws/;  # ← Change this
}
```

The service name `velocity-backend-svc` must match the backend's K8s Service name in `velocity-namespace`.

## Build & Run

### Local Development
```bash
npm install
npm run dev
```
Frontend runs at `http://localhost:8501` with Vite proxy forwarding `/api/` to `http://localhost:8000`.

### Docker
```bash
docker build -t velocity-frontend:$(cat VERSION) .
docker run -p 80:80 velocity-frontend:$(cat VERSION)
```

## GitOps Deployment
1. Push code to Bitbucket/Gitea
2. Jenkins pipeline builds Docker image (multi-stage: Node build → Nginx serve) and pushes to Harbor
3. Jenkins updates `k8s/deployment.yaml` with new image tag
4. ArgoCD detects manifest change and syncs to K8s cluster
