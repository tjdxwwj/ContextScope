import { useState, useMemo } from 'react'
import type { TimelinePointDetail, ContextMessage } from '../types'

interface EnhancedTimelineProps {
  points: Array<{
    timestamp: number
    tokens: number
    messages: number
    utilization: number
    summaryApplied: boolean
  }>
  contextWindow?: number
  onSelectPoint: (detail: TimelinePointDetail) => void
  selectedPoint?: TimelinePointDetail | null
}

export function EnhancedTimeline({ points, onSelectPoint, selectedPoint }: EnhancedTimelineProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // 计算相邻时间点的变化
  const pointsWithComparison = useMemo(() => {
    return points.map((point, index) => {
      const prevPoint = index > 0 ? points[index - 1] : null
      
      return {
        ...point,
        prevTimestamp: prevPoint?.timestamp,
        messagesDelta: prevPoint ? point.messages - prevPoint.messages : 0,
        tokensDelta: prevPoint ? point.tokens - prevPoint.tokens : 0,
        utilizationDelta: prevPoint ? Math.round((point.utilization - prevPoint.utilization) * 100) : 0
      }
    })
  }, [points])

  // 生成模拟的上下文快照（实际应从 API 获取）
  const generateContextSnapshot = (pointIndex: number): ContextMessage[] => {
    // 这里生成示例数据，实际应该从后端 API 获取
    const snapshot: ContextMessage[] = []
    const point = points[pointIndex]
    
    // 模拟生成几条消息
    for (let i = 0; i < Math.min(point.messages, 10); i++) {
      snapshot.push({
        id: `msg-${pointIndex}-${i}`,
        role: i % 3 === 0 ? 'user' : i % 3 === 1 ? 'assistant' : 'tool',
        content: `这是第 ${i + 1} 条消息的示例内容...`,
        tokens: Math.floor(Math.random() * 200) + 50,
        timestamp: point.timestamp - (point.messages - i) * 1000,
        type: i % 3 === 2 ? 'read_file' : undefined,
        status: 'success'
      })
    }
    
    return snapshot
  }

  // 生成对比数据
  const generateComparison = (pointIndex: number) => {
    const prevPoint = pointIndex > 0 ? pointsWithComparison[pointIndex - 1] : null
    if (!prevPoint) return undefined

    const current = pointsWithComparison[pointIndex]
    
    // 模拟新增和删除的消息
    const addedMessages: ContextMessage[] = []
    const removedMessages: ContextMessage[] = []
    
    if (current.messagesDelta > 0) {
      for (let i = 0; i < Math.min(current.messagesDelta, 5); i++) {
        addedMessages.push({
          id: `added-${i}`,
          role: 'user',
          content: `新增消息 ${i + 1}...`,
          tokens: Math.floor(Math.random() * 150) + 30,
          timestamp: current.timestamp
        })
      }
    }
    
    if (current.messagesDelta < 0) {
      for (let i = 0; i < Math.min(Math.abs(current.messagesDelta), 3); i++) {
        removedMessages.push({
          id: `removed-${i}`,
          role: 'assistant',
          content: `删除消息 ${i + 1}...`,
          tokens: Math.floor(Math.random() * 100) + 20,
          timestamp: prevPoint.timestamp
        })
      }
    }

    return {
      prevTimestamp: prevPoint.timestamp,
      messagesDelta: current.messagesDelta,
      tokensDelta: current.tokensDelta,
      utilizationDelta: current.utilizationDelta,
      addedMessages,
      removedMessages
    }
  }

  // 处理时间点点击
  const handlePointClick = (index: number) => {
    const point = pointsWithComparison[index]
    const detail: TimelinePointDetail = {
      timestamp: point.timestamp,
      tokens: point.tokens,
      messages: point.messages,
      utilization: point.utilization,
      summaryApplied: point.summaryApplied,
      contextSnapshot: generateContextSnapshot(index),
      comparison: generateComparison(index)
    }
    onSelectPoint(detail)
  }

  // 获取时间点样式
  const getPointStyle = (index: number) => {
    const point = points[index]
    const utilizationPct = Math.round(point.utilization * 100)
    
    if (utilizationPct > 90) return 'critical'
    if (utilizationPct > 70) return 'warning'
    return 'normal'
  }

  return (
    <div className="enhanced-timeline">
      {/* 时间线导航条 */}
      <div className="timeline-navigation">
        {pointsWithComparison.map((point, index) => {
          const style = getPointStyle(index)
          const isSelected = selectedPoint?.timestamp === point.timestamp
          const isHovered = hoveredIndex === index
          
          return (
            <div
              key={index}
              className={`timeline-point-nav ${style} ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''}`}
              onClick={() => handlePointClick(index)}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className="point-indicator" />
              <div className="point-tooltip">
                <div className="tooltip-time">{new Date(point.timestamp).toLocaleTimeString()}</div>
                <div className="tooltip-stats">
                  <span>{point.messages} msgs</span>
                  <span>{point.tokens.toLocaleString()} tokens</span>
                  <span className={style}>{Math.round(point.utilization * 100)}%</span>
                </div>
                {point.summaryApplied && <div className="tooltip-badge">📝 Summarized</div>}
                {point.messagesDelta !== 0 && (
                  <div className={`tooltip-delta ${point.messagesDelta > 0 ? 'positive' : 'negative'}`}>
                    {point.messagesDelta > 0 ? '+' : ''}{point.messagesDelta} msgs
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 时间线详情预览 */}
      {hoveredIndex !== null && (
        <div className="timeline-preview">
          <div className="preview-header">
            <h4>时间点预览</h4>
            <span className="preview-time">
              {new Date(points[hoveredIndex].timestamp).toLocaleString()}
            </span>
          </div>
          <div className="preview-stats">
            <div className="preview-stat">
              <span className="stat-label">消息数</span>
              <span className="stat-value">{points[hoveredIndex].messages}</span>
            </div>
            <div className="preview-stat">
              <span className="stat-label">Tokens</span>
              <span className="stat-value">{points[hoveredIndex].tokens.toLocaleString()}</span>
            </div>
            <div className="preview-stat">
              <span className="stat-label">使用率</span>
              <span className={`stat-value ${getPointStyle(hoveredIndex)}`}>
                {Math.round(points[hoveredIndex].utilization * 100)}%
              </span>
            </div>
          </div>
          {pointsWithComparison[hoveredIndex].messagesDelta !== 0 && (
            <div className="preview-changes">
              <span className="changes-label">较上时间点：</span>
              <span className={`changes-value ${pointsWithComparison[hoveredIndex].messagesDelta > 0 ? 'text-success' : 'text-danger'}`}>
                {pointsWithComparison[hoveredIndex].messagesDelta > 0 ? '+' : ''}
                {pointsWithComparison[hoveredIndex].messagesDelta} 条消息
              </span>
            </div>
          )}
        </div>
      )}

      {/* 图例 */}
      <div className="timeline-legend">
        <div className="legend-item">
          <span className="legend-dot normal" />
          <span>正常 (&lt;70%)</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot warning" />
          <span>警告 (70-90%)</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot critical" />
          <span>危险 (&gt;90%)</span>
        </div>
        <div className="legend-item">
          <span className="legend-badge">📝</span>
          <span>已总结</span>
        </div>
      </div>
    </div>
  )
}
