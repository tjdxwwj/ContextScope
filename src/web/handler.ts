/**
 * HTTP Handler for ContextScope Dashboard
 * 
 * Serves the web interface and API endpoints
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { PluginLogger } from 'openclaw/plugin-sdk/core';
import type { RequestAnalyzerService } from '../service.js';
import type { PluginConfig } from '../config.js';

interface HandlerParams {
  service: RequestAnalyzerService;
  config: PluginConfig;
  logger: PluginLogger;
}

export function createAnalyzerHttpHandler(params: HandlerParams) {
  const { service, config, logger } = params;

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    try {
      // API endpoints
      if (path === '/plugins/contextscope/api/stats') {
        return await handleStats(req, res);
      }
      
      if (path === '/plugins/contextscope/api/requests') {
        return await handleRequests(req, res, url);
      }

      if (path === '/plugins/contextscope/api/export') {
        return await handleExport(req, res, url);
      }

      // Dashboard
      if (path === '/plugins/contextscope' || path === '/plugins/contextscope/') {
        return await handleDashboard(req, res);
      }

      // Static assets
      if (path.startsWith('/plugins/contextscope/assets/')) {
        return await handleAsset(req, res, path);
      }

      // 404 for unknown paths
      res.statusCode = 404;
      res.end('Not Found');
      return true;

    } catch (error) {
      logger.error(`HTTP handler error: ${error}`);
      res.statusCode = 500;
      res.end('Internal Server Error');
      return true;
    }
  };

  async function handleStats(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const stats = await service.getStats();
      const storageStats = await service.getStorageStats();

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        stats,
        storage: storageStats,
        config: {
          theme: config.visualization?.theme || 'dark',
          autoRefresh: config.visualization?.autoRefresh !== false,
          refreshInterval: config.visualization?.refreshInterval || 5000
        }
      }));
      return true;
    } catch (error) {
      logger.error(`Failed to get stats: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to get statistics' }));
      return true;
    }
  }

  async function handleRequests(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const searchParams = url.searchParams;
      const filters = {
        sessionId: searchParams.get('sessionId') || undefined,
        runId: searchParams.get('runId') || undefined,
        provider: searchParams.get('provider') || undefined,
        model: searchParams.get('model') || undefined,
        startTime: searchParams.get('startTime') ? parseInt(searchParams.get('startTime')!) : undefined,
        endTime: searchParams.get('endTime') ? parseInt(searchParams.get('endTime')!) : undefined,
        limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
        offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0
      };

      const requests = await service.getRequests(filters);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        requests,
        total: requests.length,
        filters
      }));
      return true;
    } catch (error) {
      logger.error(`Failed to get requests: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to get requests' }));
      return true;
    }
  }

  async function handleExport(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const searchParams = url.searchParams;
      const format = searchParams.get('format') || 'json';
      const filters = {
        startTime: searchParams.get('startTime') ? parseInt(searchParams.get('startTime')!) : undefined,
        endTime: searchParams.get('endTime') ? parseInt(searchParams.get('endTime')!) : undefined,
        provider: searchParams.get('provider') || undefined,
        model: searchParams.get('model') || undefined
      };

      const requests = await service.getRequests(filters);

      if (format === 'csv') {
        const csv = convertToCSV(requests);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="requests.csv"');
        res.end(csv);
      } else {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="requests.json"');
        res.end(JSON.stringify(requests, null, 2));
      }
      return true;
    } catch (error) {
      logger.error(`Failed to export requests: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to export requests' }));
      return true;
    }
  }

  async function handleDashboard(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    const html = generateDashboardHTML(config);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.end(html);
    return true;
  }

  async function handleAsset(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    // For now, just return 404 for assets
    // In a full implementation, you'd serve CSS, JS, etc.
    res.statusCode = 404;
    res.end('Asset not found');
    return true;
  }

  function convertToCSV(requests: any[]): string {
    const headers = [
      'ID', 'Type', 'Run ID', 'Session ID', 'Provider', 'Model', 'Timestamp',
      'Input Tokens', 'Output Tokens', 'Cache Read', 'Cache Write', 'Total Tokens',
      'Images Count'
    ];

    const rows = requests.map(req => [
      req.id || '',
      req.type || '',
      req.runId || '',
      req.sessionId || '',
      req.provider || '',
      req.model || '',
      new Date(req.timestamp).toISOString(),
      req.usage?.input || '',
      req.usage?.output || '',
      req.usage?.cacheRead || '',
      req.usage?.cacheWrite || '',
      req.usage?.total || '',
      req.imagesCount || ''
    ]);

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }

  function generateDashboardHTML(config: PluginConfig): string {
    const theme = config.visualization?.theme || 'dark';
    const autoRefresh = config.visualization?.autoRefresh !== false;
    const refreshInterval = config.visualization?.refreshInterval || 5000;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ContextScope</title>
    <style>
        :root {
            --bg: ${theme === 'dark' ? '#1a1a1a' : '#ffffff'};
            --text: ${theme === 'dark' ? '#e0e0e0' : '#333333'};
            --card: ${theme === 'dark' ? '#2a2a2a' : '#f5f5f5'};
            --border: ${theme === 'dark' ? '#404040' : '#dddddd'};
            --primary: #007acc;
            --success: #28a745;
            --warning: #ffc107;
            --danger: #dc3545;
        }
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--border);
        }
        
        .header h1 {
            font-size: 2rem;
            font-weight: 600;
        }
        
        .status {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .status-indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--success);
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 20px;
            text-align: center;
        }
        
        .stat-value {
            font-size: 2.5rem;
            font-weight: 700;
            color: var(--primary);
            margin-bottom: 5px;
        }
        
        .stat-label {
            font-size: 0.9rem;
            color: var(--text);
            opacity: 0.8;
        }
        
        .controls {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        
        .btn {
            padding: 8px 16px;
            border: 1px solid var(--border);
            background: var(--card);
            color: var(--text);
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.2s;
        }
        
        .btn:hover {
            background: var(--primary);
            color: white;
            border-color: var(--primary);
        }
        
        .requests-table {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 8px;
            overflow: hidden;
        }
        
        .table-header {
            padding: 15px 20px;
            background: var(--bg);
            border-bottom: 1px solid var(--border);
            font-weight: 600;
        }
        
        .loading {
            text-align: center;
            padding: 40px;
            color: var(--text);
            opacity: 0.6;
        }
        
        .error {
            text-align: center;
            padding: 40px;
            color: var(--danger);
        }
        
        .refresh-info {
            text-align: center;
            margin-top: 20px;
            font-size: 0.8rem;
            color: var(--text);
            opacity: 0.6;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 ContextScope</h1>
            <div class="status">
                <div class="status-indicator"></div>
                <span>Live</span>
            </div>
        </div>
        
        <div class="stats-grid" id="stats-grid">
            <div class="loading">Loading statistics...</div>
        </div>
        
        <div class="controls">
            <button class="btn" onclick="refreshData()">🔄 Refresh</button>
            <button class="btn" onclick="exportData('json')">📥 Export JSON</button>
            <button class="btn" onclick="exportData('csv')">📊 Export CSV</button>
            <button class="btn" onclick="clearFilters()">🧹 Clear Filters</button>
        </div>
        
        <div class="requests-table">
            <div class="table-header">Recent Requests</div>
            <div id="requests-content">
                <div class="loading">Loading requests...</div>
            </div>
        </div>
        
        <div class="refresh-info" id="refresh-info">
            ${autoRefresh ? `Auto-refreshing every ${refreshInterval / 1000} seconds` : 'Auto-refresh disabled'}
        </div>
    </div>

    <script>
        let currentFilters = {};
        let refreshTimer = null;

        async function loadStats() {
            try {
                const response = await fetch('/plugins/contextscope/api/stats');
                const data = await response.json();
                
                if (data.error) {
                    document.getElementById('stats-grid').innerHTML = \`
                        <div class="error">Error loading statistics: \${data.error}</div>
                    \`;
                    return;
                }

                const stats = data.stats;
                document.getElementById('stats-grid').innerHTML = \`
                    <div class="stat-card">
                        <div class="stat-value">\${stats.totalRequests.toLocaleString()}</div>
                        <div class="stat-label">Total Requests</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">\${stats.todayRequests}</div>
                        <div class="stat-label">Today</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">\${stats.weekRequests}</div>
                        <div class="stat-label">This Week</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">\${stats.averageTokens.toLocaleString()}</div>
                        <div class="stat-label">Avg Tokens</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">$\${stats.totalCost.toFixed(2)}</div>
                        <div class="stat-label">Est. Cost</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">\${stats.storageSize}</div>
                        <div class="stat-label">Storage</div>
                    </div>
                \`;
            } catch (error) {
                document.getElementById('stats-grid').innerHTML = \`
                    <div class="error">Failed to load statistics: \${error.message}</div>
                \`;
            }
        }

        async function loadRequests() {
            try {
                const params = new URLSearchParams(currentFilters);
                const response = await fetch(\`/plugins/contextscope/api/requests?\${params}\`);
                const data = await response.json();
                
                if (data.error) {
                    document.getElementById('requests-content').innerHTML = \`
                        <div class="error">Error loading requests: \${data.error}</div>
                    \`;
                    return;
                }

                const requests = data.requests;
                if (requests.length === 0) {
                    document.getElementById('requests-content').innerHTML = \`
                        <div class="loading">No requests found</div>
                    \`;
                    return;
                }

                let html = '<div style="padding: 20px;">';
                requests.forEach(request => {
                    const time = new Date(request.timestamp).toLocaleString();
                    const usage = request.usage || {};
                    html += \`
                        <div style="border-bottom: 1px solid var(--border); padding: 15px 0;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <strong>\${request.provider} / \${request.model}</strong>
                                <span style="font-size: 0.9rem; opacity: 0.7;">\${time}</span>
                            </div>
                            <div style="display: flex; gap: 15px; font-size: 0.9rem;">
                                <span>Type: <strong>\${request.type}</strong></span>
                                <span>Tokens: <strong>\${usage.total?.toLocaleString() || 0}</strong></span>
                                <span>Session: <code>\${request.sessionId}</code></span>
                            </div>
                        </div>
                    \`;
                });
                html += '</div>';
                
                document.getElementById('requests-content').innerHTML = html;
            } catch (error) {
                document.getElementById('requests-content').innerHTML = \`
                    <div class="error">Failed to load requests: \${error.message}</div>
                \`;
            }
        }

        function refreshData() {
            loadStats();
            loadRequests();
            updateRefreshInfo();
        }

        function exportData(format) {
            const params = new URLSearchParams(currentFilters);
            window.open(\`/plugins/contextscope/api/export?format=\${format}&\${params}\`, '_blank');
        }

        function clearFilters() {
            currentFilters = {};
            refreshData();
        }

        function updateRefreshInfo() {
            const now = new Date().toLocaleTimeString();
            document.getElementById('refresh-info').textContent = \`
                Last updated: \${now} | \${${autoRefresh ? \`Auto-refreshing every ${refreshInterval / 1000} seconds\` : 'Auto-refresh disabled'}}
            \`;
        }

        // Initialize
        refreshData();
        
        // Setup auto-refresh
        ${autoRefresh ? \`
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(refreshData, ${refreshInterval});
        \` : ''}
    </script>
</body>
</html>`;
  }
}