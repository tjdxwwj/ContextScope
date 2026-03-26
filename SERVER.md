# ContextScope Independent Server

独立运行的 HTTP 服务，与 OpenClaw 插件进程分离，避免 IO 阻塞主进程。

## 🚀 快速开始

### 1. 安装依赖

```bash
cd D:\code\request-analyzer
npm install
```

### 2. 构建

```bash
npm run build
```

### 3. 启动独立服务

```bash
# 方式 A：直接启动
npm run start:server

# 方式 B：开发模式（自动重启）
npm run dev:server

# 方式 C：指定端口
$env:PORT=18790; npm run start:server
```

### 4. 启动 OpenClaw

```bash
# 设置环境变量启用独立服务模式
$env:ENABLE_INDEPENDENT_SERVER=true
$env:CONTEXTSCOPE_SERVER_URL=http://localhost:18790

# 启动 OpenClaw
openclaw start
```

## 📊 访问 Dashboard

启动后访问：
- **Dashboard**: http://localhost:18790/plugins/contextscope
- **Health Check**: http://localhost:18790/health
- **Stats**: http://localhost:18790/stats

## 🔧 配置选项

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `PORT` | 服务器端口 | `18790` |
| `ENABLE_INDEPENDENT_SERVER` | 启用独立服务模式 | `false` |
| `CONTEXTSCOPE_SERVER_URL` | 独立服务地址 | `http://localhost:18790` |
| `CONTEXTSCOPE_WORKSPACE` | 数据存储目录 | `~/.openclaw/contextscope` |
| `MAX_REQUESTS` | 最大存储请求数 | `10000` |
| `RETENTION_DAYS` | 数据保留天数 | `7` |

## 📝 使用方式

### 开发环境

**终端 1** - 启动独立服务：
```bash
cd D:\code\request-analyzer
npm run dev:server
```

**终端 2** - 启动 OpenClaw：
```bash
$env:ENABLE_INDEPENDENT_SERVER=true
openclaw start
```

### 生产环境

使用 PM2 管理独立服务：

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start dist/server.js --name contextscope

# 开机自启
pm2 startup
pm2 save

# 查看状态
pm2 status contextscope

# 查看日志
pm2 logs contextscope

# 重启
pm2 restart contextscope

# 停止
pm2 stop contextscope
```

## 🔄 数据流

```
用户消息 → OpenClaw Agent → LLM 请求
                              ↓
                    触发 llm_input Hook
                              ↓
                    插件 index.ts 捕获
                              ↓
                    HTTP POST (异步)
                              ↓
              独立服务 http://localhost:18790
                              ↓
                    SQLite / JSON 存储
                              ↓
                    Dashboard 展示
```

## ✅ 优势

- **不阻塞 OpenClaw** - HTTP 异步发送，fire-and-forget
- **独立扩展** - 可单独重启服务，不影响 OpenClaw
- **崩溃隔离** - 服务挂了不影响 OpenClaw 核心功能
- **性能优化** - SQLite IO 在独立进程中执行

## ⚠️ 注意事项

1. **独立服务必须先启动** - 在启动 OpenClaw 之前先启动独立服务
2. **端口占用** - 确保 18790 端口未被占用
3. **防火墙** - 如果遇到问题，检查防火墙是否阻止本地连接
4. **数据一致性** - 服务挂了可能导致少量数据丢失（fire-and-forget 模式）

## 🐛 故障排查

### 服务启动失败

```bash
# 检查端口占用
netstat -ano | findstr :18790

# 查看日志
npm run start:server
```

### OpenClaw 无法连接

```bash
# 测试服务是否可访问
curl http://localhost:18790/health

# 检查环境变量
echo $env:ENABLE_INDEPENDENT_SERVER
echo $env:CONTEXTSCOPE_SERVER_URL
```

### 数据未保存

1. 检查独立服务日志
2. 确认工作目录有写入权限
3. 检查 SQLite 文件是否损坏

## 📚 架构说明

详见项目根目录的 `README.md` 和 `REFACTOR-COMPLETE.md`。
