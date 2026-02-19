# ttyd-proxy-v1 架构文档

## 1. 项目定位

ttyd-proxy-v1 是一个基于浏览器的多终端管理界面，提供：
- 在浏览器中通过 WebSocket 连接 tmux pane（由 ttyd 驱动）
- 统一的 Token 认证代理层
- React 前端：创建/重启/删除/捕获 pane，多标签终端视图

## 2. 服务组成

```
┌─────────────────────────────────────────────────────────┐
│                   外部访问（Cloudflare Tunnel）          │
│                                                         │
│  g-ttyd.cicy.de5.net  →  localhost:16901 (Frontend)    │
│  g-ttyd-api.cicy.de5.net → localhost:6901 (Server)     │
└─────────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
┌─────────────────┐      ┌──────────────────────┐
│   Frontend      │      │   Server (Proxy)     │
│  React + Vite   │      │  Node.js / TypeScript│
│  port: 16901    │      │  port: 6901          │
│  HMR dev server │      │  tsx watch           │
└─────────────────┘      └──────────────────────┘
         │                          │
         │   API calls              │  ttyd WebSocket proxy
         ▼                          ▼
┌──────────────────────────────────────────────┐
│              fast-api                        │
│          Python / FastAPI                    │
│          port: 14444                         │
│  g-fast-api.cicy.de5.net                     │
└──────────────────────────────────────────────┘
                   │
                   │  tmux socket (~/.tmux/default)
                   ▼
┌──────────────────────────────────────────────┐
│          Host: tmux + ttyd 进程              │
│  ttyd -W -p 151xx -c user:{token}            │
│  tmux attach -t session:window.pane          │
└──────────────────────────────────────────────┘
```

## 3. 子服务详解

### 3.1 Frontend（port 16901）

- **技术栈**：React 19 + TypeScript + Vite + Tailwind CSS
- **入口**：`frontend/src/main.tsx` → `Router.tsx`
- **主要页面**：
  - `/` → `App.tsx`：传统单终端视图（含语音输入、英文纠错等功能）
  - `/web-terminal` → `WebTerminalApp.tsx`：多 pane 终端管理主界面

**WebTerminalApp 功能：**
- 列出所有活跃 pane（从 `GET /api/tmux/tree` 获取）
- 创建新 pane（`POST /api/tmux/create`）：指定 session、window、workspace、init_script、proxy
- 重启 pane（`POST /api/tmux/panes/{id}/restart`）：重建 tmux window + 重启 ttyd
- 删除 pane（`DELETE /api/tmux/panes/{id}`）：销毁 tmux window + 终止 ttyd
- 捕获 pane 输出（`POST /api/tmux/capture_pane`）：查看终端历史
- 编辑 pane 元数据（`PATCH /api/tmux/panes/{id}`）：修改 title/workspace/proxy 等
- 嵌入 iframe：通过 Server 代理访问对应 ttyd

**URL 路由逻辑（`services/apiUrl.ts`）：**
```
/ttyd/*      → VITE_TTYD_URL (g-ttyd-api.cicy.de5.net)   # Server 代理
其他 /api/*  → VITE_API_URL  (g-fast-api.cicy.de5.net)   # fast-api
```

**认证**：所有 API 请求携带 `Authorization: Bearer {token}`，token 存储于 localStorage。

### 3.2 Server（port 6901）

- **技术栈**：Node.js + TypeScript（ESM）+ http-proxy
- **入口**：`server/src/index.ts`
- **核心职责**：ttyd WebSocket/HTTP 代理

**请求处理流程（`/ttyd/{pane_id}/`）：**
```
1. 解析 pane_id（URL path segment）
2. 提取 queryToken（?token=...）
3. 调用 fast-api GET /api/ttyd/by-name/{pane_id} 获取 port + ttyd_token
4. 验证 token：queryToken 必须等于 master token 或 pane 的 ttyd_token
5. 重写 Authorization 为 Basic user:{ttyd_token}
6. HTTP proxy.web → http://127.0.0.1:{port}
   WebSocket proxy.ws → http://127.0.0.1:{port}
```

**Token 验证规则：**
- master token（来自 `~/personal/global.json`）= 任意 pane 均可访问
- pane ttyd_token（来自 DB）= 仅访问对应 pane

**保留的路由：**
- `GET /api/health` — 健康检查（返回版本号）
- `/ttyd/*` — ttyd HTTP + WebSocket 代理（核心功能）
- 其他所有非 `/api/` + 非 `/ttyd/` 路径 → 静态文件（生产构建时）

