# ContextScope

A non-invasive plugin that captures and visualizes API requests, prompts, completions, and token usage data in real-time.

## Features

- 🔍 **Real-time Request Capture**: Automatically captures all LLM requests and responses
- 📊 **Token Usage Analysis**: Track input/output tokens, cache usage, and estimated costs
- 📈 **Interactive Dashboard**: Web-based dashboard with real-time updates and charts
- 🎯 **Request Filtering**: Filter by session, provider, model, time range, etc.
- 💰 **Cost Estimation**: Automatic cost calculation based on provider pricing
- 🚨 **Usage Alerts**: Configurable alerts for high token usage or costs
- 📥 **Data Export**: Export request data as JSON or CSV
- 🔒 **Privacy Protection**: Optional content anonymization
- 🎨 **Customizable**: Dark/light themes, configurable retention, etc.

## Installation

### From npm (recommended)
```bash
openclaw plugins install @yourname/openclaw-request-analyzer
```

### Local development
```bash
# Clone the repository
git clone https://github.com/yourname/openclaw-request-analyzer.git

# Install dependencies
cd openclaw-request-analyzer
npm install

# Build the plugin
npm run build

# Copy to OpenClaw extensions directory
cp -r dist/* ~/.openclaw/extensions/request-analyzer/
```

## Configuration

Add to your OpenClaw config:

```json
{
  "plugins": {
    "entries": {
      "request-analyzer": {
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
            "refreshInterval": 5000,
            "charts": ["tokens", "cost", "timeline"]
          },
          "capture": {
            "includeSystemPrompts": true,
            "includeMessageHistory": true,
            "anonymizeContent": false,
            "maxPromptLength": 10000
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

## Usage

### Dashboard Access
After installation and restart, access the dashboard at:
```
http://your-gateway-host:port/plugins/request-analyzer
```

### CLI Commands
```bash
# Check plugin status
/analyzer

# Get detailed statistics
/analyzer stats
```

### API Endpoints
```bash
# Get statistics
GET /plugins/request-analyzer/api/stats

# Get requests (with optional filters)
GET /plugins/request-analyzer/api/requests?sessionId=xxx&provider=openai&limit=100

# Export data
GET /plugins/request-analyzer/api/export?format=json
GET /plugins/request-analyzer/api/export?format=csv
```

## Configuration Options

### Storage Settings
- `maxRequests`: Maximum number of requests to store (default: 10000)
- `retentionDays`: Number of days to keep request data (default: 7)
- `compression`: Enable data compression (default: true)

### Visualization Settings
- `theme`: Dashboard theme - "light", "dark", or "auto" (default: "dark")
- `autoRefresh`: Enable automatic dashboard refresh (default: true)
- `refreshInterval`: Refresh interval in milliseconds (default: 5000)
- `charts`: Array of charts to display - ["tokens", "cost", "timeline", "models", "providers"]

### Capture Settings
- `includeSystemPrompts`: Capture system prompts (default: true)
- `includeMessageHistory`: Capture conversation history (default: true)
- `anonymizeContent`: Remove potentially sensitive content (default: false)
- `maxPromptLength`: Maximum prompt length to store (default: 10000)

### Alert Settings
- `enabled`: Enable usage alerts (default: false)
- `tokenThreshold`: Alert when tokens exceed this value (default: 50000)
- `costThreshold`: Alert when estimated cost exceeds this value in USD (default: 10.0)

## Privacy & Security

- **Local Storage**: All data is stored locally in your OpenClaw workspace
- **Optional Anonymization**: Enable content anonymization to remove emails, phone numbers, API keys
- **Configurable Retention**: Automatic cleanup of old data based on retention settings
- **No External Calls**: The plugin doesn't send data to external services

## Development

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

## Troubleshooting

### Plugin not loading
1. Check that the plugin is properly installed in `~/.openclaw/extensions/`
2. Verify the configuration is correct
3. Check OpenClaw logs for error messages

### Dashboard not accessible
1. Ensure the gateway is running
2. Check that the plugin is enabled in config
3. Verify the URL path is correct

### No requests being captured
1. Check that hooks are properly registered
2. Verify the plugin service started successfully
3. Look for any error messages in logs

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details