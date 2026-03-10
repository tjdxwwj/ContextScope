import { useEffect, useRef, useCallback } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import Chart from 'chart.js/auto'
import {
  // 状态 atoms
  loadingAtom,
  wsConnectedAtom,
  statsAtom,
  searchQueryAtom,
  filtersAtom,
  selectedAnalysisAtom,
  activeTabAtom,
  trendPeriodAtom,
  tokenTrendDataAtom,
  analysisModalOpenAtom,
  requestCountAtom,
  filteredRequestsAtom,
  // API atoms
  loadStatsAtom,
  loadRequestsAtom,
  loadTokenTrendAtom,
  loadAnalysisAtom,
  refreshAllAtom,
  clearFiltersAtom,
  closeAnalysisModalAtom,
  // Charts
  chartConfigAtom
} from './atoms'
import type { Stats } from './types'

const API_BASE = '/plugins/contextscope/api'

// 主应用组件
export default function App() {
  // 读取状态
  const loading = useAtomValue(loadingAtom)
  const wsConnected = useAtomValue(wsConnectedAtom)
  const stats = useAtomValue(statsAtom)
  const searchQuery = useAtomValue(searchQueryAtom)
  const filters = useAtomValue(filtersAtom)
  const selectedAnalysis = useAtomValue(selectedAnalysisAtom)
  const activeTab = useAtomValue(activeTabAtom)
  const trendPeriod = useAtomValue(trendPeriodAtom)
  const tokenTrendData = useAtomValue(tokenTrendDataAtom)
  const analysisModalOpen = useAtomValue(analysisModalOpenAtom)
  const requestCount = useAtomValue(requestCountAtom)
  const filteredRequests = useAtomValue(filteredRequestsAtom)
  const chartConfig = useAtomValue(chartConfigAtom)

  // 设置状态
  const setSearchQuery = useSetAtom(searchQueryAtom)
  const setFilters = useSetAtom(filtersAtom)
  const setTrendPeriod = useSetAtom(trendPeriodAtom)
  const setActiveTab = useSetAtom(activeTabAtom)

  // Actions
  const loadStats = useSetAtom(loadStatsAtom)
  const loadRequests = useSetAtom(loadRequestsAtom)
  const loadTokenTrend = useSetAtom(loadTokenTrendAtom)
  const loadAnalysis = useSetAtom(loadAnalysisAtom)
  const refreshAll = useSetAtom(refreshAllAtom)
  const clearFilters = useSetAtom(clearFiltersAtom)
  const closeAnalysisModal = useSetAtom(closeAnalysisModalAtom)

  // Chart refs
  const tokenChartRef = useRef<Chart | null>(null)
  const hourlyChartRef = useRef<Chart | null>(null)
  const tokenTrendChartRef = useRef<Chart | null>(null)

  // 加载数据
  const loadData = useCallback(async () => {
    await Promise.all([loadStats(), loadRequests()])
  }, [loadStats, loadRequests])

  // 更新图表
  const handleUpdateCharts = useCallback((statsData: Stats) => {
    // Token 分布图
    const tokenCtx = document.getElementById('token-chart') as HTMLCanvasElement
    if (tokenChartRef.current) tokenChartRef.current.destroy()
    
    tokenChartRef.current = new Chart(tokenCtx, {
      type: chartConfig.tokenDistribution.type,
      data: {
        labels: Object.keys(statsData.byProvider),
        datasets: [{
          data: Object.values(statsData.byProvider),
          backgroundColor: chartConfig.tokenDistribution.colors
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right' } }
      }
    })

    // 每小时分布图
    const hourlyCtx = document.getElementById('hourly-chart') as HTMLCanvasElement
    if (hourlyChartRef.current) hourlyChartRef.current.destroy()
    
    hourlyChartRef.current = new Chart(hourlyCtx, {
      type: chartConfig.hourlyDistribution.type,
      data: {
        labels: Array.from({length: 24}, (_, i) => `${i}:00`),
        datasets: [{
          label: 'Requests',
          data: statsData.hourlyDistribution,
          backgroundColor: chartConfig.hourlyDistribution.color,
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
  }, [chartConfig])

  // 渲染 Token 趋势图
  const renderTokenTrendChart = useCallback((data: typeof tokenTrendData) => {
    const ctx = document.getElementById('token-trend-chart') as HTMLCanvasElement
    if (tokenTrendChartRef.current) tokenTrendChartRef.current.destroy()

    const labels = data.map(d => new Date(d.timestamp).toLocaleString(undefined, { 
      month: 'short', day: 'numeric', hour: '2-digit' 
    }))

    tokenTrendChartRef.current = new Chart(ctx, {
      type: chartConfig.tokenTrend.type,
      data: {
        labels,
        datasets: [
          {
            label: 'Input Tokens',
            data: data.map(d => d.input),
            borderColor: chartConfig.tokenTrend.colors.input,
            backgroundColor: 'rgba(88, 166, 255, 0.1)',
            fill: true,
            tension: 0.4
          },
          {
            label: 'Output Tokens',
            data: data.map(d => d.output),
            borderColor: chartConfig.tokenTrend.colors.output,
            backgroundColor: 'rgba(63, 185, 80, 0.1)',
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: { beginAtZero: true },
          x: { grid: { display: false } }
        }
      }
    })
  }, [chartConfig])

  // WebSocket 连接模拟
  useEffect(() => {
    const timer = setTimeout(() => {
      // 这里可以设置实际的 WebSocket 连接状态
      // useSetAtom(wsConnectedAtom)(true)
    }, 1000)
    return () => clearTimeout(timer)
  }, [])

  // 初始加载
  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 30000) // 30 秒自动刷新
    return () => clearInterval(interval)
  }, [loadData])

  // 趋势周期变化
  useEffect(() => {
    if (stats) loadTokenTrend()
  }, [trendPeriod, stats, loadTokenTrend])

  // 监听 stats 变化更新图表
  useEffect(() => {
    if (stats) {
      handleUpdateCharts(stats)
    }
  }, [stats, handleUpdateCharts])

  // 监听 tokenTrendData 变化渲染趋势图
  useEffect(() => {
    if (tokenTrendData.length > 0) {
      renderTokenTrendChart(tokenTrendData)
    }
  }, [tokenTrendData, renderTokenTrendChart])

  // 导出 JSON
  const handleExportJson = () => {
    window.open(`${API_BASE}/export?format=json`, '_blank')
  }

  // 导出 CSV
  const handleExportCsv = () => {
    window.open(`${API_BASE}/export?format=csv`, '_blank')
  }

  // 应用过滤
  const handleApplyFilters = () => {
    loadRequests()
  }

  // 清除搜索
  const handleClearSearch = () => {
    setSearchQuery('')
  }

  return (
    <div className="container">
      {/* Header */}
      <div className="header">
        <h1>🔍 ContextScope</h1>
        <div className="status-badge">
          <div className="status-dot" style={{ background: wsConnected ? 'var(--success)' : 'var(--danger)' }} />
          <span>{wsConnected ? 'Live' : 'Connecting...'}</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="search-bar">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 Search prompts, responses, models..."
          className="search-input"
          onKeyDown={(e) => e.key === 'Enter' && loadRequests()}
        />
        <button className="btn btn-primary" onClick={loadRequests}>Search</button>
        <button className="btn" onClick={handleClearSearch}>Clear</button>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        {stats ? (
          <>
            <div className="stat-card">
              <div className="stat-value">{stats.totalRequests.toLocaleString()}</div>
              <div className="stat-label">Total Requests</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.todayRequests}</div>
              <div className="stat-label">Today</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.weekRequests}</div>
              <div className="stat-label">This Week</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.averageTokens.toLocaleString()}</div>
              <div className="stat-label">Avg Tokens</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">${stats.totalCost.toFixed(2)}</div>
              <div className="stat-label">Est. Cost</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">-</div>
              <div className="stat-label">Storage</div>
            </div>
          </>
        ) : (
          <div className="loading">Loading statistics...</div>
        )}
      </div>

      {/* Controls */}
      <div className="controls">
        <button className="btn btn-primary" onClick={refreshAll}>🔄 Refresh</button>
        <button className="btn" onClick={handleExportJson}>📥 Export JSON</button>
        <button className="btn" onClick={handleExportCsv}>📊 Export CSV</button>
        <div className="filter-group">
          <input
            type="text"
            value={filters.session}
            onChange={(e) => setFilters({ ...filters, session: e.target.value })}
            placeholder="Session ID"
            className="filter-input"
          />
          <input
            type="text"
            value={filters.provider}
            onChange={(e) => setFilters({ ...filters, provider: e.target.value })}
            placeholder="Provider"
            className="filter-input"
          />
          <select
            value={filters.model}
            onChange={(e) => setFilters({ ...filters, model: e.target.value })}
            className="filter-input"
          >
            <option value="">All Models</option>
            {stats && Object.keys(stats.byModel).map(model => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
          <button className="btn" onClick={handleApplyFilters}>Apply</button>
          <button className="btn" onClick={clearFilters}>Clear</button>
        </div>
      </div>

      {/* Token Trend Chart */}
      <div className="card full-width">
        <div className="card-header">
          📈 Token Usage Trend
          <select
            value={trendPeriod}
            onChange={(e) => setTrendPeriod(Number(e.target.value))}
            className="chart-period"
          >
            <option value={24}>Last 24 Hours</option>
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
          </select>
        </div>
        <div className="card-body chart-body">
          <canvas id="token-trend-chart" />
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">📊 Token Distribution</div>
          <div className="card-body chart-body">
            <canvas id="token-chart" />
          </div>
        </div>
        <div className="card">
          <div className="card-header">📈 Hourly Requests</div>
          <div className="card-body chart-body">
            <canvas id="hourly-chart" />
          </div>
        </div>
      </div>

      {/* Requests List */}
      <div className="card">
        <div className="card-header">
          📋 Recent Requests
          <span className="request-count">{requestCount}</span>
        </div>
        <div className="requests-list" id="requests-list">
          {loading ? (
            <div className="loading">Loading requests...</div>
          ) : filteredRequests.length === 0 ? (
            <div className="empty-state">No requests found</div>
          ) : (
            filteredRequests.map(req => (
              <div
                key={req.runId}
                className="request-item"
                onClick={() => loadAnalysis(req.runId)}
              >
                <div className="request-header">
                  <span className="request-provider">{req.provider} / {req.model}</span>
                  <span className="request-time">{new Date(req.timestamp).toLocaleString()}</span>
                </div>
                <div className="request-details">
                  <span className={`badge badge-${req.type}`}>{req.type === 'input' ? 'Input' : 'Output'}</span>
                  <span>Token: <strong>{req.usage?.total?.toLocaleString() || 0}</strong></span>
                  <span>In: <strong>{req.usage?.input?.toLocaleString() || 0}</strong></span>
                  <span>Out: <strong>{req.usage?.output?.toLocaleString() || 0}</strong></span>
                  {req.latency && <span className="latency-badge">{req.latency}ms</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Analysis Modal */}
      {analysisModalOpen && selectedAnalysis && (
        <div className="modal-overlay active" onClick={closeAnalysisModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Analysis: {selectedAnalysis.provider} / {selectedAnalysis.model}</h2>
              <button className="modal-close" onClick={closeAnalysisModal}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="tabs">
                {(['token', 'heatmap', 'timeline', 'graph', 'insights'] as const).map(tab => (
                  <div
                    key={tab}
                    className={`tab ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab === 'token' && 'Token Analysis'}
                    {tab === 'heatmap' && 'Heatmap'}
                    {tab === 'timeline' && 'Timeline'}
                    {tab === 'graph' && 'Dependency Graph'}
                    {tab === 'insights' && '💡 Insights'}
                  </div>
                ))}
              </div>

              <div id={`tab-${activeTab}`} className="tab-content active">
                {activeTab === 'token' && (
                  <div className="chart-body" style={{ height: '300px' }}>
                    <canvas id="token-detail-chart" />
                  </div>
                )}
                {activeTab === 'heatmap' && (
                  <div className="heatmap-section">
                    <h3>🔥 Message Impact Heatmap</h3>
                    <div className="heatmap-container">
                      {selectedAnalysis.heatmap.messages.map((msg, idx) => {
                        const intensity = msg.impact / selectedAnalysis.heatmap.maxImpact
                        const hue = 200 - (intensity * 180)
                        const saturation = 70 + (intensity * 30)
                        const lightness = 40 + (intensity * 20)
                        return (
                          <div
                            key={idx}
                            className="heatmap-cell"
                            style={{ background: `hsl(${hue}, ${saturation}%, ${lightness}%)` }}
                            title={`Role: ${msg.role}\nTokens: ${msg.tokens}\nImpact: ${msg.impact}`}
                          >
                            <span className="cell-tokens">{msg.tokens}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {activeTab === 'timeline' && (
                  <div className="timeline-section">
                    <h3>📈 Context Window Utilization</h3>
                    <div className="timeline-viz">
                      {selectedAnalysis.timeline.points.map((point, idx) => {
                        const utilizationPct = Math.round(point.utilization * 100)
                        const colorClass = utilizationPct > 90 ? 'critical' : utilizationPct > 70 ? 'warning' : 'normal'
                        return (
                          <div key={idx} className={`timeline-point ${colorClass}`}>
                            <div className="point-time">{new Date(point.timestamp).toLocaleTimeString()}</div>
                            <div className="point-stats">
                              <span>{point.tokens.toLocaleString()} tokens</span>
                              <span>{point.messages} msgs</span>
                              <span className={`utilization ${colorClass}`}>{utilizationPct}%</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {activeTab === 'graph' && (
                  <div className="graph-section">
                    <h3>🔗 Tool Dependencies</h3>
                    <div className="graph-nodes">
                      {selectedAnalysis.dependencyGraph.nodes.map((node, idx) => (
                        <div key={idx} className={`graph-node ${node.status}`}>
                          <div style={{ fontWeight: 600, marginBottom: 8 }}>{node.label}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            <div>Tokens: {node.tokens.toLocaleString()}</div>
                            <div>Duration: {node.duration}ms</div>
                            <div>Status: {node.status === 'success' ? '✅' : node.status === 'error' ? '❌' : '⏳'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {activeTab === 'insights' && (
                  <div className="insights-section">
                    <h3>💡 AI Insights</h3>
                    {selectedAnalysis.insights.map((insight, idx) => {
                      const cls = insight.type === 'warning' ? 'insight-warning' : insight.type === 'optimization' ? 'insight-optimization' : 'insight-info'
                      const icon = insight.type === 'warning' ? '⚠️' : insight.type === 'optimization' ? '💡' : 'ℹ️'
                      return (
                        <div key={idx} className={`insight-item ${cls}`}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{icon} {insight.title}</div>
                          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{insight.description}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
