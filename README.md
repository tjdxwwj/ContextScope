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

### 2. Token-Level Context Analysis
```
System Prompt:  1,234 tokens (12%)
History:        5,678 tokens (56%)
Tool Results:   2,345 tokens (23%)
Output:          901 tokens (9%)
```
- Understand exactly where your tokens go
- Identify context bloat and optimization opportunities

### 3. Context Treemap Visualization
- Visual representation of message impact scores
- Quickly identify which historical messages matter most
- Optimize context window usage

### 4. Subagent & Tool Call Tracing
- Complete parent-child run hierarchy
- Tool call dependency graph
- Subagent spawn/send/ended lifecycle tracking

### 5. Cost Analytics & Alerts
- Model-based cost estimation (OpenAI, Anthropic, etc.)
- Configurable token and cost thresholds
- Real-time alerting for expensive operations

## 📦 Installation

```bash
# Install via OpenClaw CLI
openclaw plugins install openclaw-contextscope

# Or install specific version
openclaw plugins install openclaw-contextscope@latest
```

## 🎯 Quick Start

### 1. Automatic (Recommended)
Simply restart OpenClaw gateway:
```bash
openclaw gateway restart
```

ContextScope will:
- ✅ Print a prominent dashboard URL in terminal
- ✅ Automatically open your browser
- ✅ Start capturing requests immediately

### 2. Manual Access
Visit: `http://localhost:18789/plugins/contextscope`

### 3. Chat Commands
In any OpenClaw conversation:
```
/analyzer         # Show plugin status
/analyzer stats   # View detailed statistics
/analyzer open    # Open dashboard in browser
/analyzer help    # Show all commands
```

## ⚙️ Configuration

Edit your `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "openclaw-contextscope": {
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
          }
        }
      }
    }
  }
}
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                      │
│  ┌─────────────────┐         ┌──────────────────────┐  │
│  │  ContextScope   │◄───────►│   React Dashboard    │  │
│  │  Plugin Core    │  HTTP   │   (Vite + Tailwind)  │  │
│  │                 │         │                      │  │
│  │ • LLM Hooks     │         │ • Real-time Charts   │  │
│  │ • Task Tracker  │         │ • Interactive Tables │  │
│  │ • Token Counter │         │ • Export Tools       │  │
│  └────────┬────────┘         └──────────────────────┘  │
│           │                                              │
│           ▼                                              │
│  ┌─────────────────┐                                    │
│  │  JSONL Storage  │  ~/.openclaw/contextscope/         │
│  │  (Compressed)   │                                    │
│  └─────────────────┘                                    │
└─────────────────────────────────────────────────────────┘
```

## 📊 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/stats` | Overall statistics & aggregations |
| `GET /api/requests` | Paginated request list with filters |
| `GET /api/analysis?runId=xxx` | Detailed run analysis |
| `GET /api/session?sessionId=xxx` | Session-level insights |
| `GET /api/export?format=json\|csv` | Data export |
| `GET /api/timeline` | Timeline data for visualization |
| `GET /api/chains` | Request chain relationships |

## 🔧 Development

### Prerequisites
- Node.js 18+
- OpenClaw CLI installed

### Backend (Plugin)
```bash
cd openclaw-contextscope
npm install
npm run build:backend
```

### Frontend (Dashboard)
```bash
cd openclaw-contextscope/frontend
npm install
npm run dev        # Development server
npm run build      # Production build
```

### Full Build
```bash
npm run build:all  # Builds both frontend and backend
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
