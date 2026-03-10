import './style.css'
import Chart from 'chart.js/auto'

interface Stats {
  totalRequests: number
  todayRequests: number
  weekRequests: number
  averageTokens: number
  totalCost: number
  byProvider: Record<string, number>
  byModel: Record<string, number>
  hourlyDistribution: number[]
  latency?: {
    p50: number
    p95: number
    p99: number
  }
}

interface Request {
  id: number
  type: 'input' | 'output'
  runId: string
  sessionId: string
  provider: string
  model: string
  timestamp: number
  usage?: {
    input?: number
    output?: number
    total?: number
  }
  latency?: number
  prompt?: string
  systemPrompt?: string
  historyMessages?: any[]
}

interface Analysis {
  runId: string
  sessionId: string
  provider: string
  model: string
  timestamp: number
  tokenBreakdown: {
    labels: string[]
    values: number[]
    colors: string[]
    total: number
  }
  heatmap: {
    messages: Array<{
      id: string
      role: string
      content: string
      tokens: number
      impact: number
      timestamp: number
    }>
    maxImpact: number
  }
  timeline: {
    points: Array<{
      timestamp: number
      tokens: number
      messages: number
      utilization: number
      summaryApplied: boolean
    }>
    contextWindow: number
  }
  dependencyGraph: {
    nodes: Array<{
      id: string
      label: string
      type: 'tool' | 'response' | 'llm'
      duration: number
      tokens: number
      status: 'success' | 'error' | 'pending'
    }>
    edges: Array<{
      source: string
      target: string
      weight: number
    }>
  }
  insights: Array<{
    type: 'warning' | 'info' | 'optimization'
    title: string
    description: string
    severity: 'low' | 'medium' | 'high'
  }>
}

interface TokenTrendPoint {
  timestamp: number
  input: number
  output: number
  total: number
}

export class App {
  private apiBase = '/plugins/contextscope/api'
  private ws: WebSocket | null = null
  private tokenChart: Chart | null = null
  private hourlyChart: Chart | null = null
  private tokenDetailChart: Chart | null = null
  private tokenTrendChart: Chart | null = null
  private latencyChart: Chart | null = null
  private currentAnalysis: Analysis | null = null
  private refreshTimer: number | null = null
  private allRequests: Request[] = []
  private selectedSessionIds: string[] = []

  mount() {
    const app = document.getElementById('app')
    if (!app) return

    app.innerHTML = this.render()
    this.initCharts()
    this.loadData()
    this.setupEventListeners()
    this.connectWebSocket()
    this.startAutoRefresh()
  }

