/**
 * Task DAO — all SQL for the `tasks` table
 */

import type { TaskData } from '../models/shared-types.js';
import { toJson, parseJson } from './base.dao.js';

function fromRow(row: any): TaskData {
  return {
    taskId: row.task_id,
    sessionId: row.session_id,
    sessionKey: row.session_key ?? undefined,
    parentTaskId: row.parent_task_id ?? undefined,
    parentSessionId: row.parent_session_id ?? undefined,
    startTime: row.start_time,
    endTime: row.end_time ?? undefined,
    duration: row.duration ?? undefined,
    status: row.status ?? 'running',
    endReason: row.end_reason ?? undefined,
    error: row.error ?? undefined,
    llmCalls: row.llm_calls ?? 0,
    toolCalls: row.tool_calls ?? 0,
    subagentSpawns: row.subagent_spawns ?? 0,
    runIds: parseJson<string[]>(row.run_ids_json) ?? [],
    childTaskIds: parseJson<string[]>(row.child_task_ids_json),
    metadata: parseJson<TaskData['metadata']>(row.metadata_json) ?? {},
    stats: {
      llmCalls: row.llm_calls ?? 0,
      toolCalls: row.tool_calls ?? 0,
      subagentSpawns: row.subagent_spawns ?? 0,
      totalInput: row.total_input ?? 0,
      totalOutput: row.total_output ?? 0,
      totalTokens: row.total_tokens ?? 0,
      estimatedCost: row.estimated_cost ?? 0,
    },
  };
}

export class TaskDao {
  constructor(private db: any) {}

  upsert(data: TaskData): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO tasks (
        task_id, session_id, session_key, parent_task_id, parent_session_id,
        start_time, end_time, duration, status, end_reason, error,
        llm_calls, tool_calls, subagent_spawns,
        total_input, total_output, total_tokens, estimated_cost,
        run_ids_json, child_task_ids_json, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.taskId, data.sessionId, data.sessionKey ?? null,
      data.parentTaskId ?? null, data.parentSessionId ?? null,
      data.startTime, data.endTime ?? null, data.duration ?? null,
      data.status ?? null, data.endReason ?? null, data.error ?? null,
      data.stats?.llmCalls ?? data.llmCalls ?? 0,
      data.stats?.toolCalls ?? data.toolCalls ?? 0,
      data.stats?.subagentSpawns ?? data.subagentSpawns ?? 0,
      data.stats?.totalInput ?? data.tokenStats?.totalInput ?? 0,
      data.stats?.totalOutput ?? data.tokenStats?.totalOutput ?? 0,
      data.stats?.totalTokens ?? data.tokenStats?.totalTokens ?? 0,
      data.stats?.estimatedCost ?? data.tokenStats?.estimatedCost ?? 0,
      toJson(data.runIds), toJson(data.childTaskIds), toJson(data.metadata)
    );
  }

  findById(taskId: string): TaskData | undefined {
    const row = this.db.prepare('SELECT * FROM tasks WHERE task_id = ? LIMIT 1').get(taskId);
    return row ? fromRow(row) : undefined;
  }

  findBySessionId(sessionId: string): TaskData | undefined {
    const row = this.db
      .prepare('SELECT * FROM tasks WHERE session_id = ? ORDER BY start_time DESC LIMIT 1')
      .get(sessionId);
    return row ? fromRow(row) : undefined;
  }

  findBySessionKey(sessionKey: string): TaskData | undefined {
    const row = this.db
      .prepare('SELECT * FROM tasks WHERE session_key = ? ORDER BY start_time DESC LIMIT 1')
      .get(sessionKey);
    return row ? fromRow(row) : undefined;
  }

  findRecent(limit: number, sessionId?: string): TaskData[] {
    if (sessionId) {
      const rows = this.db
        .prepare('SELECT * FROM tasks WHERE session_id = ? ORDER BY start_time DESC LIMIT ?')
        .all(sessionId, limit);
      return rows.map(fromRow);
    }
    // Root tasks only (no parent)
    const rows = this.db
      .prepare('SELECT * FROM tasks WHERE parent_task_id IS NULL ORDER BY start_time DESC LIMIT ?')
      .all(limit);
    return rows.map(fromRow);
  }

  findBySessionIdMany(sessionId: string, limit: number): TaskData[] {
    const rows = this.db
      .prepare('SELECT * FROM tasks WHERE session_id = ? ORDER BY start_time DESC LIMIT ?')
      .all(sessionId, limit);
    return rows.map(fromRow);
  }
}
