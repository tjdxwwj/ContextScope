import type { RunTreeNode } from '../data/runTree'

interface RunListProps {
  roots: RunTreeNode[]
  selectedRunId: string | null
  onSelectRun: (runId: string) => void
}

function RunCard({
  node,
  selectedRunId,
  onSelectRun,
  depth,
}: {
  node: RunTreeNode
  selectedRunId: string | null
  onSelectRun: (runId: string) => void
  depth: number
}) {
  const isSelected = node.runId === selectedRunId
  const shortId = node.runId.slice(0, 8) + (node.runId.length > 8 ? '…' : '')
  const timeStr = new Date(node.startTime).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div style={{ marginLeft: depth * 12 }}>
      <div
        className="request-item run-block"
        data-run-id={node.runId}
        onClick={() => onSelectRun(node.runId)}
        style={{
          borderLeft: isSelected ? '3px solid var(--primary)' : undefined,
          background: isSelected ? 'var(--bg-secondary)' : undefined,
        }}
      >
        <div className="request-header">
          <span className="request-provider" title={node.runId}>
            {shortId}
          </span>
          <span className="request-time">{timeStr}</span>
        </div>
        <div className="request-details">
          <span className={`badge badge-${node.status === 'success' ? 'output' : 'input'}`}>
            {node.status === 'running' ? 'Running' : node.status === 'success' ? 'Done' : node.status}
          </span>
          {node.model && <span>{node.provider || ''} / {node.model}</span>}
          <span>In: <strong>{(node.usage.input || 0).toLocaleString()}</strong></span>
          <span>Out: <strong>{(node.usage.output || 0).toLocaleString()}</strong></span>
          <span>Total: <strong>{(node.usage.total || 0).toLocaleString()}</strong>{node.usageEstimated ? ' (估算)' : ''}</span>
          {node.toolCalls.length > 0 && (
            <span title={node.toolCalls.map(t => t.toolName).join(', ')}>
              🔧 {node.toolCalls.length}
            </span>
          )}
        </div>
        {node.children.length > 0 && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            +{node.children.length} sub-run(s)
          </div>
        )}
      </div>
      {node.children.length > 0 &&
        node.children.map((child) => (
          <RunCard
            key={child.runId}
            node={child}
            selectedRunId={selectedRunId}
            onSelectRun={onSelectRun}
            depth={depth + 1}
          />
        ))}
    </div>
  )
}

export function RunList({ roots, selectedRunId, onSelectRun }: RunListProps) {
  if (roots.length === 0) {
    return (
      <div className="empty-state">
        暂无 run。请将 <code>docs/requests.json</code> 复制到 <code>public/data/requests.json</code> 后刷新。
      </div>
    )
  }
  return (
    <div className="requests-list run-list">
      {roots.map((node) => (
        <RunCard
          key={node.runId}
          node={node}
          selectedRunId={selectedRunId}
          onSelectRun={onSelectRun}
          depth={0}
        />
      ))}
    </div>
  )
}
