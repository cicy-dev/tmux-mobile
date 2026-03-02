# AGENTS.md — tmux-app 开发规范

> 本文件供 AI Agent 使用，修改代码前请务必阅读。

---

## 1. 项目概述

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + react-rnd
- **Server**: Node.js 代理服务器 (Docker 部署)
- **Tests**: curl API 测试 + E2E 浏览器测试

---

## 2. 构建/运行/测试命令

### 2.1 Docker

```bash
docker compose up --build          # 启动热重载
docker compose down                 # 停止
docker compose logs -f frontend     # 查看日志
```
**访问地址**: http://localhost:6902

### 2.2 Frontend

```bash
cd frontend
npm run dev          # 开发模式 (Vite HMR)
npm run build        # 类型检查 + 构建 (先执行 tsc)
npm run preview      # 预览生产构建
```

### 2.3 测试

```bash
# 单个 curl 测试
bash tests/curl/test_health.sh

# 所有 curl 测试
for f in tests/curl/test_*.sh; do bash "$f"; done

# E2E 测试
bash tests/e2e/test_login.sh
bash tests/e2e/test_create_pane.sh
```

---

## 3. 代码风格规范

### 3.1 TypeScript 配置

- `target`: ES2020 | `strict`: true | `jsx`: react-jsx
- `noUnusedLocals`: true | `noUnusedParameters`: true

### 3.2 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件 | kebab-case | `command-panel.tsx` |
| 组件 | PascalCase | `CommandPanel` |
| 接口/类型 | PascalCase | `AppSettings` |
| 函数/变量 | camelCase | `handleLogin` |
| 常量 | UPPER_SNAKE | `DEFAULT_SETTINGS` |

### 3.3 导入顺序

```typescript
// 1. React 核心
import React, { useState, useEffect } from 'react';
// 2. 外部库
import { Terminal } from 'lucide-react';
// 3. 本地组件
import { TtydFrame } from './components/TtydFrame';
// 4. 本地服务/工具
import { getApiUrl } from './services/apiUrl';
// 5. 类型/常量
import { AppSettings } from './types';
```

### 3.4 组件规范

- 函数组件 + Hooks
- 用 `forwardRef` 处理 ref 转发
- Props 用接口定义
- 组件 `.tsx`，类型 `.ts`

```typescript
interface Props { title: string; onSubmit: (v: string) => void; }
export const MyComponent = forwardRef<Handle, Props>(({ title }, ref) => {
  const [value, setValue] = useState('');
  useImperativeHandle(ref, () => ({ reset: () => setValue('') }));
  return <div>{title}</div>;
});
```

### 3.5 错误处理

```typescript
// 推荐
try {
  const res = await fetch(url);
  if (!res.ok) { console.error('API error:', res.status); return; }
  const data = await res.json();
} catch (e) { console.error('Failed:', e); }
// 避免 bare catch
```

### 3.6 CSS

- 使用 Tailwind CSS
- 避免内联样式

---

## 4. 测试规范

### 4.1 curl 测试模板

```bash
#!/bin/bash
set -euo pipefail
BASE=${TTYD_PROXY_URL:-http://localhost:6901}
TOKEN=$(python3 -c "import json; print(json.load(open('/home/w3c_offical/global.json'))['api_token'])")
H_AUTH="Authorization: Bearer $TOKEN"
H_ACCEPT="Accept: application/json"
PASS=0; FAIL=0
pass() { echo "  ✓ $1"; ((PASS++)); }
fail() { echo "  ✗ $1: $2"; ((FAIL++)); }
echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
```

### 4.2 要求

- API 变更 → curl 测试
- UI 变更 → E2E 测试
- 脚本必须有 PASS/FAIL 输出

---

## 5. 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NODE_ENV` | development | 环境 |
| `VITE_API_URL` | - | API 地址 |

---

## 6. 目录结构

```
tmux-app/
├── frontend/
│   ├── src/
│   │   ├── components/   # React 组件
│   │   ├── services/    # API 服务
│   │   ├── utils/       # 工具函数
│   │   └── types.ts     # 类型定义
│   └── package.json
├── tests/
│   ├── curl/            # API 测试
│   └── e2e/             # 浏览器 E2E 测试
└── docker-compose.yml
```

---

## 7. 禁止行为

- 跳过测试直接 commit
- 仅手动验证，不写 E2E 测试
- 测试脚本包含真实 token（必须从 global.json 读取）
