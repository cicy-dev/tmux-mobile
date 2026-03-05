---
inclusion: always
---

# tmux-app IDE Development Context

在修改 tmux-app 代码前，请先阅读以下文档：

## 必读文档

1. **AGENTS.md** - 项目开发规范
   - 构建/运行/测试命令
   - 代码风格规范
   - 测试规范

2. **docs/API_CLIENT_SPEC.md** - API 客户端规范
   - 统一的 API 请求类
   - 所有 API 端点定义
   - 使用示例

3. **docs/TOKEN_REFACTOR_SPEC.md** - Token 管理规范
   - Token 从 URL 提取并缓存
   - 认证流程
   - 安全考虑

4. **docs/CONTEXT_STATE_MANAGEMENT.md** - 全局状态管理
   - React Context 使用
   - 避免 props drilling
   - 状态管理最佳实践

## 项目架构

### 技术栈
- React 19 + TypeScript + Vite
- Tailwind CSS
- Docker 部署

### 目录结构
```
ide/
├── src/
│   ├── components/     # React 组件
│   ├── services/       # API 服务
│   │   ├── api.ts           # ApiClient 类
│   │   ├── tokenManager.ts  # Token 管理
│   │   └── apiUrl.ts        # URL 工具
│   ├── contexts/       # React Context
│   │   └── AppContext.tsx   # 全局状态
│   └── types.ts        # 类型定义
├── docs/               # 开发文档
└── tests/              # 测试脚本
```

### UI 布局

界面分为 3 列：
- **左列（256px）** - Agents 列表 (AgentsListView)
- **中列（ttydWidth）** - main-right (当前 pane 终端)
- **右列（剩余空间）** - main-left (Code/Agents/Preview/Settings tabs)

### 核心组件
- **SinglePaneApp.tsx** - 主应用
- **AgentsRightView.tsx** - Agents 网格视图（右列 Agents tab）
- **AgentsListView.tsx** - Agents 列表视图（左列）
- **WebFrame.tsx** - iframe 封装

## 开发规范

### 命名规范
- 文件: kebab-case (`command-panel.tsx`)
- 组件: PascalCase (`CommandPanel`)
- 函数/变量: camelCase (`handleLogin`)
- 常量: UPPER_SNAKE (`DEFAULT_SETTINGS`)

### 代码风格
- 使用函数组件 + Hooks
- Props 用接口定义
- 使用 Tailwind CSS（避免内联样式）
- 最小化代码实现

### API 调用
使用 ApiClient 类，不要直接 fetch：
```typescript
// ❌ 不要这样
fetch(getApiUrl('/api/tmux/panes'), {
  headers: { 'Authorization': `Bearer ${token}` }
})

// ✅ 应该这样
const api = new ApiClient(token);
await api.getPanes();
```

### 状态管理
优先使用 AppContext，避免 props drilling：
```typescript
// ❌ 不要这样
<Component token={token} agents={agents} />

// ✅ 应该这样
const { token, agents } = useApp();
```

## 当前重构计划

### 已完成
- ✅ 创建 ApiClient 类
- ✅ 创建 TokenManager
- ✅ 创建 AppContext
- ✅ 添加 Agents tab (All/Binded)
- ✅ 重新设计 AgentsRightView

### 待完成
- ⬜ 拆分 SinglePaneApp.tsx
- ⬜ 迁移组件使用 AppContext
- ⬜ 移除 token props drilling
- ⬜ 统一错误处理
- ⬜ 添加 loading 状态

## 修改代码前的检查清单

- [ ] 阅读了相关文档
- [ ] 理解了现有架构
- [ ] 遵循命名规范
- [ ] 使用 ApiClient 而非直接 fetch
- [ ] 考虑使用 AppContext
- [ ] 代码最小化实现
- [ ] 添加了必要的测试

## 常用命令

```bash
# 开发（支持 HMR 热重载）
docker compose up --build

# 修改前端代码后自动更新，无需重启
# 浏览器会自动刷新

# 测试
bash tests/curl/test_health.sh
bash tests/e2e/test_login.sh

# 查看 API
fast-api --tools                    # 列出所有端点
fast-api --tools /api/tmux/panes    # 查看端点详情
fast-api /api/tmux/panes            # 调用 API
```

## 修改 API 端点

如需修改或添加 API 端点，编辑以下文件：

```
/home/w3c_offical/projects/ai-workers/tmux-app/fast-api/
├── main.py              # FastAPI 主应用
├── routers/
│   ├── tmux.py         # Tmux 相关 API
│   ├── ttyd.py         # Ttyd 相关 API
│   ├── agents.py       # Agents 相关 API
│   └── cf.py           # Cloudflare AI API
└── cron/
    └── cron_pane_handler.py  # Pane 状态更新定时任务
```

修改后需要重启服务：
```bash
supervisorctl restart fast-api
```

## Electron 控制

使用 curl-rpc 控制 Electron 窗口（默认使用 node 2）：

```bash
# 打开网站
ELECTRON_MCP_NODE=2 curl-rpc open_window url=https://ide.cicy.de5.net/

# 查看可用工具
ELECTRON_MCP_NODE=2 curl-rpc tools

# 测试连接
ELECTRON_MCP_NODE=2 curl-rpc ping
```

## 注意事项

1. **不要移除 /ttyd/ 路径** - 这是必需的路由
2. **iframe 权限** - 已添加 allow-downloads 和 clipboard 权限
3. **最小化代码** - 只写必要的代码
4. **测试优先** - API 变更需要 curl 测试，UI 变更需要 E2E 测试
5. **Electron 默认 node 2** - 使用 curl-rpc 时默认 ELECTRON_MCP_NODE=2
