/**
 * ToolCall DAO — all SQL for the `tool_calls` table
 */

import type { ToolCallData } from '../storage.js';
import { toJson, parseJson } from './base.dao.js';

function fromRow(row: any): ToolCallData {
  return {
    id: row.id,
    runId: row.run_id,
    sessionId: row.session_id ?? undefined,
    sessionKey: row.session_key ?? undefined,
    toolName: row.tool_name,
    toolCallId: row.tool_call_id ?? undefined,
    timestamp: row.timestamp,
    startedAt: row.started_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    params: parseJson<Record<string, unknown>>(row.params_json),
    result: parseJson<unknown>(row.result_json),
    error: row.error ?? undefined,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json),
  };
}

interface ToolCallFilters {
  runId?: string;
  sessionId?: string;
  toolName?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

function buildFilters(f: ToolCallFilters): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f.runId)      { parts.push('run_id = ?');     params.push(f.runId); }
  if (f.sessionId)  { parts.push('session_id = ?'); params.push(f.sessionId); }
  if (f.toolName)   { parts.push('tool_name = ?');  params.push(f.toolName); }
  if (f.startTime)  { parts.push('timestamp >= ?'); params.push(f.startTime); }
  if (f.endTime)    { parts.push('timestamp <= ?'); params.push(f.endTime); }
  return { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}

export class ToolCallDao {
  constructor(private db: any) {}

  upsert(data: ToolCallData): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO tool_calls (
        id, run_id, session_id, session_key, tool_name, tool_call_id, timestamp, started_at,
        duration_ms, params_json, result_json, error, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id ?? null, data.runId, data.sessionId ?? null, data.sessionKey ?? null,
      data.toolName, data.toolCallId ?? null, data.timestamp, data.startedAt ?? null,
      data.durationMs ?? null, toJson(data.params), toJson(data.result),
      data.error ?? null, toJson(data.metadata)
    );
  }

  findMany(filters: ToolCallFilters): ToolCallData[] {
    const { clause, params } = buildFilters(filters);
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 100;
    const rows = this.db.prepare(
      `SELECT * FROM tool_calls ${clause} ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
    return rows.map(fromRow);
  }

  count(): number {
    return Number(this.db.prepare('SELECT COUNT(1) as c FROM tool_calls').get()?.c ?? 0);
  }

  deleteOlderThan(ts: number): void {
    this.db.prepare('DELETE FROM tool_calls WHERE timestamp < ?').run(ts);
  }

  keepTopN(max: number): void {
    this.db.prepare(
      `DELETE FROM tool_calls WHERE id NOT IN (SELECT id FROM tool_calls ORDER BY timestamp DESC, id DESC LIMIT ?)`
    ).run(max);
  }

  deleteInRange(start: number, end: number): number {
    const count = Number(
      this.db.prepare('SELECT COUNT(1) as c FROM tool_calls WHERE timestamp >= ? AND timestamp <= ?').get(start, end)?.c ?? 0
    );
    this.db.prepare('DELETE FROM tool_calls WHERE timestamp >= ? AND timestamp <= ?').run(start, end);
    return count;
  }

  deleteAll(): number {
    const count = this.count();
    this.db.exec('DELETE FROM tool_calls');
    return count;
  }
}
