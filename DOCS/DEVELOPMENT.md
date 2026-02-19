# ttyd-proxy-v1 开发 / 测试 / 部署规范

## 1. 前置条件

| 工具 | 版本要求 | 说明 |
|------|---------|------|
| Docker + Docker Compose | ≥ 24.x | 所有服务均容器化 |
| fast-api | 运行中 (port 14444) | 必须先启动，前端依赖其 API |
| tmux | 运行中 (socket `~/.tmux/default`) | fast-api 管理的 tmux 服务器 |
| Cloudflare Tunnel | cloudflared 运行中 | 外网访问（开发可选） |

## 2. 开发环境启动

```bash
cd ~/projects/ttyd-proxy-v1

# 启动全部服务（server + frontend，含热重载）
docker compose -f docker-compose.dev.yml up

# 仅重建并启动（修改了 Dockerfile 或 package.json 后）
docker compose -f docker-compose.dev.yml up --build

# 后台运行
docker compose -f docker-compose.dev.yml up -d
```

**服务访问地址：**

| 服务 | 本地地址 | 外网地址（Cloudflare Tunnel） |
|------|---------|------------------------------|
| Frontend (Vite HMR) | http://localhost:16901 | https://g-ttyd.cicy.de5.net |
| Server (代理) | http://localhost:6901 | https://g-ttyd-api.cicy.de5.net |

### 2.1 环境变量

前端环境变量文件：`frontend/.env`

```env
VITE_API_URL=https://g-fast-api.cicy.de5.net     # fast-api 地址
VITE_TTYD_URL=https://g-ttyd-api.cicy.de5.net    # Server 代理地址（ttyd 访问）
VITE_TTYD_WEB_URL=https://g-ttyd.cicy.de5.net    # Frontend dev server
VITE_PROXY_URL=https://g-ttyd-api.cicy.de5.net   # 旧代理地址（预留，不再使用）
```

> **本地开发不走 Cloudflare Tunnel 时**，可将上面 URL 改为 `http://localhost:{port}`。

Server 环境变量（`docker-compose.dev.yml` 内置）：
```
NODE_ENV=development
PORT=6901
CHOKIDAR_USEPOLLING=true
```

### 2.2 热重载机制

- **Frontend**：Vite HMR，修改任意 `frontend/src/**` 文件后浏览器自动更新，无需重启
- **Server**：`tsx watch`，修改 `server/src/index.ts` 后进程自动重启（约 1s）
- 两者均通过 Docker volume bind mount 实现，无需进入容器操作

### 2.3 查看日志

```bash
# 全部日志（实时）
docker compose -f docker-compose.dev.yml logs -f

# 仅 server 日志
docker compose -f docker-compose.dev.yml logs -f server

# 仅 frontend 日志
docker compose -f docker-compose.dev.yml logs -f frontend
```

## 3. 代码规范

### 3.1 Frontend（React/TypeScript）

**文件组织：**
- 页面级组件：`src/App.tsx`、`src/WebTerminalApp.tsx`（直接在 `src/` 下）
- 通用组件：`src/components/`
- API/工具：`src/services/`

**API 调用规范：**
```typescript
// 必须通过 getApiUrl() 构建完整 URL，不可使用硬编码或相对路径
import { getApiUrl } from './services/apiUrl';

const res = await fetch(getApiUrl('/api/tmux/create'), {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data),
});
```

**ttyd iframe URL：**
```typescript
// 使用 getTtydUrl（通过 server 代理，传 pane 的 ttyd_token）
import { getTtydUrl } from './services/apiUrl';
<TtydFrame url={getTtydUrl(pane.target, config.token)} />

// ❌ 不要使用 getTtydWebUrl（nested iframe，已废弃）
```

### 3.2 Server（TypeScript/Node.js）

Server 只保留 ttyd 代理逻辑，**不要在 server 中添加业务 API**，所有业务逻辑统一放 fast-api。

**修改 server 后验证：**
```bash
# TypeScript 类型检查
docker compose -f docker-compose.dev.yml exec server npx tsc --noEmit

# 检查 server 重启日志
docker compose -f docker-compose.dev.yml logs server
```

## 4. 测试

### 4.1 端到端测试（curl）

```bash
# 完整 E2E 测试（需要服务运行）
bash e2e-test.sh

# 登录流程测试
bash e2e-test-login.sh
```

### 4.2 手动 API 测试