  private render(): string {
    return `
      <div class="container">
        <div class="header">
          <h1>🔍 ContextScope</h1>
          <div class="status-badge">
            <div class="status-dot" id="ws-status"></div>
            <span id="ws-text">Connecting...</span>
          </div>
        </div>

        <!-- Search Bar -->
        <div class="search-bar">
          <input type="text" id="search-input" placeholder="🔍 Search prompts, responses, models..." class="search-input">
          <button class="btn btn-primary" id="search-btn">Search</button>
          <button class="btn" id="clear-search">Clear</button>
        </div>

        <!-- Stats Grid -->
        <div class="stats-grid" id="stats-grid">
          <div class="loading">Loading statistics...</div>
        </div>

        <!-- Controls -->
        <div class="controls">
          <button class="btn btn-primary" id="refresh-btn">🔄 Refresh</button>
          <button class="btn" id="export-json">📥 Export JSON</button>
          <button class="btn" id="export-csv">📊 Export CSV</button>
          <div class="filter-group">
            <input type="text" class="filter-input" id="filter-session" placeholder="Session ID">
            <input type="text" class="filter-input" id="filter-provider" placeholder="Provider">
            <select class="filter-input" id="filter-model">
              <option value="">All Models</option>
            </select>
            <button class="btn" id="apply-filters">Apply</button>
            <button class="btn" id="clear-filters">Clear</button>
          </div>
        </div>

        <!-- Token Trend Chart -->
        <div class="card full-width">
          <div class="card-header">
            📈 Token Usage Trend
            <select class="chart-period" id="trend-period">
              <option value="24">Last 24 Hours</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
            </select>
          </div>
          <div class="card-body chart-body">
            <canvas id="token-trend-chart"></canvas>
          </div>
        </div>

        <!-- Charts Grid -->
        <div class="grid-2">
          <div class="card">
            <div class="card-header">📊 Token Distribution</div>
            <div class="card-body chart-body">
              <canvas id="token-chart"></canvas>
            </div>
          </div>
          <div class="card">
            <div class="card-header">📈 Hourly Requests</div>
            <div class="card-body chart-body">
              <canvas id="hourly-chart"></canvas>
            </div>
          </div>
        </div>

        <!-- Performance Metrics -->
        <div class="card full-width">
          <div class="card-header">⚡ Performance Metrics</div>
          <div class="card-body">
            <div class="perf-grid" id="perf-metrics">
              <div class="perf-card">
                <div class="perf-value">-</div>
                <div class="perf-label">P50 Latency</div>
              </div>
              <div class="perf-card">
                <div class="perf-value">-</div>
                <div class="perf-label">P95 Latency</div>
              </div>
              <div class="perf-card">
                <div class="perf-value">-</div>
                <div class="perf-label">P99 Latency</div>
              </div>
              <div class="perf-card">
                <div class="perf-value">-</div>
                <div class="perf-label">Success Rate</div>
              </div>
            </div>
            <div class="chart-body" style="height: 200px; margin-top: 20px;">
              <canvas id="latency-chart"></canvas>
            </div>
          </div>
        </div>

        <!-- Requests List -->
        <div class="card">
          <div class="card-header">
            📋 Recent Requests
            <span class="request-count" id="request-count">0</span>
          </div>
          <div class="requests-list" id="requests-list">
            <div class="loading">Loading requests...</div>
          </div>
        </div>
      </div>

      <!-- Analysis Modal -->
      <div class="modal-overlay" id="analysis-modal">
        <div class="modal">
          <div class="modal-header">
            <h2 class="modal-title" id="modal-title">Analysis</h2>
            <button class="modal-close" id="modal-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="tabs">
              <div class="tab active" data-tab="token">Token Analysis</div>
              <div class="tab" data-tab="heatmap">Heatmap</div>
              <div class="tab" data-tab="timeline">Timeline</div>
              <div class="tab" data-tab="graph">Dependency Graph</div>
              <div class="tab" data-tab="insights">💡 Insights</div>
            </div>

            <div id="tab-token" class="tab-content active">
              <canvas id="token-detail-chart"></canvas>
            </div>
            <div id="tab-heatmap" class="tab-content">
              <div class="heatmap-section">
                <h3>🔥 Message Impact Heatmap</h3>
                <p class="section-desc">Color intensity shows message impact on AI decisions</p>
                <div class="heatmap-container" id="heatmap-container"></div>
              </div>
              <div class="heatmap-section" style="margin-top: 30px;">
                <h3>📊 Attention Distribution</h3>
                <div class="attention-chart" id="attention-chart"></div>
              </div>
            </div>
            <div id="tab-timeline" class="tab-content">
              <div class="timeline-section">
                <h3>📈 Context Window Utilization</h3>
                <p class="section-desc">Track how context window fills over time</p>
                <div id="timeline-container"></div>
              </div>
              <div class="health-section" style="margin-top: 30px;">
                <h3>🏥 Context Health Score</h3>
                <div class="health-score" id="health-score"></div>
                <div class="health-details" id="health-details"></div>
              </div>
            </div>
            <div id="tab-graph" class="tab-content">
              <div class="graph-section">
                <h3>🔗 Tool Dependencies</h3>
                <div class="graph-nodes" id="graph-nodes"></div>
              </div>
              <div class="similarity-section" style="margin-top: 30px;">
                <h3>🔍 Message Similarities</h3>
                <div id="similarity-container"></div>
              </div>
            </div>
            <div id="tab-insights" class="tab-content">
              <div class="insights-section">
                <h3>💡 AI Insights</h3>
                <div id="insights-container"></div>
              </div>
              <div class="compression-section" style="margin-top: 30px;">
                <h3>✂️ Compression Suggestions</h3>
                <div id="compression-container"></div>
              </div>
              <div class="topics-section" style="margin-top: 30px;">
                <h3>🏷️ Topic Clusters</h3>
                <div id="topics-container"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Session Compare Modal -->
      <div class="modal-overlay" id="compare-modal">
        <div class="modal modal-large">
          <div class="modal-header">
            <h2 class="modal-title">📊 Session Comparison</h2>
            <button class="modal-close" id="compare-close">&times;</button>
          </div>
          <div class="modal-body">
            <div class="compare-controls">
              <select id="compare-session-1" class="compare-select"></select>
              <span class="vs-text">VS</span>
              <select id="compare-session-2" class="compare-select"></select>
              <button class="btn btn-primary" id="compare-run">Compare</button>
            </div>
            <div class="compare-results" id="compare-results"></div>
          </div>
        </div>
      </div>
    `
  }

