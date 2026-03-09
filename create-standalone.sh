# Standalone Project Setup Script
# This script helps you set up the Request Analyzer plugin as a standalone project

# Create standalone directory structure
mkdir -p request-analyzer-standalone
cd request-analyzer-standalone

# Copy all plugin files
cp -r ../request-analyzer/* .

# Create package.json for standalone project
cat > package.json << 'EOF'
{
  "name": "openclaw-request-analyzer",
  "version": "1.0.0",
  "description": "Non-invasive request analysis plugin for OpenClaw - visualize API requests, prompts, and token usage",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest",
    "lint": "oxlint",
    "format": "oxfmt --write",
    "format:check": "oxfmt --check",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "sqlite": "^5.1.1",
    "express": "^5.2.1",
    "ws": "^8.19.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0",
    "oxlint": "^1.51.0",
    "oxfmt": "^0.36.0"
  },
  "peerDependencies": {
    "openclaw": "^2026.3.9"
  },
  "keywords": [
    "openclaw",
    "plugin",
    "request-analyzer",
    "api-monitoring",
    "token-usage",
    "prompt-analysis",
    "llm-monitoring"
  ],
  "author": "Your Name",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourname/openclaw-request-analyzer"
  },
  "bugs": {
    "url": "https://github.com/yourname/openclaw-request-analyzer/issues"
  },
  "homepage": "https://github.com/yourname/openclaw-request-analyzer#readme",
  "engines": {
    "node": ">=22.12.0"
  }
}
EOF

# Create .gitignore
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build output
dist/
build/
*.tsbuildinfo

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
logs/
*.log

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage
coverage/
.nyc_output/

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Temporary files
tmp/
temp/
EOF

# Create GitHub Actions workflow
cat > .github/workflows/ci.yml << 'EOF'
name: CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [22.x]
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linter
      run: npm run lint
    
    - name: Check formatting
      run: npm run format:check
    
    - name: Build
      run: npm run build
    
    - name: Run tests
      run: npm test
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      if: matrix.node-version == '22.x'
EOF

echo "✅ Standalone project structure created!"
echo "📁 Files copied to: $(pwd)"
echo "🚀 Next steps:"
echo "  1. npm install"
echo "  2. npm run build"
echo "  3. npm test"
echo "  4. Copy dist/ to ~/.openclaw/extensions/request-analyzer/"
echo "  5. Configure OpenClaw to use the plugin"