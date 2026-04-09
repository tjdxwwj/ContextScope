# ContextScope for OpenClaw

> **Know exactly where your AI budget goes** — Visualize token usage and costs for every LLM request, like Chrome DevTools for AI applications

[![npm version](https://img.shields.io/npm/v/openclaw-contextscope.svg)](https://www.npmjs.com/package/openclaw-contextscope)
[![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-Plugin-blue.svg)](https://openclaw.ai)

English | [简体中文](README.zh-CN.md)

## 🚀 What Makes ContextScope Different

**The problem**: You're spending money on openclaw but have no idea where it goes. Which requests cost the most? What's driving up your token usage?

**The solution**: ContextScope shows you exactly where every dollar goes — per request, per model, per conversation.

Unlike OpenClaw's built-in observability tools, **ContextScope** provides:

| Feature | ContextScope (This Plugin) | OpenClaw Native |
|---------|---------------------------|-----------------|
| **Visual Dashboard** | ✅ Full React-based UI with real-time charts | ❌ CLI-only logs |
| **Token Breakdown** | ✅ Per-request token analysis (system/history/tools/output) | ⚠️ Basic usage stats |
| **Context Treemap** | ✅ Visual treemap of message importance | ❌ Not available |
| **Timeline View** | ✅ Interactive timeline with zoom/filter | ❌ Text-only logs |
| **Subagent Tracing** | ✅ Full parent-child run visualization | ⚠️ Limited tracing |
| **Cost Analytics** | ✅ Model-based cost estimation | ❌ Not available |
| **Data Export** | ✅ JSON/CSV export with filters | ❌ Not available |
| **Auto Browser Launch** | ✅ Opens dashboard on gateway start | ❌ Manual access |

## 📸 Screenshots

> **Note**: Place your screenshots in the `screenshots/` directory

### Dashboard Overview
![Dashboard Overview](screenshots/dashboard.png)
*Real-time overview of all your AI requests and costs*

### Token Breakdown - Know Where Your Money Goes
![Token Breakdown](screenshots/token-breakdown.png)
*Detailed token usage breakdown per request*

### Timeline View
![Timeline View](screenshots/timeline.png)
*Interactive timeline with zoom and filter capabilities*

### Cost Analysis
![Cost Analysis](screenshots/cost-analysis.png)
*Track spending by model and time period*

### Context Treemap
![Context Treemap](screenshots/context-treemap.png)
*Visualize message importance and token distribution*

### Context Reducer
![Context Reducer](screenshots/context-reducer.png)
*Example: only **four** reduction runs (“Total Records”, i.e. four `before_prompt_build` rounds in this session) already yield an **average saving rate of ~60%** on tokens sent to the model — trends, per-reducer contributions, and logs.*

## ✨ Key Features

### 1. Cost Transparency — Know Where Your Money Goes
- **Per-request cost breakdown** — See the exact cost of every single API call
- **Token-to-dollar mapping** — Understand which parts of your prompts drive costs
- **Budget tracking** — Monitor spending in real-time with configurable alerts
- **Export spending reports** — Analyze costs by model, time period, or conversation

### 2. Real-Time Request Monitoring
- **Chrome DevTools-like interface** for AI agent requests
- Live request/response capture with zero configuration
- WebSocket-free polling with configurable refresh intervals

### 3. Token-Level Context Analysis
```
System Prompt:  1,234 tokens (12%)
History:        5,678 tokens (56%)
Tool Results:   2,345 tokens (23%)
Output:          901 tokens (9%)
```
- Understand exactly where your tokens go
- Identify context bloat and optimization opportunities

### 4. Context Treemap Visualization
- Visual representation of message impact scores
- Quickly identify which historical messages matter most
- Optimize context window usage

### 5. Subagent & Tool Call Tracing
- Complete parent-child run hierarchy
- Tool call dependency graph
- Subagent spawn/send/ended lifecycle tracking

### 6. Cost Analytics & Alerts
- Model-based cost estimation (OpenAI, Anthropic, etc.)
- Configurable token and cost thresholds
- Real-time alerting for expensive operations

## 🧠 Context reduction pipeline

ContextScope can **compress the conversation before it is sent to the LLM** using the `before_prompt_build` hook. A fixed **pipeline** of reducers **mutates the `messages` array in place** (same references OpenClaw uses) to reduce tokens.

Dashboard example: see **Context Reducer** in the Screenshots section above — in that run, **four** logged reductions (**Total Records**) show an **~60% average saving rate** with per-reducer contributions (e.g. `contentPreviewer`, `toolResultPrioritizer`).

**Reducer order** (dedupe first so later steps see unique content):

| Step | Reducer | What it does |
|------|---------|----------------|
| 1 | **duplicateDeduper** | If the same tool is invoked with the same arguments repeatedly, older tool results are replaced with a short placeholder; the newest matching result is kept. |
| 2 | **toolInputTrimmer** | For assistant turns **before** the last `preserveRecentTurns` “turns”, long **tool call arguments** are shortened. Calls linked to **error** tool results are preserved. |
| 3 | **contentPreviewer** | Large tool results in older turns become a **head + tail** line preview (configurable line counts). Write-style tools (e.g. `write_file`) are skipped here and handled in step 4. |
| 4 | **toolResultPrioritizer** | **Errors** stay intact; **successful write-style** tool outputs become placeholders; other long results are **truncated** to a max character budget. |

**Cross-cutting options**

- **`preserveRecentTurns`** — How many recent assistant turns are largely left untouched by the reducers (default in code: `2`).
- **`logging`** — When enabled, each run records reduction stats (best-effort; failures never break the agent).

Tune these under `contextReducer` in your plugin config; see `openclaw.plugin.json` for the full schema and defaults.

## 📦 Installation & first run

This README treats **install from a local clone** as the primary workflow (build → `install -l` → restart gateway). The npm package is listed as an alternative.

### From this repository (development / local path)

After OpenClaw loads the plugin, ContextScope **starts its own HTTP server** (default **`127.0.0.1:18790`**, override with env `PORT`). That process serves **REST APIs** (`/api/...`) and the **dashboard** at `/plugins/contextscope` when `dist/frontend` exists (`npm run build:all`).

```bash
cd /path/to/ContextScope
npm install
npm run build              # TypeScript → dist/index.js (required)
# Optional: bundle the React dashboard into dist/frontend
npm run build:all

openclaw plugins install -l /path/to/ContextScope
openclaw plugins list
openclaw gateway restart
```

- **Plugin id** in this repo is **`contextscope`** (`openclaw.plugin.json`). The published npm plugin may use another id — always match **`openclaw plugins list`** under `plugins.entries` in `openclaw.json` / `openclaw.yaml`.

### From npm (registry)

```bash
openclaw plugins install openclaw-contextscope@latest
openclaw gateway restart
openclaw plugins list
```

### Open the dashboard & APIs

| What | URL (defaults) |
|------|----------------|
| **Dashboard** (served by ContextScope) | `http://127.0.0.1:18790/plugins/contextscope` |
| **REST API** (same process) | `http://127.0.0.1:18790/api/...` |
| **Via OpenClaw gateway** (if your gateway proxies the plugin UI) | Often `http://localhost:18789/plugins/contextscope` — **gateway port varies** |

If the terminal prints a different URL after startup, prefer that. Confirm the plugin is **loaded** with `openclaw plugins list`.

### Chat commands (optional)

```
/analyzer         # Show plugin status
/analyzer stats   # View detailed statistics
/analyzer open    # Open dashboard in browser
/analyzer help    # Show all commands
```

## ⚙️ Configuration

Edit your OpenClaw config. Common locations:

- `~/.openclaw/openclaw.json` (JSON)
- `openclaw.yaml` in the same directory if your setup uses YAML—**same structure**, different syntax.

Under `plugins.entries.<pluginId>.config`, set storage, visualization, capture, alerts, and **`contextReducer`** for the pipeline. Each reducer can be turned **on or off** with its own `enabled` flag; set top-level `contextReducer.enabled` to `false` to disable the whole pipeline.

The JSON key under `entries` must match **`openclaw plugins list`** — **`contextscope`** for a local `install -l` of this repo; **`openclaw-contextscope`** is typical for the npm package.

```json
{
  "plugins": {
    "entries": {
      "contextscope": {
        "enabled": true,
        "config": {
          "storage": {
            "maxRequests": 10000,
            "retentionDays": 7,
            "compression": true
          },
          "visualization": {
            "theme": "dark",
            "autoRefresh": true,
            "refreshInterval": 5000
          },
          "capture": {
            "includeSystemPrompts": true,
            "includeMessageHistory": true,
            "anonymizeContent": false
          },
          "alerts": {
            "enabled": true,
            "tokenThreshold": 50000,
            "costThreshold": 10.0
          },
          "contextReducer": {
            "enabled": true,
            "preserveRecentTurns": 2,
            "duplicateDeduper": { "enabled": true },
            "toolInputTrimmer": { "enabled": true, "maxInputChars": 200 },
            "contentPreviewer": {
              "enabled": true,
              "minContentChars": 500,
              "headLines": 10,
              "tailLines": 5
            },
            "toolResultPrioritizer": { "enabled": true, "lowPriorityMaxChars": 100 },
            "logging": { "enabled": true }
          }
        }
      }
    }
  }
}
```

**YAML example** (same `contextReducer` shape; rename `contextscope` if your `openclaw plugins list` shows another id):

```yaml
plugins:
  entries:
    contextscope:
      enabled: true
      config:
        contextReducer:
          enabled: true
          preserveRecentTurns: 2
          duplicateDeduper:
            enabled: false
          toolInputTrimmer:
            enabled: true
            maxInputChars: 200
          contentPreviewer:
            enabled: true
            minContentChars: 500
            headLines: 10
            tailLines: 5
          toolResultPrioritizer:
            enabled: true
            lowPriorityMaxChars: 100
          logging:
            enabled: true
```

Setting `duplicateDeduper.enabled` to `false` skips only that step; the pipeline still runs the other reducers in order.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                      │
│  ┌──────────────────────────────┐                      │
│  │  ContextScope plugin         │  HTTP :18790 (PORT)  │
│  │  • dist/index.js + hooks     │  /api/* , /plugins/… │
│  │  • Embedded Express server   │                      │
│  └────────┬─────────────────────┘                      │
│           │         ▲                                    │
│           │         └── React dashboard (dist/frontend) │
│           ▼                                              │
│  ┌─────────────────┐                                    │
│  │  JSONL Storage  │  ~/.openclaw/contextscope/         │
│  │  (Compressed)   │                                    │
│  └─────────────────┘                                    │
└─────────────────────────────────────────────────────────┘
```

The gateway may also reverse-proxy the UI on another host/port; **APIs in this repo are implemented on the plugin process** (default **`127.0.0.1:18790`**).

## 📊 API Endpoints

Base URL (default): `http://127.0.0.1:18790`

| Endpoint | Description |
|----------|-------------|
| `GET /api/stats` | Overall statistics & aggregations |
| `GET /api/requests` | Paginated request list with filters |
| `GET /api/analysis?runId=xxx` | Detailed run analysis |
| `GET /api/session?sessionId=xxx` | Session-level insights |
| `GET /api/export?format=json\|csv` | Data export |
| `GET /api/timeline` | Timeline data for visualization |
| `GET /api/chains` | Request chain relationships |
| `GET /api/reduction-logs` | Context reducer run logs |
| `GET /api/reduction-logs/summary` | Aggregated reducer stats |

## 🔧 Development

### Prerequisites
- Node.js 18+
- OpenClaw CLI installed

### Backend (plugin core)
```bash
cd ContextScope   # repository root
npm install
npm run build       # same as npm run build:backend (tsc)
```

### Frontend (dashboard)
```bash
cd ContextScope/frontend
npm install
npm run dev         # Vite dev server
npm run build       # Production assets → frontend/dist
```

### Full build & local install
```bash
cd ContextScope
npm run build:all   # backend tsc + copy frontend/dist → dist/frontend
openclaw plugins install -l "$(pwd)"
openclaw gateway restart
```

## 🆚 Comparison with Alternatives

| Tool | Type | Real-time | Visual UI | Token Analysis | Cost Tracking | OpenClaw Integration |
|------|------|-----------|-----------|----------------|---------------|---------------------|
| **ContextScope** | Plugin | ✅ | ✅ Full Dashboard | ✅ Detailed | ✅ | ✅ Native |
| OpenClaw Native | Built-in | ⚠️ Logs only | ❌ CLI | ⚠️ Basic | ❌ | ✅ |
| LangSmith | External | ✅ | ✅ | ✅ | ✅ | ❌ Manual setup |
| Langfuse | External | ✅ | ✅ | ✅ | ✅ | ❌ Manual setup |
| Helicone | Proxy | ✅ | ✅ | ✅ | ✅ | ❌ Requires API key |

**ContextScope Advantage**: Zero configuration, native OpenClaw integration, no external services or API keys required.

## 📝 License

MIT License — Free for personal and commercial use.

---

<p align="center">
  <b>Made for OpenClaw</b> — Visualize your AI agents like never before.
</p>
