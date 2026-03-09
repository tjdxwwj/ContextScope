# ContextScope - Standalone Setup

## 📋 Project Overview

This is a **completely standalone** tool that provides real-time API request analysis and visualization. The tool is designed to be:

- ✅ **Non-invasive** - No modifications to core code
- ✅ **Independent** - Can be developed and maintained separately
- ✅ **Modular** - Standard plugin architecture
- ✅ **Feature-rich** - Complete request analysis and visualization

## 🏗️ Project Structure

```
contextscope/
├── src/
│   ├── config.ts            # Configuration schema and types
│   ├── storage.ts           # SQLite storage implementation
│   ├── service.ts           # Core analysis service
│   └── web/
│       └── handler.ts       # Web dashboard and API
├── package.json             # NPM package configuration
├── openclaw.plugin.json    # Plugin manifest
├── tsconfig.json            # TypeScript configuration
├── README.md                # Documentation
├── STANDALONE_README.md     # Standalone setup guide
└── create-standalone.sh   # Setup automation script
```

## 🚀 Quick Start

### 1. Setup as Standalone Project

```bash
# Make the setup script executable
chmod +x create-standalone.sh

# Run the setup script
./create-standalone.sh
```

### 2. Manual Setup

```bash
# Create new directory
mkdir contextscope
cd contextscope

# Copy all plugin files
cp -r /path/to/this/directory/* .

# Install dependencies
npm install

# Build the plugin
npm run build

# Install
cp -r dist/* ~/.openclaw/extensions/contextscope/
```

### 3. Configure

Add to your configuration:

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

## 📊 Features Implemented

### 🔍 Real-time Request Capture
- **LLM Input Hook**: Captures prompts, system prompts, model details, message history
- **LLM Output Hook**: Captures completions, token usage, provider information
- **Session Tracking**: Links requests to sessions and runs
- **Metadata Capture**: Timestamps, agent info, channel context

### 📈 Token Usage Analysis
- **Token Breakdown**: Input, output, cache read/write tokens
- **Cost Estimation**: Automatic cost calculation based on provider pricing
- **Usage Trends**: Historical analysis and trend detection
- **Provider Comparison**: Compare usage across different providers/models

### 🌐 Web Dashboard
- **Real-time Updates**: Live request monitoring with WebSocket support
- **Interactive Charts**: Token usage, cost trends, hourly distribution
- **Request Filtering**: Filter by session, provider, model, time range
- **Data Export**: Export to JSON or CSV formats
- **Responsive Design**: Works on desktop and mobile

### 🚨 Smart Alerts
- **Token Thresholds**: Alert on high token usage
- **Cost Monitoring**: Alert on high estimated costs
- **Anomaly Detection**: Detect unusual usage patterns
- **Configurable Limits**: Customizable alert thresholds

### 🔒 Privacy & Security
- **Local Storage**: All data stored locally in SQLite
- **Content Anonymization**: Optional removal of sensitive data
- **Configurable Retention**: Automatic cleanup of old data
- **Access Control**: Uses authentication system

## 🛠️ Development

### Prerequisites
- Node.js 22+
- Node.js 18+
- TypeScript 5.0+

### Development Commands

```bash
# Install dependencies
npm install

# Development mode with watch
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format

# Check formatting
npm run format:check
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 📈 API Endpoints

The plugin provides several HTTP endpoints under `/plugins/contextscope/`:

### Statistics Endpoint
```http
GET /plugins/contextscope/api/stats
```
Returns overall statistics including total requests, token usage, costs, etc.

### Requests Endpoint
```http
GET /plugins/contextscope/api/requests?sessionId=xxx&provider=openai&limit=100
```
Returns filtered request data with optional query parameters:
- `sessionId`: Filter by session ID
- `runId`: Filter by run ID
- `provider`: Filter by provider (openai, anthropic, etc.)
- `model`: Filter by model name
- `startTime`: Filter by start timestamp
- `endTime`: Filter by end timestamp
- `limit`: Maximum number of results (default: 100)
- `offset`: Pagination offset

### Export Endpoint
```http
GET /plugins/contextscope/api/export?format=json
GET /plugins/contextscope/api/export?format=csv
```
Exports request data in JSON or CSV format with the same filtering options as the requests endpoint.

### Dashboard
```http
GET /plugins/contextscope/
```
Serves the interactive web dashboard.

## 🎨 Customization

### Themes
The dashboard supports three themes:
- `light`: Light theme with bright colors
- `dark`: Dark theme with muted colors (default)
- `auto`: Automatically switches based on system preference

### Charts
You can enable/disable different chart types:
- `tokens`: Token usage over time
- `cost`: Estimated cost over time
- `timeline`: Request timeline
- `models`: Usage by model
- `providers`: Usage by provider

### Storage Configuration
- Adjust `maxRequests` to control database size
- Set `retentionDays` for automatic cleanup
- Enable/disable `compression` for space efficiency

## 🔧 Troubleshooting

### Common Issues

1. **Plugin not loading**
   - Check that files are in `~/.openclaw/extensions/contextscope/`
   - Verify the plugin is enabled in config
   - Check logs for errors

2. **Dashboard not accessible**
   - Ensure gateway is running
   - Check plugin is enabled
   - Verify URL path is correct

3. **No requests captured**
   - Verify hooks are registered
   - Check service started successfully
   - Look for errors in logs

4. **Build errors**
   - Check Node.js version (22+ required)
   - Run `npm install` for dependencies
   - Check TypeScript configuration

### Debug Mode
Enable debug logging to see detailed operations:
```json
{
  "logging": {
    "level": "debug"
  }
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new features
5. Ensure all tests pass
6. Submit a pull request

### Development Guidelines
- Follow TypeScript best practices
- Add comprehensive tests
- Update documentation
- Follow existing code style
- Ensure backward compatibility

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- OpenClaw team for the excellent plugin system
- Community contributors and testers
- All users who provide feedback and suggestions

---

**Made with ❤️ for the community**

For support, create an issue on GitHub.