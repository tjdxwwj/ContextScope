/**
 * SubagentLink DAO — all SQL for the `subagent_links` table
 */

import type { SubagentLinkData } from '../storage.js';
import { toJson, parseJson } from './base.dao.js';

function fromRow(row: any): SubagentLinkData {
  return {
    id: row.id,
    kind: row.kind ?? undefined,
    parentRunId: row.parent_run_id,
    childRunId: row.child_run_id ?? undefined,
    parentSessionId: row.parent_session_id ?? undefined,
    parentSessionKey: row.parent_session_key ?? undefined,
    childSessionKey: row.child_session_key ?? undefined,
    runtime: row.runtime ?? undefined,
    mode: row.mode ?? undefined,
    label: row.label ?? undefined,
    toolCallId: row.tool_call_id ?? undefined,
    timestamp: row.timestamp,
    endedAt: row.ended_at ?? undefined,
    outcome: row.outcome ?? undefined,
    error: row.error ?? undefined,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json),
  };
}

interface SubagentLinkFilters {
  parentRunId?: string;
  childRunId?: string;
  parentSessionId?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

function buildFilters(f: SubagentLinkFilters): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f.parentRunId)    { parts.push('parent_run_id = ?');     params.push(f.parentRunId); }
  if (f.childRunId)     { parts.push('child_run_id = ?');      params.push(f.childRunId); }
  if (f.parentSessionId){ parts.push('parent_session_id = ?'); params.push(f.parentSessionId); }
  if (f.startTime)      { parts.push('timestamp >= ?');        params.push(f.startTime); }
  if (f.endTime)        { parts.push('timestamp <= ?');        params.push(f.endTime); }
  return { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}

export class SubagentLinkDao {
  constructor(private db: any) {}

  upsert(data: SubagentLinkData): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO subagent_links (
        id, kind, parent_run_id, child_run_id, parent_session_id, parent_session_key, child_session_key,
        runtime, mode, label, tool_call_id, timestamp, ended_at, outcome, error, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id ?? null, data.kind ?? null, data.parentRunId, data.childRunId ?? null,
      data.parentSessionId ?? null, data.parentSessionKey ?? null, data.childSessionKey ?? null,
      data.runtime ?? null, data.mode ?? null, data.label ?? null, data.toolCallId ?? null,
      data.timestamp, data.endedAt ?? null, data.outcome ?? null,
      data.error ?? null, toJson(data.metadata)
    );
  }

  findByChildRunId(childRunId: string): SubagentLinkData | undefined {
    const row = this.db
      .prepare('SELECT * FROM subagent_links WHERE child_run_id = ? ORDER BY timestamp DESC, id DESC LIMIT 1')
      .get(childRunId);
    return row ? fromRow(row) : undefined;
  }

  findMany(filters: SubagentLinkFilters): SubagentLinkData[] {
    const { clause, params } = buildFilters(filters);
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 100;
    const rows = this.db.prepare(
      `SELECT * FROM subagent_links ${clause} ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
    return rows.map(fromRow);
  }

  count(): number {
    return Number(this.db.prepare('SELECT COUNT(1) as c FROM subagent_links').get()?.c ?? 0);
  }

  deleteOlderThan(ts: number): void {
    this.db.prepare('DELETE FROM subagent_links WHERE timestamp < ?').run(ts);
  }

  keepTopN(max: number): void {
    this.db.prepare(
      `DELETE FROM subagent_links WHERE id NOT IN (SELECT id FROM subagent_links ORDER BY timestamp DESC, id DESC LIMIT ?)`
    ).run(max);
  }

  deleteInRange(start: number, end: number): number {
    const count = Number(
      this.db.prepare('SELECT COUNT(1) as c FROM subagent_links WHERE timestamp >= ? AND timestamp <= ?').get(start, end)?.c ?? 0
    );
    this.db.prepare('DELETE FROM subagent_links WHERE timestamp >= ? AND timestamp <= ?').run(start, end);
    return count;
  }

  deleteAll(): number {
    const count = this.count();
    this.db.exec('DELETE FROM subagent_links');
    return count;
  }
}
