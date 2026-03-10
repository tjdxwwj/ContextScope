/**
 * HTTP Handler for ContextScope Dashboard
 * 
 * Serves the web interface and API endpoints with advanced visualizations
 * 
 * Production Mode: Serves pre-built React frontend from dist/frontend
 * Development Mode: Proxies requests to Vite dev server (localhost:5173)
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RequestAnalyzerService } from '../service.js';
import type { PluginConfig } from '../config.js';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 生产模式：检查 frontend 构建产物是否存在
const FRONTEND_DIST_PATH = join(__dirname, '..', '..', 'frontend', 'dist');
const FRONTEND_INDEX_PATH = join(FRONTEND_DIST_PATH, 'index.html');
const isProduction = existsSync(FRONTEND_INDEX_PATH);

interface PluginLogger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

interface HandlerParams {
  service: RequestAnalyzerService;
  config: PluginConfig;
  logger: PluginLogger;
}

export function createAnalyzerHttpHandler(params: HandlerParams) {
  const { service, config, logger } = params;

  // 记录模式
  logger.info(`ContextScope Dashboard: ${isProduction ? 'Production' : 'Development'} mode`);
  if (isProduction) {
    logger.info(`Serving frontend from: ${FRONTEND_DIST_PATH}`);
  } else {
    logger.info(`Frontend dev server: http://localhost:5173`);
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const path = url.pathname;

    try {
      // API 端点
      if (path === '/plugins/contextscope/api/stats') {
        return await handleStats(req, res);
      }
      
      if (path === '/plugins/contextscope/api/requests') {
        return await handleRequests(req, res, url);
      }

      if (path === '/plugins/contextscope/api/analysis') {
        return await handleAnalysis(req, res, url);
      }

      if (path === '/plugins/contextscope/api/session') {
        return await handleSessionAnalysis(req, res, url);
      }

      if (path === '/plugins/contextscope/api/export') {
        return await handleExport(req, res, url);
      }

      // Dashboard 主页面
      if (path === '/plugins/contextscope' || path === '/plugins/contextscope/') {
        return await handleDashboard(req, res);
      }

      // 生产模式：提供静态资源
      if (isProduction && path.startsWith('/plugins/contextscope/')) {
        return await handleStaticFile(req, res, path);
      }

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

  /**
   * 生产模式：提供静态文件
   */
  async function handleStaticFile(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    // 移除 /plugins/contextscope 前缀
    const relativePath = path.replace('/plugins/contextscope', '');
    const filePath = join(FRONTEND_DIST_PATH, relativePath);

    // 安全检查：防止目录遍历攻击
    if (!filePath.startsWith(FRONTEND_DIST_PATH)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return true;
    }

    if (!existsSync(filePath)) {
      // 如果是 SPA 路由，返回 index.html
      if (!filePath.includes('.')) {
        return await handleDashboard(req, res);
      }
      res.statusCode = 404;
      res.end('Not Found');
      return true;
    }

    // 读取并返回文件
    try {
      const ext = filePath.split('.').pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        'html': 'text/html',
        'js': 'text/javascript',
        'mjs': 'text/javascript',
        'css': 'text/css',
        'json': 'application/json',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'ico': 'image/x-icon',
        'woff': 'font/woff',
        'woff2': 'font/woff2'
      };

      const mimeType = mimeTypes[ext || ''] || 'application/octet-stream';
      const content = readFileSync(filePath);

      res.statusCode = 200;
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.end(content);
      return true;
    } catch (error) {
      logger.error(`Failed to serve static file ${filePath}: ${error}`);
      res.statusCode = 500;
      res.end('Internal Server Error');
      return true;
    }
  }

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
      res.end(JSON.stringify({ requests, total: requests.length, filters }));
      return true;
    } catch (error) {
      logger.error(`Failed to get requests: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to get requests' }));
      return true;
    }
  }

  async function handleAnalysis(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const runId = url.searchParams.get('runId');
      if (!runId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'runId parameter is required' }));
        return true;
      }

      const analysis = await service.getDetailedAnalysis(runId);
      
      if (!analysis) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Analysis not found for runId' }));
        return true;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(analysis));
      return true;
    } catch (error) {
      logger.error(`Failed to get analysis: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to get analysis' }));
      return true;
    }
  }

  async function handleSessionAnalysis(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.end('Method Not Allowed');
      return true;
    }

    try {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'sessionId parameter is required' }));
        return true;
      }

      const analysis = await service.getSessionAnalysis(sessionId);
      
      if (!analysis) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Session analysis not found' }));
        return true;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(analysis));
      return true;
    } catch (error) {
      logger.error(`Failed to get session analysis: ${error}`);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Failed to get session analysis' }));
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

    // 生产模式：返回构建的 index.html
    if (isProduction && existsSync(FRONTEND_INDEX_PATH)) {
      try {
        const html = readFileSync(FRONTEND_INDEX_PATH, 'utf-8');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html');
        res.end(html);
        return true;
      } catch (error) {
        logger.error(`Failed to read index.html: ${error}`);
      }
    }

    // 开发模式：返回动态生成的 HTML（向后兼容）
    const html = generateDashboardHTML(config);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html');
    res.end(html);
    return true;
  }

  function convertToCSV(requests: any[]): string {
    const headers = ['ID', 'Type', 'Run ID', 'Session ID', 'Provider', 'Model', 'Timestamp', 'Input Tokens', 'Output Tokens', 'Total Tokens'];
    const rows = requests.map(req => [
      req.id || '', req.type || '', req.runId || '', req.sessionId || '', req.provider || '', req.model || '',
      new Date(req.timestamp).toISOString(), req.usage?.input || '', req.usage?.output || '', req.usage?.total || ''
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
    <title>ContextScope - Request Context Analyzer</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --bg: ${theme === 'dark' ? '#0d1117' : '#ffffff'};
            --bg-secondary: ${theme === 'dark' ? '#161b22' : '#f6f8fa'};
            --text: ${theme === 'dark' ? '#c9d1d9' : '#24292f'};
            --text-secondary: ${theme === 'dark' ? '#8b949e' : '#57606a'};
            --card: ${theme === 'dark' ? '#161b22' : '#ffffff'};
            --border: ${theme === 'dark' ? '#30363d' : '#d0d7de'};
            --primary: #58a6ff;
            --success: #3fb950;
            --warning: #d29922;
            --danger: #f85149;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
        .header h1 { font-size: 1.8rem; font-weight: 600; }
        .status-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; background: rgba(63, 185, 80, 0.15); color: var(--success); border-radius: 100px; font-size: 0.85rem; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .stat-card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 20px; }
        .stat-value { font-size: 2rem; font-weight: 700; color: var(--primary); margin-bottom: 4px; }
        .stat-label { font-size: 0.85rem; color: var(--text-secondary); }
        .controls { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
        .btn { padding: 8px 16px; border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text); border-radius: 6px; cursor: pointer; font-size: 0.9rem; transition: all 0.2s; }
        .btn:hover { background: var(--primary); color: white; border-color: var(--primary); }
        .btn-primary { background: var(--primary); color: white; border-color: var(--primary); }
        .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px; }
        @media (max-width: 1024px) { .grid-2 { grid-template-columns: 1fr; } }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
        .card-header { padding: 16px 20px; background: var(--bg-secondary); border-bottom: 1px solid var(--border); font-weight: 600; }
        .card-body { padding: 20px; }
        .requests-list { max-height: 500px; overflow-y: auto; }
        .request-item { padding: 16px 20px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.2s; }
        .request-item:hover { background: var(--bg-secondary); }
        .request-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .request-provider { font-weight: 600; color: var(--primary); }
        .request-time { font-size: 0.85rem; color: var(--text-secondary); }
        .request-details { display: flex; gap: 16px; font-size: 0.85rem; color: var(--text-secondary); }
        .request-details strong { color: var(--text); }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 100px; font-size: 0.75rem; font-weight: 500; }
        .badge-input { background: rgba(88, 166, 255, 0.15); color: var(--primary); }
        .badge-output { background: rgba(63, 185, 80, 0.15); color: var(--success); }
        .loading, .error, .empty-state { text-align: center; padding: 40px; }
        .error { color: var(--danger); }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7); display: none; align-items: center; justify-content: center; z-index: 1000; }
        .modal-overlay.active { display: flex; }
        .modal { background: var(--card); border: 1px solid var(--border); border-radius: 12px; max-width: 900px; width: 90%; max-height: 90vh; overflow-y: auto; }
        .modal-header { padding: 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .modal-title { font-size: 1.2rem; font-weight: 600; }
        .modal-close { background: none; border: none; color: var(--text-secondary); font-size: 1.5rem; cursor: pointer; }
        .modal-body { padding: 20px; }
        .tabs { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
        .tab { padding: 12px 20px; cursor: pointer; border-bottom: 2px solid transparent; }
        .tab.active { color: var(--primary); border-bottom-color: var(--primary); }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .heatmap-container { display: flex; flex-direction: column; gap: 4px; }
        .heatmap-row { display: flex; gap: 4px; min-height: 40px; }
        .heatmap-cell { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 600; border-radius: 4px; cursor: pointer; position: relative; }
        .heatmap-cell:hover { transform: scale(1.05); z-index: 10; }
        .timeline-point { position: relative; padding-left: 30px; margin-bottom: 20px; }
        .timeline-point::before { content: ''; position: absolute; left: 8px; top: 0; bottom: 0; width: 2px; background: var(--border); }
        .timeline-point::after { content: ''; position: absolute; left: 4px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: var(--primary); }
        .timeline-content { background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; padding: 12px 16px; }
        .graph-nodes { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; }
        .graph-node { background: var(--bg-secondary); border: 2px solid var(--border); border-radius: 8px; padding: 12px 16px; min-width: 150px; text-align: center; }
        .graph-node.success { border-color: var(--success); }
        .graph-node.error { border-color: var(--danger); }
        .insight-item { padding: 16px; border-radius: 6px; margin-bottom: 12px; border-left: 4px solid; }
        .insight-warning { background: rgba(210, 153, 34, 0.1); border-left-color: var(--warning); }
        .insight-info { background: rgba(88, 166, 255, 0.1); border-left-color: var(--primary); }
        .insight-optimization { background: rgba(188, 140, 255, 0.1); border-left-color: #bc8cff; }
        .progress-bar { height: 8px; background: var(--bg-secondary); border-radius: 4px; overflow: hidden; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, var(--primary), #bc8cff); }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 ContextScope</h1>
            <div class="status-badge"><div class="status-dot"></div>Live</div>
        </div>
        <div class="stats-grid" id="stats-grid"><div class="loading">Loading...</div></div>
        <div class="controls">
            <button class="btn btn-primary" onclick="refreshData()">🔄 Refresh</button>
            <button class="btn" onclick="exportData('json')">📥 Export JSON</button>
            <button class="btn" onclick="exportData('csv')">📊 Export CSV</button>
        </div>
        <div class="grid-2">
            <div class="card"><div class="card-header">📊 Token Distribution</div><div class="card-body"><canvas id="tokenChart" height="200"></canvas></div></div>
            <div class="card"><div class="card-header">📈 Hourly Requests</div><div class="card-body"><canvas id="hourlyChart" height="200"></canvas></div></div>
        </div>
        <div class="card"><div class="card-header">📋 Recent Requests</div><div class="requests-list" id="requests-list"><div class="loading">Loading...</div></div></div>
    </div>
    <div class="modal-overlay" id="analysis-modal">
        <div class="modal">
            <div class="modal-header"><h2 class="modal-title" id="modal-title">Analysis</h2><button class="modal-close" onclick="closeModal()">&times;</button></div>
            <div class="modal-body">
                <div class="tabs">
                    <div class="tab active" onclick="switchTab('token')">Token Analysis</div>
                    <div class="tab" onclick="switchTab('heatmap')">Heatmap</div>
                    <div class="tab" onclick="switchTab('timeline')">Timeline</div>
                    <div class="tab" onclick="switchTab('graph')">Dependency Graph</div>
                    <div class="tab" onclick="switchTab('insights')">Insights</div>
                </div>
                <div id="tab-token" class="tab-content active"><canvas id="tokenDetailChart" height="300"></canvas></div>
                <div id="tab-heatmap" class="tab-content"><div class="heatmap-container" id="heatmap-container"></div></div>
                <div id="tab-timeline" class="tab-content"><div id="timeline-container"></div></div>
                <div id="tab-graph" class="tab-content"><div class="graph-nodes" id="graph-nodes"></div></div>
                <div id="tab-insights" class="tab-content" id="insights-container"></div>
            </div>
        </div>
    </div>
    <script>
        let currentFilters = {}, refreshTimer = null, tokenChart = null, hourlyChart = null, tokenDetailChart = null, currentAnalysis = null;

        async function loadStats() {
            try {
                const response = await fetch('/plugins/contextscope/api/stats');
                const data = await response.json();
                if (data.error) { document.getElementById('stats-grid').innerHTML = '<div class="error">Error: ' + data.error + '</div>'; return; }
                const stats = data.stats, storage = data.storage;
                document.getElementById('stats-grid').innerHTML = 
                    '<div class="stat-card"><div class="stat-value">' + stats.totalRequests.toLocaleString() + '</div><div class="stat-label">Total Requests</div></div>' +
                    '<div class="stat-card"><div class="stat-value">' + stats.todayRequests + '</div><div class="stat-label">Today</div></div>' +
                    '<div class="stat-card"><div class="stat-value">' + stats.weekRequests + '</div><div class="stat-label">This Week</div></div>' +
                    '<div class="stat-card"><div class="stat-value">' + stats.averageTokens.toLocaleString() + '</div><div class="stat-label">Avg Tokens</div></div>' +
                    '<div class="stat-card"><div class="stat-value">$' + stats.totalCost.toFixed(2) + '</div><div class="stat-label">Est. Cost</div></div>' +
                    '<div class="stat-card"><div class="stat-value">' + storage.storageSize + '</div><div class="stat-label">Storage</div></div>';
                updateCharts(stats);
            } catch (error) { document.getElementById('stats-grid').innerHTML = '<div class="error">Failed: ' + error.message + '</div>'; }
        }

        function updateCharts(stats) {
            const tokenCtx = document.getElementById('tokenChart').getContext('2d');
            if (tokenChart) tokenChart.destroy();
            tokenChart = new Chart(tokenCtx, { type: 'doughnut', data: { labels: Object.keys(stats.byProvider), datasets: [{ data: Object.values(stats.byProvider), backgroundColor: ['#58a6ff','#3fb950','#d29922','#f85149','#bc8cff','#36A2EB','#FFCE56','#4BC0C0'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: getComputedStyle(document.body).getPropertyValue('--text') } } } } });
            const hourlyCtx = document.getElementById('hourlyChart').getContext('2d');
            if (hourlyChart) hourlyChart.destroy();
            hourlyChart = new Chart(hourlyCtx, { type: 'bar', data: { labels: Array.from({length: 24}, (_, i) => i + ':00'), datasets: [{ label: 'Requests', data: stats.hourlyDistribution, backgroundColor: '#58a6ff', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary') }, grid: { color: getComputedStyle(document.body).getPropertyValue('--border') } }, x: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary') }, grid: { display: false } } }, plugins: { legend: { display: false } } } });
        }

        async function loadRequests() {
            try {
                const params = new URLSearchParams({ ...currentFilters, limit: 20 });
                const response = await fetch('/plugins/contextscope/api/requests?' + params);
                const data = await response.json();
                if (data.error) { document.getElementById('requests-list').innerHTML = '<div class="error">Error: ' + data.error + '</div>'; return; }
                const requests = data.requests;
                if (requests.length === 0) { document.getElementById('requests-list').innerHTML = '<div class="empty-state">No requests</div>'; return; }
                let html = '';
                requests.forEach(req => {
                    const time = new Date(req.timestamp).toLocaleString();
                    const usage = req.usage || {};
                    html += '<div class="request-item" onclick="showAnalysis(\\'' + req.runId + '\\')"><div class="request-header"><span class="request-provider">' + req.provider + ' / ' + req.model + '</span><span class="request-time">' + time + '</span></div><div class="request-details"><span class="badge badge-' + req.type + '">' + (req.type === 'input' ? 'Input' : 'Output') + '</span><span>Token: <strong>' + (usage.total?.toLocaleString() || 0) + '</strong></span><span>In: <strong>' + (usage.input?.toLocaleString() || 0) + '</strong></span><span>Out: <strong>' + (usage.output?.toLocaleString() || 0) + '</strong></span></div></div>';
                });
                document.getElementById('requests-list').innerHTML = html;
            } catch (error) { document.getElementById('requests-list').innerHTML = '<div class="error">Failed: ' + error.message + '</div>'; }
        }

        async function showAnalysis(runId) {
            try {
                const response = await fetch('/plugins/contextscope/api/analysis?runId=' + runId);
                const analysis = await response.json();
                if (analysis.error) { alert('Failed: ' + analysis.error); return; }
                currentAnalysis = analysis;
                document.getElementById('modal-title').textContent = 'Analysis: ' + analysis.provider + ' / ' + analysis.model;
                const tokenDetailCtx = document.getElementById('tokenDetailChart').getContext('2d');
                if (tokenDetailChart) tokenDetailChart.destroy();
                tokenDetailChart = new Chart(tokenDetailCtx, { type: 'bar', data: { labels: analysis.tokenBreakdown.labels, datasets: [{ label: 'Tokens', data: analysis.tokenBreakdown.values, backgroundColor: analysis.tokenBreakdown.colors, borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary') }, grid: { color: getComputedStyle(document.body).getPropertyValue('--border') } }, x: { ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary') }, grid: { display: false } } } } });
                renderHeatmap(analysis.heatmap);
                renderTimeline(analysis.timeline);
                renderDependencyGraph(analysis.dependencyGraph);
                renderInsights(analysis.insights);
                document.getElementById('analysis-modal').classList.add('active');
                switchTab('token');
            } catch (error) { alert('Failed: ' + error.message); }
        }

        function renderHeatmap(heatmap) {
            const container = document.getElementById('heatmap-container');
            if (!heatmap.messages || heatmap.messages.length === 0) { container.innerHTML = '<div class="empty-state">No message data</div>'; return; }
            const rows = [];
            for (let i = 0; i < heatmap.messages.length; i += 10) rows.push(heatmap.messages.slice(i, i + 10));
            let html = '';
            rows.forEach(row => {
                html += '<div class="heatmap-row">';
                row.forEach(msg => {
                    const intensity = msg.impact / heatmap.maxImpact;
                    const r = Math.round(88 + (210 - 88) * intensity);
                    const g = Math.round(166 + (153 - 166) * intensity);
                    const b = Math.round(255 + (34 - 255) * intensity);
                    html += '<div class="heatmap-cell" style="background: rgb(' + r + ',' + g + ',' + b + ');" title="Role: ' + msg.role + ', Tokens: ' + msg.tokens + ', Impact: ' + msg.impact + '">' + msg.tokens + '</div>';
                });
                html += '</div>';
            });
            container.innerHTML = html;
        }

        function renderTimeline(timeline) {
            const container = document.getElementById('timeline-container');
            if (!timeline.points || timeline.points.length === 0) { container.innerHTML = '<div class="empty-state">No timeline data</div>'; return; }
            let html = '';
            timeline.points.forEach(point => {
                const time = new Date(point.timestamp).toLocaleString();
                const cls = point.utilization > 0.9 ? 'danger' : point.utilization > 0.7 ? 'warning' : '';
                html += '<div class="timeline-point ' + cls + '"><div class="timeline-content"><div style="font-size:0.8rem;color:var(--text-secondary);">' + time + '</div><div style="display:flex;gap:16px;font-size:0.85rem;"><span>Tokens: <strong>' + point.tokens.toLocaleString() + '</strong></span><span>Messages: <strong>' + point.messages + '</strong></span><span>Utilization: <strong>' + Math.round(point.utilization * 100) + '%</strong></span></div><div class="progress-bar" style="margin-top:8px;"><div class="progress-fill" style="width:' + Math.min(100, point.utilization * 100) + '%"></div></div></div></div>';
            });
            container.innerHTML = html;
        }

        function renderDependencyGraph(graph) {
            const container = document.getElementById('graph-nodes');
            if (!graph.nodes || graph.nodes.length === 0) { container.innerHTML = '<div class="empty-state">No tool call data</div>'; return; }
            let html = '';
            graph.nodes.forEach(node => {
                html += '<div class="graph-node ' + node.status + '"><div style="font-weight:600;margin-bottom:8px;">' + node.label + '</div><div style="font-size:0.8rem;color:var(--text-secondary);"><div>Tokens: ' + node.tokens.toLocaleString() + '</div><div>Duration: ' + node.duration + 'ms</div><div>Status: ' + (node.status === 'success' ? '✅' : node.status === 'error' ? '❌' : '⏳') + '</div></div></div>';
            });
            container.innerHTML = html;
        }

        function renderInsights(insights) {
            const container = document.getElementById('insights-container');
            if (!insights || insights.length === 0) { container.innerHTML = '<div class="empty-state">No insights</div>'; return; }
            let html = '';
            insights.forEach(insight => {
                const cls = insight.type === 'warning' ? 'insight-warning' : insight.type === 'optimization' ? 'insight-optimization' : 'insight-info';
                const icon = insight.type === 'warning' ? '⚠️' : insight.type === 'optimization' ? '💡' : 'ℹ️';
                html += '<div class="insight-item ' + cls + '"><div style="font-weight:600;margin-bottom:4px;">' + icon + ' ' + insight.title + '</div><div style="font-size:0.9rem;color:var(--text-secondary);">' + insight.description + '</div></div>';
            });
            container.innerHTML = html;
        }

        function closeModal() { document.getElementById('analysis-modal').classList.remove('active'); currentAnalysis = null; }
        function switchTab(tabName) { document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active')); event.target.classList.add('active'); document.getElementById('tab-' + tabName).classList.add('active'); }
        function refreshData() { loadStats(); loadRequests(); }
        function exportData(format) { window.open('/plugins/contextscope/api/export?format=' + format, '_blank'); }
        document.getElementById('analysis-modal').addEventListener('click', function(e) { if (e.target === this) closeModal(); });
        refreshData();
        ${autoRefresh ? 'if (refreshTimer) clearInterval(refreshTimer); refreshTimer = setInterval(refreshData, ' + refreshInterval + ');' : ''}
    </script>
</body>
</html>`;
  }
}
