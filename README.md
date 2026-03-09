# ContextScope

Advanced context analysis and visualization tool for AI agents.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│  Vite Frontend  │────▶│  OpenClaw Plugin │
│   (Port 5173)   │ API │   (Port 18789)   │
└─────────────────┘     └──────────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │  JSON Store  │
                        └──────────────┘
```

## Features

- **Real-time Request Visualization** - Like Chrome DevTools for AI agents
- **Token-level Breakdown** - System prompt, history, tools, output
- **Context Heatmap** - Visualize message impact scores
- **Timeline Analysis** - Context window utilization over time
- **Dependency Graph** - Tool call relationships
- **Optimization Insights** - AI-powered recommendations

## Development

### Backend (OpenClaw Plugin)

```bash
cd D:\code\request-analyzer
npm install
npm run build
```

The plugin will be loaded by OpenClaw Gateway automatically.

### Frontend (Vite)

```bash
cd D:\code\request-analyzer\frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### Production Build

```bash
cd frontend
npm run build
```

Copy `dist/` contents to your web server or serve from OpenClaw Gateway.

## API Endpoints

- `GET /plugins/contextscope/api/stats` - Overall statistics
- `GET /plugins/contextscope/api/requests` - Request list with filters
- `GET /plugins/contextscope/api/analysis?runId=xxx` - Detailed analysis
- `GET /plugins/contextscope/api/session?sessionId=xxx` - Session analysis
- `GET /plugins/contextscope/api/export?format=json|csv` - Export data

## Usage

Access the dashboard at:
- Development: http://localhost:5173
- Production: http://localhost:18789/plugins/contextscope

## License

MIT
