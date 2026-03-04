# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**tmux-app** is a browser-based terminal management interface that proxies tmux panes via ttyd (WebSocket terminal) with React frontends and token-based authentication. There are two nearly identical frontend apps (`frontend/` and `ide/`) that differ primarily in mode and minor initialization logic.

## Build & Run Commands

### Docker (primary development method)
```bash
docker compose up --build          # Start both apps with hot reload
docker compose down                # Stop
docker compose logs -f frontend    # View frontend logs
docker compose logs -f ide         # View ide logs
```

### Frontend (local, without Docker)
```bash
cd frontend && npm run dev         # Vite dev server on 0.0.0.0:6902
cd frontend && npm run build       # Type-check (tsc) + Vite build
```

### IDE app
Same commands as frontend but in `ide/` directory. Docker maps ide to port 6903 externally.

### Testing
```bash
# Single test
bash tests/curl/test_health.sh
bash tests/e2e/test_login.sh

# All curl API tests
for f in tests/curl/test_*.sh; do bash "$f"; done

# All E2E browser tests (requires electron-mcp running)
for f in tests/e2e/test_*.sh; do bash "$f"; done

# Full test suite (pre-commit)
bash run_tests.sh
```

Tests use bash scripts with curl (API tests against server port 6901) and curl-rpc + electron-mcp (E2E browser tests). No jest/vitest — all tests are shell scripts with PASS/FAIL counters.

**Token for tests** (never hardcode):
```bash
TOKEN=$(python3 -c "import json; print(json.load(open('/home/w3c_offical/global.json'))['api_token'])")
```

## Architecture

### Service Topology
```
Frontend (React, port 6902)  ──→  FastAPI Backend (Python, port 14444)
IDE (React, port 6903)       ──→  FastAPI Backend
                                     │
Frontend/IDE ──→ ttyd-proxy (Node.js, port 6901) ──→ ttyd processes ──→ tmux
```

- **FastAPI** (external, port 14444): All business APIs — tmux, ttyd, groups, auth, agents, MySQL persistence
- **ttyd-proxy server** (external, Node.js, port 6901): HTTP + WebSocket proxy for ttyd, pane cache, token translation
- **frontend** and **ide**: Pure client-side React apps, no server-side rendering

### External API Endpoints (hardcoded in `services/apiUrl.ts`)
| Constant | URL | Purpose |
|----------|-----|---------|
| `API_BASE` | `https://g-fast-api.cicy.de5.net` | FastAPI backend |
| `TTYD_BASE` | `https://ttyd-proxy.cicy.de5.net` | ttyd WebSocket proxy |
| `TTYD_WEB_BASE` | `https://ttyd-dev.cicy.de5.net` | Alternative ttyd web access |

### Authentication Flow
1. Token checked from `localStorage.getItem('token')`
2. No token → `LoginForm` shown
3. Login verifies via `GET /api/auth/verify` with `Authorization: Bearer {token}`
4. All API calls carry this Bearer token header

### Key Frontend Entry Points
- `main.tsx` → `Router.tsx` → `SinglePaneApp.tsx` (main app component, ~700-900 lines)
- `services/apiUrl.ts`: All API URL constants, path builders, `getApiUrl()`, `apiFetch()`
- `services/mockApi.ts`: `sendCommandToTmux()`, `sendShortcut()` wrappers
- `types.ts`: `AppSettings`, `Position`, `Size` interfaces

### SinglePaneApp Tabs
Code (code server iframe), Services (Electron/MySQL/Monitor/VNC), Docs, Preview, Agents (agent binding/management), Settings

## Code Conventions

### Naming
| Type | Convention | Example |
|------|-----------|---------|
| Files | kebab-case | `command-panel.tsx` |
| Components | PascalCase | `CommandPanel` |
| Interfaces/Types | PascalCase | `AppSettings` |
| Functions/Variables | camelCase | `handleLogin` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_SETTINGS` |

### Import Order
1. React core → 2. External libraries → 3. Local components → 4. Local services/utils → 5. Types/constants

### Component Patterns
- Function components + Hooks only; `forwardRef` for ref forwarding
- Props defined as TypeScript interfaces
- Components in `.tsx`, types in `.ts`
- Tailwind CSS only (no inline styles)
- TypeScript strict mode: `noUnusedLocals`, `noUnusedParameters` enabled

## TDD Workflow (Mandatory)

```
RED → GREEN → REFACTOR → TEST PASS → COMMIT
```

- Server changes → write curl test in `tests/curl/test_<feature>.sh` first
- Frontend changes → write E2E test in `tests/e2e/test_<feature>.sh` first
- Run `bash run_tests.sh` before committing

## Prohibited Actions

- Do NOT commit without running tests
- Do NOT skip pre-commit hook (`--no-verify`)
- Do NOT hardcode tokens in test scripts (read from `global.json`)
- Do NOT add business API logic to the Node.js server — all business logic goes to FastAPI
- Do NOT add npm packages without rebuilding Docker containers (`docker compose up --build`)

## Commit Message Convention

Prefixes: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`