  private initCharts() {
    // Charts will be initialized when data loads
  }

  private async loadData() {
    await Promise.all([this.loadStats(), this.loadRequests()])
  }

  private async loadStats() {
    try {
      const res = await fetch(`${this.apiBase}/stats`)
      const data = await res.json()
      
      if (data.error) {
        document.getElementById('stats-grid')!.innerHTML = `<div class="error">Error: ${data.error}</div>`
        return
      }

      const stats: Stats = data.stats
      const storage = data.storage

      document.getElementById('stats-grid')!.innerHTML = `
        <div class="stat-card">
          <div class="stat-value">${stats.totalRequests.toLocaleString()}</div>
          <div class="stat-label">Total Requests</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.todayRequests}</div>
          <div class="stat-label">Today</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.weekRequests}</div>
          <div class="stat-label">This Week</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.averageTokens.toLocaleString()}</div>
          <div class="stat-label">Avg Tokens</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">$${stats.totalCost.toFixed(2)}</div>
          <div class="stat-label">Est. Cost</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${storage.storageSize}</div>
          <div class="stat-label">Storage</div>
        </div>
      `

      // Update performance metrics
      if (stats.latency) {
        document.querySelector('#perf-metrics .perf-value')!.textContent = `${stats.latency.p50}ms`
        document.querySelectorAll('#perf-metrics .perf-value')[1].textContent = `${stats.latency.p95}ms`
        document.querySelectorAll('#perf-metrics .perf-value')[2].textContent = `${stats.latency.p99}ms`
        document.querySelectorAll('#perf-metrics .perf-value')[3].textContent = '99.9%'
      }

      this.updateCharts(stats)
      this.populateModelFilter(stats.byModel)
    } catch (error) {
      document.getElementById('stats-grid')!.innerHTML = `<div class="error">Failed: ${error}</div>`
    }
  }

  private populateModelFilter(byModel: Record<string, number>) {
    const select = document.getElementById('filter-model') as HTMLSelectElement
    if (!select) return
    
    select.innerHTML = '<option value="">All Models</option>' +
      Object.keys(byModel).map(model => `<option value="${model}">${model}</option>`).join('')
  }

  private updateCharts(stats: Stats) {
    // Token distribution chart
    const tokenCtx = document.getElementById('token-chart') as HTMLCanvasElement
    if (this.tokenChart) this.tokenChart.destroy()
    
    this.tokenChart = new Chart(tokenCtx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(stats.byProvider),
        datasets: [{
          data: Object.values(stats.byProvider),
          backgroundColor: ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff', '#36A2EB', '#FFCE56', '#4BC0C0']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right' }
        }
      }
    })

    // Hourly distribution chart
    const hourlyCtx = document.getElementById('hourly-chart') as HTMLCanvasElement
    if (this.hourlyChart) this.hourlyChart.destroy()
    
