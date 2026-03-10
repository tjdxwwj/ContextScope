import { useMemo } from 'react'
import type { TimelinePointDetail } from '../types'

interface TimelineDetailProps {
  detail: TimelinePointDetail | null
  onClose: () => void
}

export function TimelineDetail({ detail, onClose }: TimelineDetailProps) {
  // 计算变化统计
  const stats = useMemo(() => {
    if (!detail?.comparison) return null
    
    const { messagesDelta, tokensDelta, utilizationDelta } = detail.comparison
    return {
      messagesChange: messagesDelta > 0 ? `+${messagesDelta}` : messagesDelta,
      tokensChange: tokensDelta > 0 ? `+${tokensDelta}` : tokensDelta,
      utilizationChange: utilizationDelta > 0 ? `+${utilizationDelta}%` : `${utilizationDelta}%`,
      messagesClass: messagesDelta > 0 ? 'text-success' : messagesDelta < 0 ? 'text-danger' : '',
      tokensClass: tokensDelta > 0 ? 'text-warning' : tokensDelta < 0 ? 'text-danger' : '',
      utilizationClass: utilizationDelta > 10 ? 'text-danger' : utilizationDelta > 5 ? 'text-warning' : 'text-success'
    }
  }, [detail?.comparison])

  if (!detail) return null

  const time = new Date(detail.timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  return (
    <div className="timeline-detail-overlay" onClick={onClose}>
      <div className="timeline-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="timeline-detail-header">
          <h3>📍 时间点详情</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="timeline-detail-body">
          {/* 时间信息 */}
          <div className="detail-section">
            <div className="detail-label">时间</div>
            <div className="detail-value">{time}</div>
          </div>

          {/* 统计指标 */}
          <div className="detail-section">
            <div className="detail-label">统计指标</div>
            <div className="stats-grid-mini">
              <div className="stat-mini">
                <div className="stat-value-mini">{detail.messages}</div>
                <div className="stat-label-mini">消息数</div>
              </div>
              <div className="stat-mini">
                <div className="stat-value-mini">{detail.tokens.toLocaleString()}</div>
                <div className="stat-label-mini">Tokens</div>
              </div>
              <div className="stat-mini">
                <div className={`stat-value-mini ${detail.utilization > 90 ? 'text-danger' : detail.utilization > 70 ? 'text-warning' : ''}`}>
                  {Math.round(detail.utilization * 100)}%
                </div>
                <div className="stat-label-mini">窗口使用率</div>
              </div>
            </div>
          </div>

          {/* 与上时间点对比 */}
          {stats && detail.comparison && (
            <div className="detail-section">
              <div className="detail-label">📊 与上一时间点对比</div>
              <div className="comparison-grid">
                <div className="comparison-item">
                  <span className="comparison-label">消息变化</span>
                  <span className={`comparison-value ${stats.messagesClass}`}>{stats.messagesChange} 条</span>
                </div>
                <div className="comparison-item">
                  <span className="comparison-label">Token 变化</span>
                  <span className={`comparison-value ${stats.tokensClass}`}>{stats.tokensChange}</span>
                </div>
                <div className="comparison-item">
                  <span className="comparison-label">窗口压力</span>
                  <span className={`comparison-value ${stats.utilizationClass}`}>{stats.utilizationChange}</span>
                </div>
              </div>

              {/* 新增消息 */}
              {detail.comparison.addedMessages.length > 0 && (
                <div className="changes-section">
                  <div className="changes-title text-success">✅ 新增消息 ({detail.comparison.addedMessages.length})</div>
                  <div className="messages-list">
                    {detail.comparison.addedMessages.map((msg, idx) => (
                      <div key={idx} className="message-item message-added">
                        <span className={`role-badge role-${msg.role}`}>{msg.role}</span>
                        <span className="message-tokens">{msg.tokens} tokens</span>
                        <div className="message-preview">{truncateContent(msg.content, 100)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 删除消息 */}
              {detail.comparison.removedMessages.length > 0 && (
                <div className="changes-section">
                  <div className="changes-title text-danger">❌ 删除消息 ({detail.comparison.removedMessages.length})</div>
                  <div className="messages-list">
                    {detail.comparison.removedMessages.map((msg, idx) => (
                      <div key={idx} className="message-item message-removed">
                        <span className={`role-badge role-${msg.role}`}>{msg.role}</span>
                        <span className="message-tokens">{msg.tokens} tokens</span>
                        <div className="message-preview">{truncateContent(msg.content, 100)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 上下文快照 */}
          <div className="detail-section">
            <div className="detail-label">📋 上下文快照</div>
            <div className="context-snapshot">
              <div className="snapshot-header">
                <span>总计 {detail.contextSnapshot.length} 条消息</span>
                <span className="snapshot-tokens">{detail.tokens.toLocaleString()} tokens</span>
              </div>
              <div className="snapshot-messages">
                {detail.contextSnapshot.map((msg, idx) => (
                  <div key={idx} className={`snapshot-message role-${msg.role}`}>
                    <div className="snapshot-message-header">
                      <span className={`role-badge role-${msg.role}`}>
                        {msg.role === 'system' && '🤖'}
                        {msg.role === 'user' && '👤'}
                        {msg.role === 'assistant' && '🤖'}
                        {msg.role === 'tool' && '🔧'} {msg.role}
                      </span>
                      <span className="message-tokens">{msg.tokens} tokens</span>
                      {msg.type && <span className="message-type">{msg.type}</span>}
                    </div>
                    <div className="snapshot-message-content">
                      {truncateContent(msg.content, 200)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 总结标记 */}
          {detail.summaryApplied && (
            <div className="detail-section">
              <div className="summary-badge">
                📝 已应用上下文总结
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// 辅助函数：截断内容
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content
  return content.slice(0, maxLength) + '...'
}
