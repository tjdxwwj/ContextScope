# ContextScope API 接口文档

**版本**: v2.0.0  
**日期**: 2026-03-13  
**基础路径**: `http://localhost:18789/plugins/contextscope/api`

---

## 📋 目录

1. [概述](#1-概述)
2. [认证](#2-认证)
3. [任务相关 API](#3-任务相关-api)
4. [统计相关 API](#4-统计相关-api)
5. [请求相关 API](#5-请求相关-api)
6. [错误处理](#6-错误处理)
7. [示例代码](#7-示例代码)

---

## 1. 概述

### 1.1 API 风格

- **RESTful** 设计风格
- **JSON** 格式请求和响应
- **GET** 为主，支持 POST/DELETE（未来扩展）

### 1.2 响应格式

**成功响应**:
```json
{
  "success": true,
  "data": { ... },
  "timestamp": 1773381787855
}
```

**错误响应**:
```json
{
  "success": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task not found",
    "details": { ... }
  },
  "timestamp": 1773381787855
}
```

### 1.3 分页参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `limit` | number | 50 | 每页数量，最大 500 |
| `offset` | number | 0 | 偏移量 |

---

## 2. 认证

### 2.1 认证方式

所有 API 请求需要通过 OpenClaw Gateway 的插件认证：

```
Authorization: Bearer <plugin_token>
```

### 2.2 认证配置

在 `openclaw.local-test.json` 中配置：

```json
{
  "gateway": {
    "http": {
      "auth": {
        "plugin": {
          "enabled": true,
          "token": "your_plugin_token"
        }
      }
    }
  }
}
```

---

## 3. 任务相关 API

### 3.1 获取任务列表

**端点**: `GET /api/tasks`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sessionId` | string | 否 | 按会话 ID 过滤 |
| `status` | string | 否 | 按状态过滤 (completed/error/timeout/aborted) |
| `limit` | number | 否 | 每页数量，默认 50 |
| `offset` | number | 否 | 偏移量，默认 0 |

**请求示例**:
```http
GET /api/tasks?status=completed&limit=20 HTTP/1.1
Host: localhost:18789
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "taskId": "task_1773381787855_e0cb0b",
        "sessionId": "e0cb0bab-8983-47ab-a...",
        "sessionKey": "agent:main:main",
        "startTime": 1773381787855,
        "endTime": 1773381941855,
        "duration": 154000,
        "status": "completed",
        "stats": {
          "llmCalls": 3,
          "toolCalls": 2,
          "subagentSpawns": 2,
          "totalInput": 45000,
          "totalOutput": 5000,
          "totalTokens": 50000,
          "estimatedCost": 0.50
        },
        "metadata": {
          "agentId": "main",
          "channelId": "feishu",
          "depth": 0
        }
      }
    ],
    "pagination": {
      "limit": 20,
      "offset": 0,
      "total": 156,
      "hasMore": true
    }
  },
  "timestamp": 1773381787855
}
```

---

### 3.2 获取任务详情

**端点**: `GET /api/tasks/:taskId`

**参数**:

| 参数 | 类型 | 位置 | 说明 |
|------|------|------|------|
| `taskId` | string | path | 任务 ID |

**请求示例**:
```http
GET /api/tasks/task_1773381787855_e0cb0b HTTP/1.1
Host: localhost:18789
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "task": {
      "taskId": "task_1773381787855_e0cb0b",
      "sessionId": "e0cb0bab-8983-47ab-a...",
      "sessionKey": "agent:main:main",
      "parentTaskId": null,
      "startTime": 1773381787855,
      "endTime": 1773381941855,
      "duration": 154000,
      "status": "completed",
      "endReason": "completed",
      "stats": {
        "llmCalls": 3,
        "toolCalls": 2,
        "subagentSpawns": 2,
        "totalInput": 45000,
        "totalOutput": 5000,
        "totalTokens": 50000,
        "estimatedCost": 0.50
      },
      "runIds": ["abc123", "def456", "ghi789"],
      "childTaskIds": ["task_1773381800000_xxx", "task_1773381810000_yyy"],
      "metadata": {
        "agentId": "main",
        "channelId": "feishu",
        "trigger": "message",
        "depth": 0
      }
    }
  },
  "timestamp": 1773381787855
}
```

**错误响应**:
```json
{
  "success": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task not found"
  },
  "timestamp": 1773381787855
}
```

---

### 3.3 获取任务树

**端点**: `GET /api/tasks/:taskId/tree`

**说明**: 获取任务及其所有子任务的树状结构，包含聚合统计

**参数**:

| 参数 | 类型 | 位置 | 说明 |
|------|------|------|------|
| `taskId` | string | path | 任务 ID |
| `maxDepth` | number | query | 最大深度，默认不限制 |

**请求示例**:
```http
GET /api/tasks/task_1773381787855_e0cb0b/tree?maxDepth=2 HTTP/1.1
Host: localhost:18789
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tree": {
      "task": {
        "taskId": "task_1773381787855_e0cb0b",
        "sessionId": "e0cb0bab-8983-47ab-a...",
        "status": "completed",
        "stats": {
          "llmCalls": 3,
          "totalTokens": 50000,
          "estimatedCost": 0.50
        }
      },
      "children": [
        {
          "task": {
            "taskId": "task_1773381800000_xxx",
            "sessionId": "def456...",
            "sessionKey": "agent:main:subagent:xxx",
            "parentTaskId": "task_1773381787855_e0cb0b",
            "status": "completed",
            "stats": {
              "llmCalls": 2,
              "totalTokens": 17000,
              "estimatedCost": 0.17
            },
            "metadata": {
              "depth": 1
            }
          },
          "children": [],
          "aggregatedStats": {
            "llmCalls": 2,
            "totalTokens": 17000,
            "estimatedCost": 0.17,
            "depth": 1,
            "descendantCount": 0
          }
        }
      ],
      "aggregatedStats": {
        "llmCalls": 7,
        "totalTokens": 89000,
        "estimatedCost": 0.89,
        "depth": 2,
        "descendantCount": 3
      }
    }
  },
  "timestamp": 1773381787855
}
```

---

### 3.4 获取子任务列表

**端点**: `GET /api/tasks/:taskId/children`

**参数**:

| 参数 | 类型 | 位置 | 说明 |
|------|------|------|------|
| `taskId` | string | path | 父任务 ID |
| `limit` | number | query | 每页数量 |
| `offset` | number | query | 偏移量 |

**请求示例**:
```http
GET /api/tasks/task_1773381787855_e0cb0b/children?limit=10 HTTP/1.1
Host: localhost:18789
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "children": [
      {
        "taskId": "task_1773381800000_xxx",
        "sessionId": "def456...",
        "sessionKey": "agent:main:subagent:xxx",
        "status": "completed",
        "stats": {
          "llmCalls": 2,
          "totalTokens": 17000
        }
      }
    ],
    "pagination": {
      "limit": 10,
      "offset": 0,
      "total": 2,
      "hasMore": false
    }
  },
  "timestamp": 1773381787855
}
```

---

## 4. 统计相关 API

### 4.1 获取聚合统计

**端点**: `GET /api/stats`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sessionId` | string | 否 | 按会话过滤 |
| `startDate` | string | 否 | 开始日期 (YYYY-MM-DD) |
| `endDate` | string | 否 | 结束日期 (YYYY-MM-DD) |