```bash
TOKEN="6568a729f18c9903038ff71e70aa1685888d9e8f4ca34419b9a5d9cf784ffdf1"

# 健康检查（无需认证）
curl http://localhost:6901/api/health

# 测试 ttyd 代理（需要有活跃的 pane）
curl -o /dev/null -w "%{http_code}" \
  "http://localhost:6901/ttyd/worker:p1.0/?token=$TOKEN"
# 期望: 200
```

### 4.3 Playwright E2E 测试

```bash
# 在 frontend 容器内运行
docker compose -f docker-compose.dev.yml exec frontend npx playwright test e2e-test.js
```

### 4.4 功能验证清单

**每次修改 WebTerminalApp 后验证：**
- [ ] 创建新 pane → iframe 正确加载终端
- [ ] 重启 pane → iframe 刷新，新 token 有效
- [ ] 删除 pane → 侧边栏列表更新
- [ ] 捕获 pane → 显示终端历史输出
- [ ] 刷新页面 → 已有 pane 配置保留（不清空 ttydConfigs）

**ttyd iframe 认证验证：**
```bash
# 检查代理是否返回 200（不是 401）
curl -o /dev/null -w "%{http_code}" \
  "http://localhost:6901/ttyd/{pane_id}/?token=$TOKEN"
```

**常见问题排查：**

| 现象 | 原因 | 解法 |
|------|------|------|
| iframe 显示 401 | ttyd_token 与 DB 不匹配（有僵尸进程） | 重启 pane 或手动 kill 后 restart |
| iframe 无法连接 | ttyd 未绑定端口 | 检查 `ss -tlnp | grep 151` |
| 创建 pane 超时 | ttyd 启动失败 | 查看 `/tmp/ttyd_{port}.log` |
| 刷新后 pane 配置消失 | setTtydConfigs 被清空 | 不应调用 `setTtydConfigs({})` |

## 5. 生产部署

### 5.1 构建生产镜像

```bash
# 构建并启动生产环境
docker compose -f docker-compose.prod.yml up --build -d
```

**生产 vs 开发区别：**

| | 开发 | 生产 |
|-|------|------|
| Frontend | Vite dev server (HMR) | Nginx 静态文件服务 |
| Server | tsx watch（自动重启） | tsc 编译后 node dist/ |
| 端口映射 | 16901（frontend）, 6901（server） | 80（Nginx）, 6901（server） |
| Volume | bind mount（实时同步） | 无 bind mount |

### 5.2 Cloudflare Tunnel 管理

```bash
# 查看当前路由
bash ~/.kiro/skills/cloudflared.sh list

# 添加路由（示例）
bash ~/.kiro/skills/cloudflared.sh add g-ttyd-api.cicy.de5.net localhost:6901

# 删除路由
bash ~/.kiro/skills/cloudflared.sh remove g-ttyd-api.cicy.de5.net
```

**当前路由映射：**
```
g-ttyd.cicy.de5.net     → localhost:16901  # Frontend
g-ttyd-api.cicy.de5.net → localhost:6901   # Server (proxy)
```

### 5.3 服务状态检查

```bash
# 检查容器状态
docker ps | grep ttyd-proxy

# 检查 server 健康
curl http://localhost:6901/api/health

# 检查 frontend 可访问
curl -o /dev/null -w "%{http_code}" http://localhost:16901/
```

## 6. 常用开发命令

```bash
# 进入 server 容器 shell
docker compose -f docker-compose.dev.yml exec server sh

# 进入 frontend 容器 shell
docker compose -f docker-compose.dev.yml exec frontend sh

# 安装新的 server 依赖（修改 package.json 后需重建）
docker compose -f docker-compose.dev.yml exec server npm install
docker compose -f docker-compose.dev.yml up --build server

# 安装新的 frontend 依赖
docker compose -f docker-compose.dev.yml exec frontend npm install
docker compose -f docker-compose.dev.yml up --build frontend

# 停止所有服务
docker compose -f docker-compose.dev.yml down
```

## 7. Git 工作流

```bash
# 查看状态
cd ~/projects/ttyd-proxy-v1
git status

# 提交（两个服务的修改统一提交到同一个 repo）
git add frontend/src/... server/src/...
git commit -m "feat/fix: 描述"

# 注意：不要提交 frontend/.env（含敏感域名配置）
```

`.gitignore` 应包含：
```
node_modules/
dist/
frontend/.env.local
```
