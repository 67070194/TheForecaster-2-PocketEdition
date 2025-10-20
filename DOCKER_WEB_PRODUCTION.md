# Docker Web Production Build

This document explains the production web configuration for Docker deployment.

## Changes Made

### 1. **Production Build System**

The web service now uses a **multi-stage Docker build** with production optimization:

- **Stage 1 (Builder)**: Compiles React app with Vite
- **Stage 2 (Runtime)**: Serves static files with nginx

**Benefits**:
- ✅ Smaller final image (~50MB vs ~500MB dev)
- ✅ Faster startup time
- ✅ Better security (no Node.js runtime in production)
- ✅ Built-in gzip compression
- ✅ Optimized caching headers
- ✅ Nginx proxies API requests to backend

### 2. **New Files**

#### `website/Dockerfile`
Multi-stage build configuration:
- Installs dependencies with `npm ci`
- Builds production bundle with `npm run build`
- Copies built files to nginx image
- Supports build-time API endpoint configuration

#### `website/nginx.conf`
Nginx configuration with:
- **SPA routing**: `try_files` fallback to `index.html`
- **API proxying**: `/api/*`, `/health`, `/fw/*` → `http://server:3001`
- **Gzip compression**: For all text-based assets
- **Cache headers**: 1-year cache for static assets
- **Security headers**: X-Frame-Options, X-Content-Type-Options, etc.
- **Large file uploads**: 10MB max body size for firmware

#### `website/.dockerignore`
Excludes unnecessary files from Docker build:
- `node_modules/` (reinstalled in container)
- `dist/` (generated during build)
- IDE configs, logs, etc.

### 3. **Updated Files**

#### `docker-compose.yml`
Changed from:
```yaml
web:
  image: node:20-alpine
  command: sh -c "npm ci && npm run dev"
  ports:
    - "8080:8080"
```

To:
```yaml
web:
  build:
    context: ./website
    dockerfile: Dockerfile
    args:
      - VITE_API_BASE=${VITE_API_BASE:-}
      - VITE_FW_BASE=${VITE_FW_BASE:-}
  ports:
    - "8080:80"
```

**Key changes**:
- Uses custom Dockerfile instead of dev server
- Port 80 inside container (nginx standard)
- Port 8080 on host (mapped to 80)
- Passes optional build args for API endpoints

#### `.env.example`
Added optional variables:
```env
VITE_API_BASE=
VITE_FW_BASE=
```

These are **optional** for Docker stack (nginx proxies internally). Only needed for external deployments (GitHub Pages).

---

## Usage

### First Time Setup

```bash
# Copy .env.example (if not done already)
copy .env.example .env

# Build and start all services
docker compose up -d --build
```

The `--build` flag forces rebuild of the web image.

### Subsequent Starts

```bash
# Start without rebuilding
docker compose up -d
```

### Rebuild Only Web Service

```bash
# Rebuild web service only
docker compose up -d --build web
```

### Force Complete Rebuild

```bash
# Stop and remove everything
docker compose down

# Rebuild from scratch (no cache)
docker compose build --no-cache web

# Start services
docker compose up -d
```

---

## Architecture

```
┌─────────────────────────────────────────┐
│         Browser (http://localhost:8080) │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  Docker: web (nginx:alpine)             │
│  Port 80 → Host 8080                    │
│                                         │
│  Static Files: /usr/share/nginx/html/   │
│  - index.html                           │
│  - assets/index-*.js                    │
│  - assets/index-*.css                   │
│                                         │
│  Routes:                                │
│  ┌─────────────────────────────────┐   │
│  │ /                → index.html    │   │
│  │ /dashboard       → index.html    │   │
│  │ /tester          → index.html    │   │
│  │ /api/*           → server:3001   │◄──┼──┐
│  │ /health          → server:3001   │   │  │
│  │ /fw/*            → server:3001   │   │  │
│  └─────────────────────────────────┘   │  │
└─────────────────────────────────────────┘  │
                                             │
┌────────────────────────────────────────────┼──┐
│  Docker: server (Node.js)                  │  │
│  Port 3001                                 │  │
│                                            │  │
│  - REST API                                │◄─┘
│  - MQTT Client                             │
│  - Firmware Upload                         │
└────────────────┬───────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  Docker: db (TimescaleDB)               │
│  Port 5432 (internal only)              │
└─────────────────────────────────────────┘
```

---