**请求示例**:
```http
GET /api/stats?startDate=2026-03-13&endDate=2026-03-13 HTTP/1.1
Host: localhost:18789
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalTasks": 156,
      "completedTasks": 142,
      "errorTasks": 8,
      "timeoutTasks": 6,
      "totalTokens": 12500000,
      "totalCost": 125.00,
      "avgTokensPerTask": 80128,
      "avgDurationMs": 145000
    },
    "breakdown": {
      "llmCalls": 456,
      "toolCalls": 234,
      "subagentSpawns": 89
    },
    "topTasks": [
      {
        "taskId": "task_1773381787855_e0cb0b",
        "totalTokens": 89000,
        "llmCalls": 7
      }
    ],
    "hourlyDistribution": [
      { "hour": 0, "tasks": 5, "tokens": 250000 },
      { "hour": 1, "tasks": 3, "tokens": 150000 },
      { "hour": 14, "tasks": 25, "tokens": 1250000 }
    ]
  },
  "timestamp": 1773381787855
}
```

---

### 4.2 获取会话统计

**端点**: `GET /api/sessions/:sessionId/stats`

**参数**:

| 参数 | 类型 | 位置 | 说明 |
|------|------|------|------|
| `sessionId` | string | path | 会话 ID |

**请求示例**:
```http
GET /api/sessions/e0cb0bab-8983-47ab-a.../stats HTTP/1.1
Host: localhost:18789
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "sessionId": "e0cb0bab-8983-47ab-a...",
    "totalTasks": 12,
    "totalTokens": 1250000,
    "totalCost": 12.50,
    "avgTokensPerTask": 104166,
    "tasks": [
      {
        "taskId": "task_1773381787855_e0cb0b",
        "status": "completed",
        "tokens": 89000
      }
    ]
  },
  "timestamp": 1773381787855
}
```

