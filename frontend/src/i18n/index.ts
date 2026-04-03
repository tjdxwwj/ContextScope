import React, { useState, createContext, useContext, ReactNode } from 'react'

export type Language = 'en' | 'zh'

interface I18nContextType {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: string) => string
}

const I18nContext = createContext<I18nContextType | null>(null)

const translations = {
  en: {
    // Header
    'app.title': 'ContextScope',
    'app.subtitle': 'AI Agent Context Analyzer',
    'language.switch': '中文',
    
    // Navigation
    'nav.overview': 'Overview',
    'nav.requests': 'Requests',
    'nav.timeline': 'Timeline',
    'nav.chains': 'Chains',
    'nav.tasks': 'Tasks',
    'nav.analytics': 'Analytics',
    
    // Dashboard
    'dashboard.title': 'Dashboard',
    'dashboard.refresh': 'Refresh',
    'dashboard.autoRefresh': 'Auto Refresh',
    'dashboard.lastUpdated': 'Last updated',
    
    // Stats
    'stats.totalRequests': 'Total Requests',
    'stats.todayRequests': 'Today',
    'stats.weekRequests': 'This Week',
    'stats.avgTokens': 'Avg Tokens',
    'stats.totalCost': 'Est. Cost',
    'stats.storageSize': 'Storage',
    
    // Filters
    'filters.title': 'Filters',
    'filters.dateRange': 'Date Range',
    'filters.provider': 'Provider',
    'filters.model': 'Model',
    'filters.search': 'Search',
    'filters.clear': 'Clear',
    
    // Request List
    'requests.title': 'Request History',
    'requests.empty': 'No requests found',
    'requests.loadMore': 'Load More',
    'requests.details': 'Details',
    
    // Request Detail
    'detail.title': 'Request Detail',
    'detail.runId': 'Run ID',
    'detail.sessionId': 'Session ID',
    'detail.timestamp': 'Timestamp',
    'detail.provider': 'Provider',
    'detail.model': 'Model',
    'detail.tokens': 'Tokens',
    'detail.cost': 'Cost',
    'detail.duration': 'Duration',
    'detail.status': 'Status',
    
    // Token Breakdown
    'tokens.title': 'Token Usage',
    'tokens.system': 'System Prompt',
    'tokens.history': 'History',
    'tokens.tools': 'Tool Results',
    'tokens.output': 'Output',
    'tokens.total': 'Total',
    
    // Context Analysis
    'context.title': 'Context Distribution',
    'context.heatmap': 'Context Treemap',
    'context.distribution': 'Distribution',
    
    // Tool Calls
    'tools.title': 'Tool Calls',
    'tools.name': 'Tool Name',
    'tools.params': 'Parameters',
    'tools.result': 'Result',
    'tools.duration': 'Duration',
    
    // Timeline
    'timeline.title': 'Request Timeline',
    'timeline.zoomIn': 'Zoom In',
    'timeline.zoomOut': 'Zoom Out',
    'timeline.reset': 'Reset View',
    
    // Export
    'export.title': 'Export Data',
    'export.json': 'Export JSON',
    'export.csv': 'Export CSV',
    'export.filters': 'With Filters',
    
    // Status
    'status.success': 'Success',
    'status.error': 'Error',
    'status.pending': 'Pending',
    'status.running': 'Running',
    
    // Errors
    'error.loadFailed': 'Failed to load data',
    'error.retry': 'Retry',
    'error.noData': 'No data available',
    
    // Footer
    'footer.poweredBy': 'Powered by OpenClaw',
    'footer.version': 'Version',
    
    // Task Status (extended)
    'status.completed': 'Completed',
    'status.timeout': 'Timeout',
    'status.aborted': 'Aborted',
    
    // Messages
    'msg.loading': 'Loading...',
    'msg.noData': 'No Data',
    'msg.loaded': 'Loaded',
    'msg.items': 'items',
    'msg.allDates': 'All Dates',
    'msg.selectDate': 'Please select a date to clear',
    'msg.dateRangeLimit': 'Date range supports up to 31 days, please narrow the range',
    'msg.clearAllCache': 'All Cache',
    'msg.confirmClearCache': 'Confirm Clear Cache',
    'msg.ok': 'OK',
    'msg.cancel': 'Cancel',
    'msg.pricingLoadFailed': 'Failed to load pricing',
    'msg.connectionError': 'Unable to connect to backend real-time data API, please confirm OpenClaw Gateway and /plugins/contextscope/api are accessible.',
    'msg.timeoutError': 'Real-time data loading timeout, please confirm OpenClaw Gateway and /plugins/contextscope/api are accessible.',
    
    // UI Labels
    'ui.selectTask': 'Select a task to view details',
    'ui.searchTask': 'Search user task ID...',
    'ui.requestChain': 'Request Chain',
    'ui.toolCalls': 'Tool Calls',
    'ui.tokenUsage': 'Token Usage',
    'ui.contextDist': 'Context Distribution',
    'ui.costAnalysis': 'Cost Analysis',
    'ui.timeline': 'Timeline',
    'ui.pricing': 'Pricing',
    'ui.runId': 'Run ID',
    'ui.taskId': 'Task ID',
    'ui.userPrompt': 'User Prompt',
    'ui.llmOutput': 'LLM Output',
    'ui.inputTokens': 'Input Tokens',
    'ui.outputTokens': 'Output Tokens',
    'ui.totalTokens': 'Total Tokens',
    'ui.estCost': 'Est. Cost',
    'ui.timeRange': 'Time Range',
    'ui.duration': 'Duration',
    'ui.subagents': 'Subagents',
    'ui.parentTask': 'Parent Task',
    'ui.childTasks': 'Child Tasks',
    'ui.sessionInfo': 'Session Info',
    'ui.metadata': 'Metadata',
    'ui.refreshing': 'Refreshing...',
    'ui.viewDetails': 'View Details',
    'ui.collapse': 'Collapse',
    'ui.expand': 'Expand',
    'ui.copy': 'Copy',
    'ui.copied': 'Copied',
    'ui.close': 'Close',
    'ui.back': 'Back',
    'ui.next': 'Next',
    'ui.prev': 'Previous',
    'ui.of': 'of',
    'ui.showing': 'Showing',
    'ui.to': 'to',
    'ui.total': 'total',
    'ui.perPage': 'per page',
    'ui.goTo': 'Go to',
    'ui.page': 'page',
    
    // Timeline & Overview
    'timeline.globalTitle': 'Global Execution Timeline',
    'timeline.subtitle': 'Interactive analysis of concurrent and sequential calls within Session',
    'timeline.zoomHint': 'Scroll to zoom',
    'timeline.clickHint': 'Click to view details',
    'timeline.startTime': 'Start Time',
    'timeline.duration': 'Duration',
    'timeline.tokenUsage': 'Token Usage',
    'timeline.model': 'Model',
    'timeline.locateNode': 'Locate Node',
    'timeline.close': 'Close',
    'timeline.toolCalls': 'Tool Calls',
    'timeline.visualization': 'Visualization Timeline (supports zoom and drag)',
    'timeline.partialMatch': 'Partial unmatched',
    
    // Context Distribution
    'context.errorNoData': 'Context analysis API has no data or request timeout',
    'context.errorLoadFailed': 'Context analysis loading failed',
    'context.retry': 'Retry',
    'context.distributionTitle': 'Context Distribution',
    'context.totalTokens': 'tokens',
    
    // Token Treemap
    'treemap.title': 'Token Consumption Volume Analysis',
    'treemap.subtitle': 'Area = Σ token, parent block contains all child blocks',
    'treemap.reset': 'Reset',
    'treemap.inputTokens': 'Input',
    'treemap.outputTokens': 'Output',
    'treemap.totalTokens': 'Total',
    
    // Context Reducer
    'reducer.totalTokensSaved': 'Total Tokens Saved',
    'reducer.totalRecords': 'Total Records',
    'reducer.avgSavingRate': 'Avg Saving Rate',
    'reducer.tokenTrends': 'Token Trends',
    'reducer.contributions': 'Reducer Contributions',
    'reducer.noData': 'No data',
    'reducer.logs': 'Reduction Logs',
    'reducer.time': 'Time',
    'reducer.stage': 'Stage',
    'reducer.before': 'Before',
    'reducer.after': 'After',
    'reducer.saved': 'Saved',
    'reducer.reducers': 'Reducers',
    'reducer.duration': 'Duration',
    'reducer.noDetails': 'No details',
    'reducer.records': 'records',
    'reducer.loading': 'Loading context reducer data...',

    // Labels
    'label.systemPrompt': 'System Prompt',
    'label.currentUserPrompt': 'Current User Prompt',
    'label.historyUser': 'History User Messages',
    'label.historyAssistant': 'History Assistant Messages',
    'label.historyTool': 'History Tool Messages',
    'label.historySystem': 'History System Messages',
    'label.historyOther': 'History Other Messages',
    'label.userPrompt': 'User Prompt',
    'label.history': 'History',
    'label.toolResponses': 'Tool Responses',
  },
  zh: {
    // Header
    'app.title': 'ContextScope',
    'app.subtitle': 'AI 智能体上下文分析器',
    'language.switch': 'English',
    
    // Navigation
    'nav.overview': '概览',
    'nav.requests': '请求',
    'nav.timeline': '时间线',
    'nav.chains': '链路',
    'nav.tasks': '任务',
    'nav.analytics': '分析',
    
    // Dashboard
    'dashboard.title': '仪表板',
    'dashboard.refresh': '刷新',
    'dashboard.autoRefresh': '自动刷新',
    'dashboard.lastUpdated': '最后更新',
    
    // Stats
    'stats.totalRequests': '总请求数',
    'stats.todayRequests': '今日',
    'stats.weekRequests': '本周',
    'stats.avgTokens': '平均 Token',
    'stats.totalCost': '预估成本',
    'stats.storageSize': '存储',
    
    // Filters
    'filters.title': '筛选器',
    'filters.dateRange': '日期范围',
    'filters.provider': '提供商',
    'filters.model': '模型',
    'filters.search': '搜索',
    'filters.clear': '清除',
    
    // Request List
    'requests.title': '请求历史',
    'requests.empty': '未找到请求',
    'requests.loadMore': '加载更多',
    'requests.details': '详情',
    
    // Request Detail
    'detail.title': '请求详情',
    'detail.runId': '运行 ID',
    'detail.sessionId': '会话 ID',
    'detail.timestamp': '时间戳',
    'detail.provider': '提供商',
    'detail.model': '模型',
    'detail.tokens': 'Token',
    'detail.cost': '成本',
    'detail.duration': '耗时',
    'detail.status': '状态',
    
    // Token Breakdown
    'tokens.title': 'Token 使用',
    'tokens.system': '系统提示词',
    'tokens.history': '历史消息',
    'tokens.tools': '工具结果',
    'tokens.output': '输出',
    'tokens.total': '总计',
    
    // Context Analysis
    'context.title': '上下文分布',
    'context.heatmap': '上下文矩形树图',
    'context.distribution': '分布',
    
    // Tool Calls
    'tools.title': '工具调用',
    'tools.name': '工具名称',
    'tools.params': '参数',
    'tools.result': '结果',
    'tools.duration': '耗时',
    
    // Timeline
    'timeline.title': '请求时间线',
    'timeline.zoomIn': '放大',
    'timeline.zoomOut': '缩小',
    'timeline.reset': '重置视图',
    
    // Export
    'export.title': '导出数据',
    'export.json': '导出 JSON',
    'export.csv': '导出 CSV',
    'export.filters': '带筛选条件',
    
    // Status
    'status.success': '成功',
    'status.error': '错误',
    'status.pending': '等待中',
    'status.running': '运行中',
    
    // Errors
    'error.loadFailed': '加载数据失败',
    'error.retry': '重试',
    'error.noData': '暂无数据',
    
    // Footer
    'footer.poweredBy': '由 OpenClaw 驱动',
    'footer.version': '版本',
    
    // Task Status (extended)
    'status.completed': '已完成',
    'status.timeout': '超时',
    'status.aborted': '已中止',
    
    // Messages
    'msg.loading': '加载中...',
    'msg.noData': '无数据',
    'msg.loaded': '已加载',
    'msg.items': '条',
    'msg.allDates': '所有日期',
    'msg.selectDate': '请先选择要清除的日期',
    'msg.dateRangeLimit': '日期范围最多支持 31 天，请缩小范围后重试',
    'msg.clearAllCache': '所有缓存',
    'msg.confirmClearCache': '确认清除缓存',
    'msg.ok': '确定',
    'msg.cancel': '取消',
    'msg.pricingLoadFailed': '价格加载失败',
    'msg.connectionError': '无法连接后端实时数据接口，请确认 OpenClaw 网关与 /plugins/contextscope/api 可访问。',
    'msg.timeoutError': '实时数据加载超时，请确认 OpenClaw 网关与 /plugins/contextscope/api 可访问。',
    
    // UI Labels
    'ui.selectTask': '选择任务查看详情',
    'ui.searchTask': '搜索用户任务 ID...',
    'ui.requestChain': '请求链路',
    'ui.toolCalls': '工具调用',
    'ui.tokenUsage': 'Token 使用',
    'ui.contextDist': '上下文分布',
    'ui.costAnalysis': '成本分析',
    'ui.timeline': '时间线',
    'ui.pricing': '价格',
    'ui.runId': '运行 ID',
    'ui.taskId': '任务 ID',
    'ui.userPrompt': '用户提示词',
    'ui.llmOutput': 'LLM 输出',
    'ui.inputTokens': '输入 Token',
    'ui.outputTokens': '输出 Token',
    'ui.totalTokens': '总 Token',
    'ui.estCost': '预估成本',
    'ui.timeRange': '时间范围',
    'ui.duration': '耗时',
    'ui.subagents': '子代理',
    'ui.parentTask': '父任务',
    'ui.childTasks': '子任务',
    'ui.sessionInfo': '会话信息',
    'ui.metadata': '元数据',
    'ui.refreshing': '刷新中...',
    'ui.viewDetails': '查看详情',
    'ui.collapse': '收起',
    'ui.expand': '展开',
    'ui.copy': '复制',
    'ui.copied': '已复制',
    'ui.close': '关闭',
    'ui.back': '返回',
    'ui.next': '下一页',
    'ui.prev': '上一页',
    'ui.of': '共',
    'ui.showing': '显示',
    'ui.to': '到',
    'ui.total': '总计',
    'ui.perPage': '每页',
    'ui.goTo': '跳转到',
    'ui.page': '页',
    
    // Timeline & Overview
    'timeline.globalTitle': '全局执行时间线',
    'timeline.subtitle': '交互式分析 Session 内的所有并发与顺序调用',
    'timeline.zoomHint': '滚轮缩放',
    'timeline.clickHint': '点击查看详情',
    'timeline.startTime': '开始时间',
    'timeline.duration': '持续时间',
    'timeline.tokenUsage': 'Token 消耗',
    'timeline.model': '模型',
    'timeline.locateNode': '定位节点',
    'timeline.close': '关闭',
    'timeline.toolCalls': '工具调用',
    'timeline.visualization': '可视化时间轴 (支持缩放与拖拽)',
    'timeline.partialMatch': '部分未匹配',
    
    // Context Distribution
    'context.errorNoData': '上下文分析接口暂无数据或请求超时',
    'context.errorLoadFailed': '上下文分析加载失败',
    'context.retry': '重新请求',
    'context.distributionTitle': 'Context 分布',
    'context.totalTokens': 'tokens',
    
    // Token Treemap
    'treemap.title': 'Token 消耗体积分析',
    'treemap.subtitle': '面积 = Σ token，父块包含所有子块',
    'treemap.reset': '返回全部',
    'treemap.inputTokens': '输入',
    'treemap.outputTokens': '输出',
    'treemap.totalTokens': '总计',
    
    // Context Reducer
    'reducer.totalTokensSaved': '总节省 Token',
    'reducer.totalRecords': '总记录数',
    'reducer.avgSavingRate': '平均节省率',
    'reducer.tokenTrends': 'Token 趋势',
    'reducer.contributions': 'Reducer 贡献占比',
    'reducer.noData': '暂无数据',
    'reducer.logs': '裁剪日志',
    'reducer.time': '时间',
    'reducer.stage': '阶段',
    'reducer.before': '裁剪前',
    'reducer.after': '裁剪后',
    'reducer.saved': '节省',
    'reducer.reducers': '策略',
    'reducer.duration': '耗时',
    'reducer.noDetails': '无详情',
    'reducer.records': '条记录',
    'reducer.loading': '正在加载上下文裁剪数据...',

    // Labels
    'label.systemPrompt': 'System Prompt',
    'label.currentUserPrompt': 'Current User Prompt',
    'label.historyUser': 'History User Messages',
    'label.historyAssistant': 'History Assistant Messages',
    'label.historyTool': 'History Tool Messages',
    'label.historySystem': 'History System Messages',
    'label.historyOther': 'History Other Messages',
    'label.userPrompt': 'User Prompt',
    'label.history': 'History',
    'label.toolResponses': 'Tool Responses',
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('contextscope-lang')
    return (saved as Language) || 'en'
  })

  const setLang = (newLang: Language) => {
    setLangState(newLang)
    localStorage.setItem('contextscope-lang', newLang)
  }

  const t = (key: string): string => {
    return translations[lang][key as keyof typeof translations.en] || key
  }

  return React.createElement(
    I18nContext.Provider,
    { value: { lang, setLang, t } },
    children
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}

export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n()
  
  return React.createElement(
    'button',
    {
      onClick: () => setLang(lang === 'en' ? 'zh' : 'en'),
      className: 'px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors dark:text-gray-400 dark:hover:text-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700'
    },
    t('language.switch')
  )
}
