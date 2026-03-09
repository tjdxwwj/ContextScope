# ContextScope

A tool that captures and visualizes API requests, prompts, completions, and token usage data in real-time.

## 🚀 Features

- 🔍 **Real-time Request Capture**: Automatically captures all LLM requests and responses
- 📊 **Token Usage Analysis**: Track input/output tokens, cache usage, and estimated costs
- 📈 **Interactive Dashboard**: Web-based dashboard with real-time updates and charts
- 🎯 **Request Filtering**: Filter by session, provider, model, time range, etc.
- 💰 **Cost Estimation**: Automatic cost calculation based on provider pricing
- 🚨 **Usage Alerts**: Configurable alerts for high token usage or costs
- 📥 **Data Export**: Export request data as JSON or CSV
- 🔒 **Privacy Protection**: Optional content anonymization
- 🎨 **Customizable**: Dark/light themes, configurable retention, etc.

## 📦 Installation

### Option 1: Install from npm (when published)
```bash
npm install contextscope
```

### Option 2: Local Development
```bash
# Clone this repository
git clone https://github.com/yourname/contextscope.git
cd contextscope

# Install dependencies
npm install

# Build the plugin
npm run build

# Copy to extensions
cp -r dist/* ~/.openclaw/extensions/contextscope/
```

### Option 3: Direct GitHub Install
```bash
npm install https://github.com/yourname/contextscope.git
```

## ⚙️ Configuration

Add to your OpenClaw config file:

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
            "refreshInterval": 5000,
            "charts": ["tokens", "cost", "timeline", "models", "providers"]
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

## 🎯 Usage

### Dashboard
Access the web dashboard at:
```
http://your-gateway-host:port/plugins/contextscope
```

Features:
- Real-time request monitoring
- Token usage statistics
- Cost analysis
- Request filtering and search
- Data export capabilities

### CLI Commands
```bash
# Check plugin status
/analyzer

# Get detailed statistics
/analyzer stats

# Get help
/analyzer help
```

### API Endpoints
```bash
# Get statistics
GET /plugins/contextscope/api/stats

# Get requests with filters
GET /plugins/contextscope/api/requests?sessionId=xxx&provider=openai&limit=100

# Export data
GET /plugins/contextscope/api/export?format=json
GET /plugins/contextscope/api/export?format=csv
```

## 📊 Configuration Options

### Storage Settings
- `maxRequests`: Maximum number of requests to store (100-100000, default: 10000)
- `retentionDays`: Number of days to keep request data (1-365, default: 7)
- `compression`: Enable data compression (default: true)

### Visualization Settings
- `theme`: Dashboard theme - "light", "dark", or "auto" (default: "dark")
- `autoRefresh`: Enable automatic dashboard refresh (default: true)
- `refreshInterval`: Refresh interval in milliseconds (1000-30000, default: 5000)
- `charts`: Array of charts to display - ["tokens", "cost", "timeline", "models", "providers"]

### Capture Settings
- `includeSystemPrompts`: Capture system prompts (default: true)
- `includeMessageHistory`: Capture conversation history (default: true)
- `anonymizeContent`: Remove potentially sensitive content (default: false)
- `maxPromptLength`: Maximum prompt length to store (100-100000, default: 10000)

### Alert Settings
- `enabled`: Enable usage alerts (default: false)
- `tokenThreshold`: Alert when tokens exceed this value (1000-1000000, default: 50000)
- `costThreshold`: Alert when estimated cost exceeds this value in USD (0.1-1000, default: 10.0)

## 🔒 Privacy & Security

- **Local Storage**: All data is stored locally in your workspace
- **Optional Anonymization**: Enable content anonymization to remove emails, phone numbers, API keys
- **Configurable Retention**: Automatic cleanup of old data based on retention settings
- **No External Calls**: The plugin doesn't send data to external services
- **Access Control**: Uses built-in authentication system

## 🛠️ Development

### Prerequisites
- Node.js 22+
- Node.js 18+

### Setup
```bash
# Clone the repository
git clone https://github.com/yourname/openclaw-request-analyzer.git
cd openclaw-request-analyzer

# Install dependencies
npm install

# Development mode
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Project Structure
```
contextscope/
├── src/
│   ├── config.ts            # Configuration schema
│   ├── storage.ts           # SQLite storage implementation
│   ├── service.ts           # Analysis service
│   └── web/
│       └── handler.ts       # Web dashboard handler
├── dist/                    # Build output
├── package.json             # NPM package configuration
├── openclaw.plugin.json    # Plugin manifest
├── tsconfig.json            # TypeScript configuration
└── README.md                # This file
```

## 🐛 Troubleshooting

### Plugin not loading
1. Check that the plugin is properly installed in `~/.openclaw/extensions/`
2. Verify the configuration is correct
3. Check logs for error messages
4. Ensure the plugin is enabled in config

### Dashboard not accessible
1. Ensure the gateway is running
2. Check that the plugin is enabled in config
3. Verify the URL path is correct
4. Check for any firewall/port issues

### No requests being captured
1. Check that hooks are properly registered
2. Verify the plugin service started successfully
3. Look for any error messages in logs
4. Ensure the gateway is processing requests

### Build errors
1. Check Node.js version (22+ required)
2. Run `npm install` to ensure dependencies are installed
3. Check TypeScript configuration
4. Verify plugin-sdk compatibility

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests if applicable
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines
- Follow TypeScript best practices
- Add tests for new features
- Update documentation as needed
- Ensure code passes linting and type checking
- Follow the existing code style

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- The community for feedback and testing
- Contributors who help improve this plugin

## 📞 Support

- Create an issue on GitHub for bug reports
- Start a discussion for feature requests
- Check the documentation for general help
- Join the community for support

---

**Made with ❤️ for the community**