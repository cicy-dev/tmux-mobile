# Fullstack TypeScript + Vite + Docker

Full-stack boilerplate with separate dev/prod Docker Compose configs.

## Quick Start

### Development (Hot Reload)
```bash
docker compose -f docker-compose.dev.yml up --build
```
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- API proxy: Vite forwards `/api/*` to backend

### Production (Optimized & Secure)
```bash
docker compose -f docker-compose.prod.yml up --build -d
```
- Frontend: http://localhost (Nginx)
- Backend: http://localhost:3000

## Architecture

| Feature | Development | Production |
|---------|-------------|------------|
| Backend | `tsx watch` live reload | Pre-compiled JS, `node:20-alpine` |
| Frontend | Vite dev server | Nginx serving static files |
| Mount | Bind mount source code | Immutable images only |
| Security | Root in container | Non-root user, read-only fs |

## Project Structure
```
.
├── backend/
│   ├── src/index.ts      # Raw HTTP server
│   ├── Dockerfile        # Multi-stage build
│   └── Dockerfile.dev    # Dev with tsx
├── frontend/
│   ├── src/main.ts       # Vite app
│   ├── Dockerfile        # Build + Nginx
│   └── Dockerfile.dev    # Dev server
├── docker-compose.dev.yml
└── docker-compose.prod.yml
```