> **注意**：原来 `/api/bots`、`/api/tmux`、`/api/tmux-list`、`/api/correctEnglish` 已全部迁移至 fast-api。

### 3.3 Token 体系

| Token 类型 | 来源 | 用途 |
|-----------|------|------|
| Master Auth Token | `~/global.json` / `~/personal/global.json` | API 认证（Bearer）+ ttyd 代理访问任意 pane |
| pane ttyd_token | `secrets.token_urlsafe(32)`，存入 DB | ttyd 进程 `-c user:{token}` 认证，每次 create/restart 重新生成 |

## 4. 数据流

### 4.1 创建 pane

```
Frontend POST /api/tmux/create
    → fast-api 分配端口（ttyd_config 表查找空闲端口）
    → fast-api 生成 ttyd_token
    → fast-api 写入 DB（ttyd_config）
    → fast-api tmux new-window
    → fast-api send-keys: nohup ttyd -W -p {port} -c user:{token} tmux attach -t {pane_id}
    → fast-api 等待端口就绪（轮询 socket.connect，最多 30s）
    → 返回 {pane_id, ttyd_port, ttyd_token, url}
Frontend 保存 config，渲染 <iframe src="https://g-ttyd-api.cicy.de5.net/ttyd/{pane_id}/?token={master_token}">
    → Server 验证 token，代理到 ttyd:{port}
    → ttyd WebSocket 连接到 tmux pane
```

### 4.2 重启 pane

```
Frontend POST /api/tmux/panes/{id}/restart
    → fast-api 读旧配置（port, workspace, init_script, proxy）
    → fast-api tmux run-shell: kill -9 $(lsof -ti:{port}); pkill -9 -f 'tmux attach -t {pane_id}'
    → 等待端口释放（最多 2s）
    → fast-api DELETE FROM ttyd_config WHERE pane_id=...
    → fast-api tmux kill-pane -t {pane_id}
    → fast-api tmux new-window
    → fast-api create_ttyd_pane_common（分配同端口/新端口，生成新 token）
    → 返回新 {port, url}
Frontend 更新 iframeKey（强制 iframe 重载）
```

## 5. 目录结构

```
ttyd-proxy-v1/
├── docker-compose.dev.yml    # 开发环境（见下文）
├── docker-compose.prod.yml   # 生产环境
├── e2e-test.sh               # curl 端到端测试脚本
├── e2e-test-login.sh         # 登录流程 E2E 测试
├── e2e-test.js               # Playwright E2E 测试
├── server/
│   ├── src/index.ts          # 主代理逻辑（唯一源文件）
│   ├── package.json          # 依赖：http-proxy, tsx, typescript
│   ├── tsconfig.json         # target: ES2022, module: ESNext
│   ├── Dockerfile            # 生产镜像：tsc 编译后 node dist/index.js
│   └── Dockerfile.dev        # 开发镜像：tsx watch src/index.ts
├── frontend/
│   ├── src/
│   │   ├── main.tsx          # 入口
│   │   ├── Router.tsx        # 路由配置
│   │   ├── App.tsx           # 单终端视图
│   │   ├── WebTerminalApp.tsx # 多 pane 管理界面（主界面）
│   │   ├── services/
│   │   │   ├── apiUrl.ts     # API 基础 URL 计算（getApiUrl, getTtydUrl）
│   │   │   └── mockApi.ts    # tmux send-keys 封装
│   │   └── components/       # UI 组件
│   ├── vite.config.ts        # host: 0.0.0.0, port: 16901, strictPort
│   ├── tailwind.config.js
│   ├── package.json
│   ├── Dockerfile            # 生产：tsc + vite build → nginx
│   └── Dockerfile.dev        # 开发：vite --host 0.0.0.0 --port 16901
└── DOCS/
    ├── ARCHITECTURE.md       # 本文档
    └── DEVELOPMENT.md        # 开发测试部署规范
```

## 6. 外部依赖

| 依赖 | 用途 |
|-----|------|
| fast-api (port 14444) | 所有 API 调用目标（tmux、ttyd 管理） |
| ttyd (host binary) | 终端 Web 服务，由 fast-api 在 host 上启动 |
| tmux (host) | 会话管理，socket 在 `~/.tmux/default` |
| Cloudflare Tunnel | 外网访问，`cloudflared.sh` 管理路由 |
| MySQL (port 3306) | pane 配置持久化（由 fast-api 维护） |