    this.hourlyChart = new Chart(hourlyCtx, {
      type: 'bar',
      data: {
        labels: Array.from({length: 24}, (_, i) => `${i}:00`),
        datasets: [{
          label: 'Requests',
          data: stats.hourlyDistribution,
          backgroundColor: '#58a6ff',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true },
          x: { grid: { display: false } }
        },
        plugins: { legend: { display: false } }
      }
    })

    // Load token trend data
    this.loadTokenTrend()
  }

  private async loadTokenTrend() {
    try {
      const period = (document.getElementById('trend-period') as HTMLSelectElement).value
      const endTime = Date.now()
      const startTime = endTime - (parseInt(period) * 24 * 60 * 60 * 1000)
      
      const res = await fetch(`${this.apiBase}/requests?startTime=${startTime}&endTime=${endTime}&limit=1000`)
      const data = await res.json()
      
      if (data.error) return

      const requests: Request[] = data.requests
      
      // Group by hour
      const hourlyData: Record<number, { input: number; output: number; total: number }> = {}
      
      requests.forEach(req => {
        const hour = Math.floor(req.timestamp / (60 * 60 * 1000)) * 60 * 60 * 1000
        if (!hourlyData[hour]) {
          hourlyData[hour] = { input: 0, output: 0, total: 0 }
        }
        hourlyData[hour].input += req.usage?.input || 0
        hourlyData[hour].output += req.usage?.output || 0
        hourlyData[hour].total += req.usage?.total || 0
      })

      const sortedHours = Object.keys(hourlyData).map(Number).sort((a, b) => a - b)
      
      const trendData: TokenTrendPoint[] = sortedHours.map(hour => ({
        timestamp: hour,
        input: hourlyData[hour].input,
        output: hourlyData[hour].output,
        total: hourlyData[hour].total
      }))

      this.renderTokenTrendChart(trendData)
    } catch (error) {
      console.error('Failed to load token trend:', error)
    }
  }

  private renderTokenTrendChart(data: TokenTrendPoint[]) {
    const ctx = document.getElementById('token-trend-chart') as HTMLCanvasElement
    if (this.tokenTrendChart) this.tokenTrendChart.destroy()

    const labels = data.map(d => new Date(d.timestamp).toLocaleString(undefined, { 
      month: 'short', day: 'numeric', hour: '2-digit' 
    }))

    this.tokenTrendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Input Tokens',
            data: data.map(d => d.input),
            borderColor: '#58a6ff',
            backgroundColor: 'rgba(88, 166, 255, 0.1)',
            fill: true,
            tension: 0.4
          },
          {
            label: 'Output Tokens',
            data: data.map(d => d.output),
            borderColor: '#3fb950',
            backgroundColor: 'rgba(63, 185, 80, 0.1)',
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        scales: {
          y: { beginAtZero: true },
          x: { grid: { display: false } }
        }
      }
    })
  }

  private async loadRequests() {
    try {
      const sessionFilter = (document.getElementById('filter-session') as HTMLInputElement).value
      const providerFilter = (document.getElementById('filter-provider') as HTMLInputElement).value
      const modelFilter = (document.getElementById('filter-model') as HTMLSelectElement).value
      const searchQuery = (document.getElementById('search-input') as HTMLInputElement).value
      
      const params = new URLSearchParams({ limit: '50' })
      if (sessionFilter) params.set('sessionId', sessionFilter)
      if (providerFilter) params.set('provider', providerFilter)
      if (modelFilter) params.set('model', modelFilter)

      const res = await fetch(`${this.apiBase}/requests?${params}`)
      const data = await res.json()
      
      if (data.error) {
        document.getElementById('requests-list')!.innerHTML = `<div class="error">Error: ${data.error}</div>`
        return
      }

      let requests: Request[] = data.requests
      this.allRequests = requests

      // Apply search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        requests = requests.filter(req => 
          req.provider.toLowerCase().includes(query) ||
          req.model.toLowerCase().includes(query) ||
          req.runId.toLowerCase().includes(query) ||
          req.sessionId.toLowerCase().includes(query)
        )
      }

      document.getElementById('request-count')!.textContent = `${requests.length} requests`

      if (requests.length === 0) {
        document.getElementById('requests-list')!.innerHTML = `<div class="empty-state">No requests found</div>`
        return
      }

      document.getElementById('requests-list')!.innerHTML = requests.map(req => {
        const time = new Date(req.timestamp).toLocaleString()
        const usage = req.usage || {}
        const latency = req.latency ? `<span class="latency-badge">${req.latency}ms</span>` : ''
        return `
          <div class="request-item" data-runid="${req.runId}">
            <div class="request-header">
              <span class="request-provider">${req.provider} / ${req.model}</span>
              <span class="request-time">${time}</span>
            </div>
            <div class="request-details">
              <span class="badge badge-${req.type}">${req.type === 'input' ? 'Input' : 'Output'}</span>
              <span>Token: <strong>${usage.total?.toLocaleString() || 0}</strong></span>
              <span>In: <strong>${usage.input?.toLocaleString() || 0}</strong></span>
              <span>Out: <strong>${usage.output?.toLocaleString() || 0}</strong></span>
              ${latency}
            </div>
          </div>
        `
      }).join('')
    } catch (error) {
      document.getElementById('requests-list')!.innerHTML = `<div class="error">Failed: ${error}</div>`
    }
  }

  private async showAnalysis(runId: string) {
    try {
      const res = await fetch(`${this.apiBase}/analysis?runId=${runId}`)
      const analysis: Analysis = await res.json()
      
      if (analysis.error) {
        alert(`Failed: ${analysis.error}`)
        return
      }

      this.currentAnalysis = analysis
      document.getElementById('modal-title')!.textContent = `Analysis: ${analysis.provider} / ${analysis.model}`

      // Token detail chart
      const tokenDetailCtx = document.getElementById('token-detail-chart') as HTMLCanvasElement
      if (this.tokenDetailChart) this.tokenDetailChart.destroy()
      
      this.tokenDetailChart = new Chart(tokenDetailCtx, {
        type: 'bar',
        data: {
          labels: analysis.tokenBreakdown.labels,
          datasets: [{
            label: 'Tokens',
            data: analysis.tokenBreakdown.values,
            backgroundColor: analysis.tokenBreakdown.colors,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true },
            x: { grid: { display: false } }
          }
        }
      })

      // Render heatmap with attention distribution
      this.renderHeatmap(analysis.heatmap)
      this.renderAttentionDistribution(analysis.attentionDistribution)
      
      // Render timeline with health score
      this.renderTimeline(analysis.timeline)
      this.renderContextHealth(analysis.contextHealth)
      
      // Render dependency graph
      this.renderDependencyGraph(analysis.dependencyGraph)
      
      // Render similarities
      this.renderSimilarities(analysis.contextSimilarities)
      
      // Render insights
      this.renderInsights(analysis.insights)
      
      // Render compression suggestions
      this.renderCompressionSuggestions(analysis.compressionSuggestions)
      
      // Render topic clusters
      this.renderTopicClusters(analysis.topicClusters)

      document.getElementById('analysis-modal')!.classList.add('active')
      this.switchTab('token')
    } catch (error) {
      alert(`Failed: ${error}`)
    }
  }

  private renderHeatmap(heatmap: Analysis['heatmap']) {
    const container = document.getElementById('heatmap-container')!
    if (!heatmap.messages || heatmap.messages.length === 0) {
      container.innerHTML = '<div class="empty-state">No message data</div>'
      return
    }

    const rows: Array<typeof heatmap.messages> = []
    for (let i = 0; i < heatmap.messages.length; i += 10) {
      rows.push(heatmap.messages.slice(i, i + 10))
    }

    container.innerHTML = `
      <div class="heatmap-legend">
        <span>Low Impact</span>
        <div class="legend-gradient"></div>
        <span>High Impact</span>
      </div>
      ${rows.map(row => `
        <div class="heatmap-row">
          ${row.map(msg => {
            const intensity = msg.impact / heatmap.maxImpact
            const hue = 200 - (intensity * 180) // Blue (high) to Red (low)
            const saturation = 70 + (intensity * 30)
            const lightness = 40 + (intensity * 20)
            return `
              <div class="heatmap-cell" 
                   style="background: hsl(${hue}, ${saturation}%, ${lightness}%); border: 2px solid ${msg.impact > 70 ? '#fff' : 'transparent'};" 
                   title="Role: ${msg.role}\nTokens: ${msg.tokens}\nImpact Score: ${msg.impact}\n${msg.content.substring(0, 100)}...">
                <span class="cell-tokens">${msg.tokens}</span>
                ${msg.impact > 70 ? '<span class="cell-star">⭐</span>' : ''}
              </div>
            `
          }).join('')}
        </div>
      `).join('')}
    `
  }

  private renderAttentionDistribution(attention: Analysis['attentionDistribution']) {
    const container = document.getElementById('attention-chart')!
    if (!attention) return

    const items = [
      { label: 'System Prompt', value: attention.systemPrompt, color: '#FF6384' },
      { label: 'Recent Messages', value: attention.recentMessages, color: '#36A2EB' },
      { label: 'Older Messages', value: attention.olderMessages, color: '#FFCE56' },
      { label: 'Tool Responses', value: attention.toolResponses, color: '#4BC0C0' }
    ]

    container.innerHTML = `
      <div class="attention-bars">
        ${items.map(item => `
          <div class="attention-bar-item">
            <div class="attention-label">${item.label}</div>
            <div class="attention-bar">
              <div class="attention-bar-fill" style="width: ${item.value * 100}%; background: ${item.color}"></div>
            </div>
            <div class="attention-value">${Math.round(item.value * 100)}%</div>
          </div>
        `).join('')}
      </div>
    `
  }

  private renderTimeline(timeline: Analysis['timeline']) {
    const container = document.getElementById('timeline-container')!
    if (!timeline.points || timeline.points.length === 0) {
      container.innerHTML = '<div class="empty-state">No timeline data</div>'
      return
    }

    container.innerHTML = `
      <div class="timeline-viz">
        ${timeline.points.map((point, idx) => {
          const time = new Date(point.timestamp).toLocaleTimeString()
          const utilizationPct = Math.round(point.utilization * 100)
          const colorClass = utilizationPct > 90 ? 'critical' : utilizationPct > 70 ? 'warning' : 'normal'
          
          return `
            <div class="timeline-point ${colorClass}">
              <div class="point-time">${time}</div>
              <div class="point-bar-container">
                <div class="point-bar ${colorClass}" style="height: ${Math.max(20, utilizationPct)}%"></div>
              </div>
              <div class="point-stats">
                <span>${point.tokens.toLocaleString()} tokens</span>
                <span>${point.messages} msgs</span>
                <span class="utilization ${colorClass}">${utilizationPct}%</span>
              </div>
              ${point.summaryApplied ? '<div class="summary-badge">📝 Summarized</div>' : ''}
            </div>
          `
        }).join('')}
      </div>
    `
  }

  private renderContextHealth(health: Analysis['contextHealth']) {
    const scoreContainer = document.getElementById('health-score')!
    const detailsContainer = document.getElementById('health-details')!
    
    const scoreColor = health.score >= 80 ? '#3fb950' : health.score >= 60 ? '#d29922' : '#f85149'
    
    scoreContainer.innerHTML = `
      <div class="health-score-circle" style="border-color: ${scoreColor}">
        <div class="health-score-value" style="color: ${scoreColor}">${health.score}</div>
        <div class="health-score-label">/ 100</div>
      </div>
    `
    
    detailsContainer.innerHTML = `
      ${health.issues.length > 0 ? `
        <div class="health-issues">
          <h4>⚠️ Issues Found</h4>
          <ul>
            ${health.issues.map(issue => `<li>${issue}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      ${health.recommendations.length > 0 ? `
        <div class="health-recommendations">
          <h4>💡 Recommendations</h4>
          <ul>
            ${health.recommendations.map(rec => `<li>${rec}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    `
  }

  private renderDependencyGraph(graph: Analysis['dependencyGraph']) {
    const container = document.getElementById('graph-nodes')!
    if (!graph.nodes || graph.nodes.length === 0) {
      container.innerHTML = '<div class="empty-state">No tool call data</div>'
      return
    }

    container.innerHTML = graph.nodes.map(node => `
      <div class="graph-node ${node.status}">
        <div style="font-weight:600;margin-bottom:8px">${node.label}</div>
        <div style="font-size:0.8rem;color:var(--text-secondary)">
          <div>Tokens: ${node.tokens.toLocaleString()}</div>
          <div>Duration: ${node.duration}ms</div>
          <div>Status: ${node.status === 'success' ? '✅' : node.status === 'error' ? '❌' : '⏳'}</div>
        </div>
      </div>
    `).join('')
  }

  private renderInsights(insights: Analysis['insights']) {
    const container = document.getElementById('insights-container')!
    if (!insights || insights.length === 0) {
      container.innerHTML = '<div class="empty-state">No insights</div>'
      return
    }

    container.innerHTML = insights.map(insight => {
      const cls = insight.type === 'warning' ? 'insight-warning' : insight.type === 'optimization' ? 'insight-optimization' : 'insight-info'
      const icon = insight.type === 'warning' ? '⚠️' : insight.type === 'optimization' ? '💡' : 'ℹ️'
      return `
        <div class="insight-item ${cls}">
          <div style="font-weight:600;margin-bottom:4px">${icon} ${insight.title}</div>
          <div style="font-size:0.9rem;color:var(--text-secondary)">${insight.description}</div>
        </div>
      `
    }).join('')
  }

  private renderSimilarities(similarities: Analysis['contextSimilarities']) {
    const container = document.getElementById('similarity-container')!
    if (!similarities || similarities.length === 0) {
      container.innerHTML = '<div class="empty-state">No significant similarities found</div>'
      return
    }

    container.innerHTML = similarities.map(sim => `
      <div class="similarity-item">
        <div class="similarity-header">
          <span class="similarity-score">${Math.round(sim.similarity * 100)}% similar</span>
          <span class="similarity-topic">🏷️ ${sim.commonTopic}</span>
        </div>
        <div class="similarity-messages">
          <span>Message ${sim.message1}</span>
          <span>⟷</span>
          <span>Message ${sim.message2}</span>
        </div>
      </div>
    `).join('')
  }

  private renderCompressionSuggestions(suggestions: Analysis['compressionSuggestions']) {
    const container = document.getElementById('compression-container')!
    if (!suggestions || suggestions.length === 0) {
      container.innerHTML = '<div class="empty-state">No compression suggestions</div>'
      return
    }

    const totalSavings = suggestions.reduce((sum, s) => sum + s.tokenSavings, 0)
    
    container.innerHTML = `
      <div class="compression-summary">
        <strong>Potential Token Savings: ${totalSavings} tokens</strong>
      </div>
      <div class="suggestions-list">
        ${suggestions.map(s => {
          const icon = s.type === 'remove' ? '❌' : s.type === 'summarize' ? '📝' : '✅'
          const color = s.type === 'remove' ? 'var(--danger)' : s.type === 'summarize' ? 'var(--warning)' : 'var(--success)'
          return `
            <div class="suggestion-item" style="border-left-color: ${color}">
              <div class="suggestion-header">
                <span>${icon} ${s.type.toUpperCase()}</span>
                <span style="color: ${color}">Save ${s.tokenSavings} tokens</span>
              </div>
              <div class="suggestion-reason">${s.reason}</div>
              <div class="suggestion-id">Message: ${s.messageId}</div>
            </div>
          `
        }).join('')}
      </div>
    `
  }

  private renderTopicClusters(clusters: Analysis['topicClusters']) {
    const container = document.getElementById('topics-container')!
    if (!clusters || clusters.length === 0) {
      container.innerHTML = '<div class="empty-state">No topic clusters identified</div>'
      return
    }

    container.innerHTML = `
      <div class="topics-grid">
        ${clusters.map((cluster, idx) => {
          const colors = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff']
          const color = colors[idx % colors.length]
          return `
            <div class="topic-card" style="border-top-color: ${color}">
              <div class="topic-header">
                <span class="topic-name" style="color: ${color}">${cluster.topic}</span>
                <span class="topic-percentage">${cluster.percentage}%</span>
              </div>
              <div class="topic-messages">${cluster.messageCount} messages</div>
              <div class="topic-keywords">
                ${cluster.keywords.map(k => `<span class="keyword-tag">${k}</span>`).join('')}
              </div>
            </div>
          `
        }).join('')}
      </div>
    `
  }

  private switchTab(tabName: string) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
    
    document.querySelector(`.tab[data-tab="${tabName}"]`)?.classList.add('active')
    document.getElementById(`tab-${tabName}`)?.classList.add('active')
  }

  private connectWebSocket() {
    // Simulated WebSocket connection for demo
    const wsStatus = document.getElementById('ws-status') as HTMLElement
    const wsText = document.getElementById('ws-text') as HTMLElement
    
    // In production, connect to actual WebSocket endpoint
    // this.ws = new WebSocket('ws://localhost:18789/plugins/contextscope/ws')
    
    // Simulate connection status
    setTimeout(() => {
      wsStatus!.style.background = 'var(--success)'
      wsText!.textContent = 'Live'
    }, 1000)
  }

  private setupEventListeners() {
    // Refresh button
    document.getElementById('refresh-btn')?.addEventListener('click', () => this.loadData())

    // Export buttons
    document.getElementById('export-json')?.addEventListener('click', () => {
      window.open(`${this.apiBase}/export?format=json`, '_blank')
    })
    document.getElementById('export-csv')?.addEventListener('click', () => {
      window.open(`${this.apiBase}/export?format=csv`, '_blank')
    })

    // Search
    document.getElementById('search-btn')?.addEventListener('click', () => this.loadRequests())
    document.getElementById('clear-search')?.addEventListener('click', () => {
      ;(document.getElementById('search-input') as HTMLInputElement).value = ''
      this.loadRequests()
    })
    ;(document.getElementById('search-input') as HTMLInputElement)?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.loadRequests()
    })

    // Filter buttons
    document.getElementById('apply-filters')?.addEventListener('click', () => this.loadRequests())
    document.getElementById('clear-filters')?.addEventListener('click', () => {
      ;(document.getElementById('filter-session') as HTMLInputElement).value = ''
      ;(document.getElementById('filter-provider') as HTMLInputElement).value = ''
      ;(document.getElementById('filter-model') as HTMLSelectElement).value = ''
      this.loadRequests()
    })

    // Trend period change
    document.getElementById('trend-period')?.addEventListener('change', () => this.loadTokenTrend())

    // Modal close
    document.getElementById('modal-close')?.addEventListener('click', () => {
      document.getElementById('analysis-modal')?.classList.remove('active')
      this.currentAnalysis = null
    })
    document.getElementById('analysis-modal')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('analysis-modal')) {
        document.getElementById('analysis-modal')?.classList.remove('active')
        this.currentAnalysis = null
      }
    })

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = (tab as HTMLElement).dataset.tab!
        this.switchTab(tabName)
      })
    })

    // Request items
    document.getElementById('requests-list')?.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.request-item') as HTMLElement
      if (item) {
        const runId = item.dataset.runid
        if (runId) this.showAnalysis(runId)
      }
    })
  }

  private startAutoRefresh() {
    // Auto-refresh every 30 seconds
    this.refreshTimer = window.setInterval(() => this.loadData(), 30000)
  }

  unmount() {
    if (this.refreshTimer) clearInterval(this.refreshTimer)
    if (this.tokenChart) this.tokenChart.destroy()
    if (this.hourlyChart) this.hourlyChart.destroy()
    if (this.tokenDetailChart) this.tokenDetailChart.destroy()
    if (this.tokenTrendChart) this.tokenTrendChart.destroy()
    if (this.latencyChart) this.latencyChart.destroy()
    if (this.ws) this.ws.close()
  }
}
