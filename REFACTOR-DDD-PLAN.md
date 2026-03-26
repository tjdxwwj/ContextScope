# DDD 重构计划

## ✅ 已完成

### 阶段 1: 基础架构
- [x] `src/config/` - 配置管理
  - [x] env.ts - 环境变量解析 (zod schema)
  - [x] schema.ts - 配置 schema 定义
  - [x] index.ts - 配置入口
- [x] `src/shared/` - 共享层
  - [x] errors/app-error.ts - 统一错误定义
  - [x] types/common.ts - 共享类型

### 阶段 2: 领域层 (Domain)
- [x] `src/domain/request/` - Request 领域
  - [x] request.entity.ts - Request 实体
  - [x] request.repository.ts - Repository 接口
  - [x] request.service.ts - 领域服务
- [x] `src/domain/task/` - Task 领域
  - [x] task.entity.ts - Task 实体
  - [x] task.repository.ts - Repository 接口
  - [x] task.service.ts - 领域服务

## 🔄 进行中

### 阶段 3: 基础设施层 (Infrastructure)
- [ ] `src/infrastructure/database/` - 数据库层
  - [ ] sqlite.client.ts - SQLite 客户端
  - [ ] migrations/ - 数据库迁移
  - [ ] repositories/ - Repository 实现
    - [ ] request-sqlite.repository.ts
    - [ ] task-sqlite.repository.ts
- [ ] `src/infrastructure/http/` - HTTP 层
  - [ ] middleware/ - 中间件
  - [ ] routes/ - 路由
- [ ] `src/infrastructure/logging/` - 日志

### 阶段 4: 应用层 (Application)
- [ ] `src/app/` - 应用层
  - [ ] container.ts - 依赖注入容器
  - [ ] bootstrap.ts - 应用启动
  - [ ] server.ts - HTTP 服务器

### 阶段 5: 入口
- [ ] `src/index.ts` - 主入口

## 📋 待迁移
- [ ] ToolCall 领域
- [ ] SubagentLink 领域
- [ ] 现有 storage.ts 迁移
- [ ] 现有 service.ts 迁移
- [ ] Web Router 迁移

## 🎯 目标架构

```
src/
├── config/              ✅ 完成
├── shared/              ✅ 完成
├── domain/              ✅ 核心领域完成
│   ├── request/         ✅
│   ├── task/            ✅
│   └── tool-call/       ⏳ 待创建
├── infrastructure/      🔄 进行中
│   ├── database/
│   ├── http/
│   └── logging/
├── app/                 ⏳ 待创建
│   ├── container.ts
│   ├── bootstrap.ts
│   └── server.ts
└── index.ts            ⏳ 待创建
```

## 📦 新增依赖
- ✅ zod - Schema 验证
- ✅ inversify - 依赖注入容器
- ✅ reflect-metadata - 反射元数据

## 🚀 下一步
1. 创建基础设施层（SQLite Repository 实现）
2. 创建 HTTP 中间件和路由
3. 创建 DI 容器
4. 迁移现有代码
5. 测试和文档
