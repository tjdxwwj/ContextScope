/**
 * Request DAO — all SQL for the `requests` table
 */

import type { RequestData, RequestListItem, RequestQueryFilters } from '../storage.js';
import { toJson, parseJson } from './base.dao.js';

function fromRow(row: any): RequestData {
  return {
    id: row.id,
    type: row.type,
    runId: row.run_id,
    taskId: row.task_id ?? undefined,
    sessionId: row.session_id,
    sessionKey: row.session_key ?? undefined,
    provider: row.provider,
    model: row.model,
    timestamp: row.timestamp,
    prompt: row.prompt ?? undefined,
    systemPrompt: row.system_prompt ?? undefined,
    historyMessages: parseJson<unknown[]>(row.history_messages),
    assistantTexts: parseJson<string[]>(row.assistant_texts),
    usage: parseJson<RequestData['usage']>(row.usage_json),
    imagesCount: row.images_count ?? undefined,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json),
  };
}

function fromSummaryRow(row: any): RequestListItem {
  return {
    id: row.id,
    type: row.type,
    runId: row.run_id,
    taskId: row.task_id ?? undefined,
    sessionId: row.session_id,
    sessionKey: row.session_key ?? undefined,
    provider: row.provider,
    model: row.model,
    timestamp: row.timestamp,
    usage: parseJson<RequestData['usage']>(row.usage_json),
    imagesCount: row.images_count ?? undefined,
  };
}

function buildFilters(filters: RequestQueryFilters): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (filters.sessionId)  { parts.push('session_id = ?'); params.push(filters.sessionId); }
  if (filters.runId)      { parts.push('run_id = ?');     params.push(filters.runId); }
  if (filters.taskId)     { parts.push('task_id = ?');    params.push(filters.taskId); }
  if (filters.provider)   { parts.push('provider = ?');   params.push(filters.provider); }
  if (filters.model)      { parts.push('model = ?');      params.push(filters.model); }
  if (filters.startTime)  { parts.push('timestamp >= ?'); params.push(filters.startTime); }
  if (filters.endTime)    { parts.push('timestamp <= ?'); params.push(filters.endTime); }
  return { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params };
}

export class RequestDao {
  constructor(private db: any) {}

  upsert(data: RequestData): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO requests (
        id, type, run_id, task_id, session_id, session_key, provider, model, timestamp,
        prompt, system_prompt, history_messages, assistant_texts, usage_json, images_count, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id ?? null, data.type, data.runId, data.taskId ?? null,
      data.sessionId, data.sessionKey ?? null, data.provider, data.model, data.timestamp,
      data.prompt ?? null, data.systemPrompt ?? null,
      toJson(data.historyMessages), toJson(data.assistantTexts),
      toJson(data.usage), data.imagesCount ?? null, toJson(data.metadata)
    );
  }

  findInputByRunId(runId: string): RequestData | undefined {
    const row = this.db
      .prepare(`SELECT * FROM requests WHERE run_id = ? AND type = 'input' ORDER BY timestamp DESC, id DESC LIMIT 1`)
      .get(runId);
    return row ? fromRow(row) : undefined;
  }

  findMany(filters: RequestQueryFilters): RequestData[] {
    const { clause, params } = buildFilters(filters);
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 100;
    const rows = this.db.prepare(
      `SELECT * FROM requests ${clause} ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
    return rows.map(fromRow);
  }

  findSummaries(filters: RequestQueryFilters): RequestListItem[] {
    const { clause, params } = buildFilters(filters);
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? 100;
    const rows = this.db.prepare(
      `SELECT id, type, run_id, task_id, session_id, session_key, provider, model, timestamp, usage_json, images_count
       FROM requests ${clause} ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);
    return rows.map(fromSummaryRow);
  }

  count(): number {
    return Number(this.db.prepare('SELECT COUNT(1) as c FROM requests').get()?.c ?? 0);
  }

  countSince(ts: number): number {
    return Number(this.db.prepare('SELECT COUNT(1) as c FROM requests WHERE timestamp >= ?').get(ts)?.c ?? 0);
  }

  oldestTimestamp(): number | undefined {
    return this.db.prepare('SELECT timestamp FROM requests ORDER BY timestamp ASC LIMIT 1').get()?.timestamp;
  }

  deleteOlderThan(ts: number): void {
    this.db.prepare('DELETE FROM requests WHERE timestamp < ?').run(ts);
  }

  keepTopN(max: number): void {
    this.db.prepare(
      `DELETE FROM requests WHERE id NOT IN (SELECT id FROM requests ORDER BY timestamp DESC, id DESC LIMIT ?)`
    ).run(max);
  }

  deleteInRange(start: number, end: number): number {
    const count = Number(
      this.db.prepare('SELECT COUNT(1) as c FROM requests WHERE timestamp >= ? AND timestamp <= ?').get(start, end)?.c ?? 0
    );
    this.db.prepare('DELETE FROM requests WHERE timestamp >= ? AND timestamp <= ?').run(start, end);
    return count;
  }

  deleteAll(): number {
    const count = this.count();
    this.db.exec('DELETE FROM requests');
    return count;
  }
}