---

## 5. 请求相关 API

### 5.1 获取请求列表

**端点**: `GET /api/requests`

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `taskId` | string | 否 | 按任务 ID 过滤 |
| `sessionId` | string | 否 | 按会话 ID 过滤 |
| `runId` | string | 否 | 按 runId 过滤 |
| `type` | string | 否 | 按类型过滤 (input/output) |
| `limit` | number | 否 | 每页数量 |
| `offset` | number | 否 | 偏移量 |

**请求示例**:
```http
GET /api/requests?taskId=task_1773381787855_e0cb0b&limit=50 HTTP/1.1
Host: localhost:18789
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "requests": [
      {
        "id": 1,
        "type": "input",
        "runId": "abc123",
        "taskId": "task_1773381787855_e0cb0b",
        "sessionId": "e0cb0bab-8983-47ab-a...",
        "provider": "bailian",
        "model": "qwen3.5-plus",
        "timestamp": 1773381787855,
        "usage": {
          "input": 10000,
          "output": 0,
          "total": 10000
        }
      },
      {
        "id": 2,
        "type": "output",
        "runId": "abc123",
        "taskId": "task_1773381787855_e0cb0b",
        "timestamp": 1773381790000,
        "usage": {
          "input": 10000,
          "output": 500,
          "total": 10500
        }
      }
    ],
    "pagination": {
      "limit": 50,
      "offset": 0,
      "total": 14,
      "hasMore": false
    }
  },
  "timestamp": 1773381787855
}
```

---

### 5.2 获取请求详情

**端点**: `GET /api/requests/:id`

**参数**:

| 参数 | 类型 | 位置 | 说明 |
|------|------|------|------|
| `id` | number | path | 请求 ID |

**请求示例**:
```http
GET /api/requests/1 HTTP/1.1
Host: localhost:18789
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "request": {
      "id": 1,
      "type": "input",
      "runId": "abc123",
      "taskId": "task_1773381787855_e0cb0b",
      "sessionId": "e0cb0bab-8983-47ab-a...",
      "sessionKey": "agent:main:main",
      "provider": "bailian",
      "model": "qwen3.5-plus",
      "timestamp": 1773381787855,
      "prompt": "帮我查一下天气...",
      "systemPrompt": "You are a helpful assistant...",
      "usage": {
        "input": 10000,
        "output": 0,
        "total": 10000
      },
      "metadata": {
        "agentId": "main",
        "channelId": "feishu"
      }
    }
  },
  "timestamp": 1773381787855
}
```

---

## 6. 错误处理

### 6.1 错误码

| 错误码 | HTTP 状态码 | 说明 |
|--------|-----------|------|
| `TASK_NOT_FOUND` | 404 | 任务不存在 |
| `SESSION_NOT_FOUND` | 404 | 会话不存在 |
| `REQUEST_NOT_FOUND` | 404 | 请求记录不存在 |
| `INVALID_PARAMETER` | 400 | 参数无效 |
| `UNAUTHORIZED` | 401 | 认证失败 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

### 6.2 错误响应格式

```json
{
  "success": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task not found",
    "details": {
      "taskId": "task_invalid"
    }
  },
  "timestamp": 1773381787855
}
```

### 6.3 错误处理示例

```typescript
try {
  const response = await fetch('http://localhost:18789/api/tasks/invalid_id');
  const data = await response.json();
  
  if (!data.success) {
    console.error(`Error: ${data.error.code} - ${data.error.message}`);
  }
} catch (error) {
  console.error(`Request failed: ${error.message}`);
}
```

---

## 7. 示例代码

