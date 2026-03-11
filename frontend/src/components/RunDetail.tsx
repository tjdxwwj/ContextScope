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