## Comparison: Dev vs Production

| Feature | Dev Mode (Old) | Production (New) |
|---------|---------------|------------------|
| **Docker Image** | node:20-alpine | nginx:alpine |
| **Image Size** | ~500 MB | ~50 MB |
| **Build Time** | No build (mounts code) | ~2-3 minutes |
| **Startup Time** | ~30 seconds | ~2 seconds |
| **Hot Reload** | ✅ Yes (HMR) | ❌ No |
| **Asset Optimization** | ❌ No | ✅ Yes (minified, gzipped) |
| **Cache Headers** | ❌ No | ✅ Yes |
| **Security Headers** | ❌ No | ✅ Yes |
| **API Proxy** | Vite proxy | Nginx proxy |
| **Use Case** | Development | Production/Testing |

---

## Development Workflow

For active development with hot reload, you have two options:

### Option 1: Run Web Separately
```bash
# Start only backend services
docker compose up -d db server backup

# Run web dev server locally
cd website
npm install
npm run dev
# Opens on http://localhost:8080 with HMR
```

### Option 2: Override docker-compose
Create `docker-compose.dev.yml`:
```yaml
services:
  web:
    image: node:20-alpine
    command: sh -c "npm ci && npm run dev"
    volumes:
      - ./website:/app
    environment:
      - HOST=0.0.0.0
    ports:
      - "8080:8080"
```

Use with:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

---

## Troubleshooting

### Web container fails to start

**Check logs**:
```bash
docker compose logs web
```

**Common issues**:
1. **Build failed**: Run `docker compose build --no-cache web`
2. **Port 8080 in use**: Change in `docker-compose.yml` to `"8081:80"`
3. **Nginx config error**: Check `website/nginx.conf` syntax

### API requests fail (404/502)

**Check nginx is proxying correctly**:
```bash
# Enter web container
docker compose exec web sh

# Test proxy
wget -qO- http://server:3001/health
```

**If fails**: Server isn't running or DNS resolution issue
**If succeeds**: Check nginx config or browser network tab

### Build takes too long

**Use build cache**:
```bash
# Normal build (uses cache)
docker compose build web
```

**Clear old images**:
```bash
# Remove dangling images
docker image prune

# Remove all unused images
docker image prune -a
```

### Changes not reflected

**Rebuild is required** after:
- Modifying `website/src/**` files
- Changing `website/nginx.conf`
- Updating `website/package.json`

```bash
docker compose up -d --build web
```

---

## Performance

### Build Performance
- First build: ~2-3 minutes
- Subsequent builds: ~30-60 seconds (with cache)
- No-cache build: ~3-4 minutes

### Runtime Performance
- Startup: ~2 seconds
- Memory: ~10-15 MB
- Cold page load: ~200-300ms
- Cached page load: ~50-100ms

### Asset Sizes (Production Build)
- `index.html`: ~2 KB
- `index-*.js`: ~500-800 KB (gzipped: ~150-200 KB)
- `index-*.css`: ~50-100 KB (gzipped: ~10-20 KB)
- Total bundle: ~550-900 KB (gzipped: ~160-220 KB)

---

## Security Considerations

### Nginx Security Headers
```nginx
X-Frame-Options: SAMEORIGIN          # Prevent clickjacking
X-Content-Type-Options: nosniff      # Prevent MIME sniffing
X-XSS-Protection: 1; mode=block      # Enable XSS filter
```

### Additional Recommendations

1. **HTTPS**: Use reverse proxy (Caddy/Traefik) for production HTTPS
2. **Rate Limiting**: Add nginx rate limiting for API endpoints
3. **CORS**: Server already has CORS configured
4. **File Upload**: 10MB limit in nginx (adjust if needed)

---

## Next Steps

### For Production Deployment
1. Add HTTPS reverse proxy (Caddy/nginx/Traefik)
2. Configure domain name
3. Set up monitoring (Prometheus/Grafana)
4. Enable nginx access logs for analytics
5. Add fail2ban for API rate limiting

### For Development
1. Create `docker-compose.dev.yml` for HMR
2. Set up debugger for Node.js server
3. Configure VS Code Docker extension

---

## References

- [Nginx Official Docs](https://nginx.org/en/docs/)
- [Vite Production Build](https://vitejs.dev/guide/build.html)
- [Docker Multi-stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [React Production Deployment](https://react.dev/learn/start-a-new-react-project#deploying-to-production)