### 7.1 Node.js 示例

```typescript
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:18789/plugins/contextscope/api';

// 获取任务列表
async function getTasks(limit = 50) {
  const response = await fetch(`${BASE_URL}/tasks?limit=${limit}`);
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error.message);
  }
  
  return data.data.tasks;
}

// 获取任务树
async function getTaskTree(taskId: string) {
  const response = await fetch(`${BASE_URL}/tasks/${taskId}/tree`);
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.error.message);
  }
  
  return data.data.tree;
}

// 打印任务树
function printTaskTree(node: any, indent = '') {
  console.log(`${indent}📋 ${node.task.taskId} (${node.task.status})`);
  console.log(`${indent}   Tokens: ${node.task.stats.totalTokens.toLocaleString()} (agg: ${node.aggregatedStats.totalTokens.toLocaleString()})`);
  console.log(`${indent}   Cost: $${node.task.stats.estimatedCost.toFixed(4)} (agg: $${node.aggregatedStats.estimatedCost.toFixed(4)})`);
  
  for (const child of node.children) {
    printTaskTree(child, indent + '   │   ');
  }
}

// 使用示例
async function main() {
  const tasks = await getTasks(10);
  console.log(`Found ${tasks.length} tasks`);
  
  const tree = await getTaskTree(tasks[0].taskId);
  printTaskTree(tree);
}

main().catch(console.error);
```

---

### 7.2 Python 示例

```python
import requests

BASE_URL = 'http://localhost:18789/plugins/contextscope/api'

def get_tasks(limit=50):
    """获取任务列表"""
    response = requests.get(f'{BASE_URL}/tasks', params={'limit': limit})
    data = response.json()
    
    if not data['success']:
        raise Exception(f"{data['error']['code']}: {data['error']['message']}")
    
    return data['data']['tasks']

def get_task_tree(task_id):
    """获取任务树"""
    response = requests.get(f'{BASE_URL}/tasks/{task_id}/tree')
    data = response.json()
    
    if not data['success']:
        raise Exception(f"{data['error']['code']}: {data['error']['message']}")
    
    return data['data']['tree']

def print_task_tree(node, indent=''):
    """打印任务树"""
    print(f"{indent}📋 {node['task']['taskId']} ({node['task']['status']})")
    print(f"{indent}   Tokens: {node['task']['stats']['totalTokens']:,} (agg: {node['aggregatedStats']['totalTokens']:,})")
    print(f"{indent}   Cost: ${node['task']['stats']['estimatedCost']:.4f} (agg: ${node['aggregatedStats']['estimatedCost']:.4f})")
    
    for child in node['children']:
        print_task_tree(child, indent + '   │   ')

# 使用示例
if __name__ == '__main__':
    tasks = get_tasks(10)
    print(f"Found {len(tasks)} tasks")
    
    tree = get_task_tree(tasks[0]['taskId'])
    print_task_tree(tree)
```

---

### 7.3 cURL 示例

```bash
# 获取任务列表
curl -X GET "http://localhost:18789/plugins/contextscope/api/tasks?limit=10"

# 获取任务详情
curl -X GET "http://localhost:18789/plugins/contextscope/api/tasks/task_1773381787855_e0cb0b"

# 获取任务树
curl -X GET "http://localhost:18789/plugins/contextscope/api/tasks/task_1773381787855_e0cb0b/tree"

# 获取聚合统计
curl -X GET "http://localhost:18789/plugins/contextscope/api/stats?startDate=2026-03-13"

# 获取请求列表
curl -X GET "http://localhost:18789/plugins/contextscope/api/requests?taskId=task_1773381787855_e0cb0b"
```

---

## 附录

### A. 响应时间要求

| API 类型 | P50 | P95 | P99 |
|----------|-----|-----|-----|
| 任务列表 | <100ms | <500ms | <1s |
| 任务详情 | <50ms | <200ms | <500ms |
| 任务树 | <200ms | <1s | <2s |
| 统计 API | <500ms | <2s | <5s |

### B. 速率限制

| 端点 | 限制 |
|------|------|
| 所有 API | 100 请求/分钟/IP |

### C. 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0.0 | 2026-03-10 | 初始版本 |
| v2.0.0 | 2026-03-13 | 添加任务树架构 |

---

**文档结束**
