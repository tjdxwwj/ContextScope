import type { RunTreeNode, ToolCallSummary } from '../data/runTree'

interface RunDetailProps {
  node: RunTreeNode | null
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function ToolCallsRow({ tools }: { tools: ToolCallSummary[] }) {
  if (tools.length === 0) return null
  return (
    <div className="detail-section">
      <div className="detail-label">工具调用 ({tools.length})</div>
      <div className="tool-calls-timeline">
        {tools.map((t, i) => (
          <div key={t.toolCallId || i} className="timeline-point">
            <div className="timeline-content">
              <strong>{t.toolName}</strong>
              <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>
                {formatTime(t.timestamp)}
              </span>
              {t.durationMs != null && (
                <span style={{ marginLeft: 8 }}>{t.durationMs}ms</span>
              )}
              {t.error && (
                <span style={{ color: 'var(--danger)', marginLeft: 8 }}>{t.error}</span>
              )}
              {/* 显示工具参数 */}
              {t.params && Object.keys(t.params).length > 0 && (
                <div style={{ marginTop: 8, fontSize: '0.8rem', background: 'var(--bg-secondary)', padding: 8, borderRadius: 4 }}>
                  <div style={{ fontWeight: 'bold', marginBottom: 4, color: 'var(--text-secondary)' }}>参数:</div>
                  <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {JSON.stringify(t.params, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function RunDetail({ node }: RunDetailProps) {
  if (!node) {
    return (
      <div className="empty-state" style={{ padding: 40 }}>
        在左侧点击一个 run 查看详情与时间线
      </div>
    )
  }

  const total = node.usage.input + node.usage.output || 0

  return (
    <div className="run-detail">
      <div className="detail-section">
        <div className="detail-label">Run ID</div>
        <div className="detail-value" style={{ fontFamily: 'monospace', fontSize: '0.9rem', wordBreak: 'break-all' }}>
          {node.runId}
        </div>
      </div>
      {node.sessionKey && (
        <div className="detail-section">
          <div className="detail-label">Session Key</div>
          <div className="detail-value" style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {node.sessionKey}
          </div>
        </div>
      )}
      <div className="detail-section">
        <div className="detail-label">时间范围</div>
        <div className="detail-value">
          {formatTime(node.startTime)} → {formatTime(node.endTime)}
          <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>
            ({(node.endTime - node.startTime) / 1000}s)
          </span>
        </div>
      </div>
      <div className="stats-grid-mini" style={{ marginBottom: 16 }}>
        <div className="stat-mini">
          <div className="stat-value-mini">{node.usage.input.toLocaleString()}</div>
          <div className="stat-label-mini">Input tokens{node.usageEstimated ? ' (估算)' : ''}</div>
        </div>
        <div className="stat-mini">
          <div className="stat-value-mini">{node.usage.output.toLocaleString()}</div>
          <div className="stat-label-mini">Output tokens{node.usageEstimated ? ' (估算)' : ''}</div>
        </div>
        <div className="stat-mini">
          <div className="stat-value-mini">{(node.usage.total || total).toLocaleString()}</div>
          <div className="stat-label-mini">Total tokens{node.usageEstimated ? ' (估算)' : ''}</div>
        </div>
        <div className="stat-mini">
          <div className="stat-value-mini">{node.requestCount}</div>
          <div className="stat-label-mini">Requests</div>
        </div>
      </div>
      <div className="detail-section">
        <div className="detail-label">Token 占比（输入/输出）</div>
        <div className="progress-bar" style={{ height: 12, marginTop: 8, display: 'flex' }}>
          <div
            className="progress-fill"
            style={{
              width: `${total ? (node.usage.input / total) * 100 : 0}%`,
              background: 'var(--primary)',
            }}
          />
          <div
            style={{
              width: `${total ? (node.usage.output / total) * 100 : 0}%`,
              background: 'var(--success)',
              borderRadius: '0 4px 4px 0',
            }}
          />
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
          Input {node.usage.input.toLocaleString()} / Output {node.usage.output.toLocaleString()}
          {node.usageEstimated && ' · 数值为按内容长度估算，原始 usage 未提供'}
        </div>
      </div>

      {/* 完整的 Output 内容展示 */}
      <div className="detail-section">
        <div className="detail-label">完整 Output 内容</div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
          包含 LLM 文字回复和工具调用参数（完整的花费内容）
        </div>
        
        {/* LLM 文字回复 */}
        {node.assistantTexts && node.assistantTexts.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4, color: 'var(--primary)' }}>📝 LLM 文字回复:</div>
            <div style={{ 
              background: 'var(--bg-secondary)', 
              padding: 12, 
              borderRadius: 6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontSize: '0.85rem',
              lineHeight: 1.6
            }}>
              {node.assistantTexts.join('\n\n')}
            </div>
          </div>
        )}
        
        {/* 工具调用参数 */}
        {node.toolCalls && node.toolCalls.length > 0 && (
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: 4, color: 'var(--success)' }}>🛠️ 工具调用参数 ({node.toolCalls.length} 次):</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {node.toolCalls.map((t, i) => (
                <div key={i} style={{ 
                  background: 'var(--bg-secondary)', 
                  padding: 10, 
                  borderRadius: 6,
                  fontSize: '0.8rem',
                  fontFamily: 'monospace'
                }}>
                  <div style={{ fontWeight: 'bold', color: 'var(--text-secondary)', marginBottom: 4 }}>
                    {t.toolName} {t.durationMs ? `(${t.durationMs}ms)` : ''}
                  </div>
                  {t.params && Object.keys(t.params).length > 0 ? (
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {JSON.stringify(t.params, null, 2)}
                    </pre>
                  ) : (
                    <div style={{ color: 'var(--text-secondary)' }}>无参数</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {node.model && (
        <div className="detail-section">
          <div className="detail-label">Model</div>
          <div className="detail-value">
            {node.provider} / {node.model}
          </div>
        </div>
      )}
      <ToolCallsRow tools={node.toolCalls} />
      {node.children.length > 0 && (
        <div className="detail-section">
          <div className="detail-label">子 Run ({node.children.length})</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {node.children.map((c) => (
              <li
                key={c.runId}
                style={{
                  padding: '8px 12px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 6,
                  marginBottom: 6,
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                }}
              >
                {c.runId.slice(0, 8)}… · {c.usage.total.toLocaleString()} tokens · {c.status}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
