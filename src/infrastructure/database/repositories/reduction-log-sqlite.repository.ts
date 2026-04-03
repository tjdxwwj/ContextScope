/**
 * ReductionLog SQLite Repository 实现
 */

import { inject, injectable } from 'inversify';
import { ReductionLogEntity } from '../../../domain/context-reducer/reduction-log.entity.js';
import type { IReductionLogRepository, ReductionLogStats } from '../../../domain/context-reducer/reduction-log.repository.js';
import type { ReductionEntry } from '../../../domain/context-reducer/types.js';
import { SqliteClient } from '../sqlite.client.js';
import { DatabaseError } from '../../../shared/errors/app-error.js';
import { TYPES } from '../../../app/types.js';

@injectable()
export class ReductionLogSqliteRepository implements IReductionLogRepository {
  constructor(
    @inject(TYPES.SqliteClient) private readonly sqliteClient: SqliteClient
  ) {}

  async save(log: ReductionLogEntity): Promise<ReductionLogEntity> {
    try {
      const db = this.sqliteClient.getDatabase();

      const stmt = db.prepare(`
        INSERT INTO reduction_logs (
          timestamp, sessionId, stage, messageCountBefore, messageCountAfter,
          tokensBefore, tokensAfter, tokensSaved, reductions, durationMs
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        log.timestamp,
        log.sessionId,
        log.stage,
        log.messageCountBefore,
        log.messageCountAfter,
        log.tokensBefore,
        log.tokensAfter,
        log.tokensSaved,
        JSON.stringify(log.reductions),
        log.durationMs
      );

      return new ReductionLogEntity({
        ...log,
        id: Number(result.lastInsertRowid),
      });
    } catch (error) {
      throw new DatabaseError('Failed to save reduction log', error as Error);
    }
  }

  async findRecent(limit: number, sessionId?: string): Promise<ReductionLogEntity[]> {
    try {
      const db = this.sqliteClient.getDatabase();

      const stmt = sessionId
        ? db.prepare(`
            SELECT * FROM reduction_logs
            WHERE sessionId = ?
            ORDER BY createdAt DESC
            LIMIT ?
          `)
        : db.prepare(`
            SELECT * FROM reduction_logs
            ORDER BY createdAt DESC
            LIMIT ?
          `);

      const rows: any[] = sessionId ? stmt.all(sessionId, limit) : stmt.all(limit);
      return rows.map(row => this.mapRowToEntity(row));
    } catch (error) {
      throw new DatabaseError('Failed to find recent reduction logs', error as Error);
    }
  }

  async getStats(sessionId?: string): Promise<ReductionLogStats> {
    try {
      const db = this.sqliteClient.getDatabase();

      const query = sessionId
        ? `SELECT
             COUNT(*) as totalReductions,
             COALESCE(SUM(tokensSaved), 0) as totalTokensSaved,
             COALESCE(AVG(tokensSaved), 0) as avgTokensSaved,
             COALESCE(AVG(durationMs), 0) as avgDurationMs
           FROM reduction_logs WHERE sessionId = ?`
        : `SELECT
             COUNT(*) as totalReductions,
             COALESCE(SUM(tokensSaved), 0) as totalTokensSaved,
             COALESCE(AVG(tokensSaved), 0) as avgTokensSaved,
             COALESCE(AVG(durationMs), 0) as avgDurationMs
           FROM reduction_logs`;

      const stmt = db.prepare(query);
      const row: any = sessionId ? stmt.get(sessionId) : stmt.get();

      return {
        totalReductions: row?.totalReductions ?? 0,
        totalTokensSaved: row?.totalTokensSaved ?? 0,
        avgTokensSaved: Math.round(row?.avgTokensSaved ?? 0),
        avgDurationMs: Math.round(row?.avgDurationMs ?? 0),
      };
    } catch (error) {
      throw new DatabaseError('Failed to get reduction log stats', error as Error);
    }
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    try {
      const db = this.sqliteClient.getDatabase();
      const stmt = db.prepare('DELETE FROM reduction_logs WHERE createdAt < ?');
      const result = stmt.run(timestamp);
      return Number(result.changes);
    } catch (error) {
      throw new DatabaseError('Failed to delete old reduction logs', error as Error);
    }
  }

  private mapRowToEntity(row: any): ReductionLogEntity {
    return new ReductionLogEntity({
      id: row.id,
      timestamp: row.timestamp,
      sessionId: row.sessionId,
      stage: row.stage,
      messageCountBefore: row.messageCountBefore,
      messageCountAfter: row.messageCountAfter,
      tokensBefore: row.tokensBefore,
      tokensAfter: row.tokensAfter,
      tokensSaved: row.tokensSaved,
      reductions: row.reductions ? JSON.parse(row.reductions) as ReductionEntry[] : [],
      durationMs: row.durationMs,
      createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
    });
  }
}
