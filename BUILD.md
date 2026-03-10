# ContextScope 生产模式构建指南

## 项目结构

```
contextscope/
├── src/              # 后端 TypeScript 源码
├── frontend/         # React 前端源码
│   ├── src/
│   ├── dist/         # 构建产物（生产模式）
│   └── package.json
├── dist/             # 后端构建产物
└── package.json
```

## 开发模式

### 同时启动前后端开发服务器

```bash
npm run dev:all
```

这会启动：
- 后端 TypeScript 监听编译
- 前端 Vite 开发服务器 (http://localhost:5173)

### 单独启动

```bash
# 后端
npm run dev

# 前端
npm run dev:frontend
```

## 生产模式构建

### 完整构建（推荐）

```bash
npm run build:all
```

这会：
1. 构建 React 前端到 `frontend/dist/`
2. 编译 TypeScript 后端到 `dist/`

### 分步构建

```bash
# 构建前端
npm run build:frontend

# 构建后端
npm run build:backend
```

## 生产模式部署

构建完成后，插件会自动检测 `frontend/dist/index.html` 是否存在：

- **存在** → 生产模式，直接提供静态文件
- **不存在** → 开发模式，代理到 Vite 开发服务器

### OpenClaw 插件加载

1. 确保已执行 `npm run build:all`
2. 启动 OpenClaw Gateway
3. 访问 `http://localhost:18789/plugins/contextscope`

## Handler 工作原理

`src/web/handler.ts` 自动检测构建产物：

```typescript
const FRONTEND_DIST_PATH = join(__dirname, '..', '..', 'frontend', 'dist');
const isProduction = existsSync(FRONTEND_INDEX_PATH);
```

### 生产模式路由

- `/plugins/contextscope/` → 返回 `frontend/dist/index.html`
- `/plugins/contextscope/assets/*` → 返回静态资源
- `/plugins/contextscope/api/*` → API 端点

### 开发模式路由

- `/plugins/contextscope/` → 返回动态生成的 HTML
- `/plugins/contextscope/api/*` → API 端点

## 预览生产构建

```bash
npm run preview
```

这会在本地启动一个服务器预览构建后的应用。

## 故障排查

### 问题：生产模式仍然显示开发界面

**解决方案：**
1. 确认已执行 `npm run build:frontend`
2. 检查 `frontend/dist/index.html` 是否存在
3. 重启 OpenClaw Gateway

### 问题：静态资源 404

**解决方案：**
1. 检查 `frontend/dist/assets/` 目录是否包含资源文件
2. 重新执行 `npm run build:frontend`
3. 清除浏览器缓存

## 环境变量

可以通过环境变量控制行为：

```bash
# 强制生产模式
CONTEXTSCOPE_MODE=production npm start

# 强制开发模式
CONTEXTSCOPE_MODE=development npm start
```

## 性能优化建议

1. **启用 gzip 压缩** - 在 OpenClaw Gateway 前配置 Nginx
2. **使用 CDN** - 将 Chart.js 等库替换为 CDN 链接
3. **代码分割** - React 应用已自动进行代码分割
4. **缓存策略** - 静态资源已设置 1 年缓存

## 版本要求

- Node.js >= 20.0.0
- npm >= 9.0.0
- OpenClaw >= 2026.3.8
