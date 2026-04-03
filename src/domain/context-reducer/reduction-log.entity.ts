/**
 * ReductionLog 领域实体
 */

import type { BaseEntity } from '../../shared/types/common.js';
import type { ReductionEntry } from './types.js';

export class ReductionLogEntity implements BaseEntity {
  public readonly id?: number;
  public readonly timestamp: string;
  public readonly sessionId: string;
  public readonly stage: string;
  public readonly messageCountBefore: number;
  public readonly messageCountAfter: number;
  public readonly tokensBefore: number;
  public readonly tokensAfter: number;
  public readonly tokensSaved: number;
  public readonly reductions: ReductionEntry[];
  public readonly durationMs: number;
  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;

  constructor(props: {
    id?: number;
    timestamp: string;
    sessionId: string;
    stage: string;
    messageCountBefore: number;
    messageCountAfter: number;
    tokensBefore: number;
    tokensAfter: number;
    tokensSaved: number;
    reductions: ReductionEntry[];
    durationMs: number;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.id = props.id;
    this.timestamp = props.timestamp;
    this.sessionId = props.sessionId;
    this.stage = props.stage;
    this.messageCountBefore = props.messageCountBefore;
    this.messageCountAfter = props.messageCountAfter;
    this.tokensBefore = props.tokensBefore;
    this.tokensAfter = props.tokensAfter;
    this.tokensSaved = props.tokensSaved;
    this.reductions = props.reductions;
    this.durationMs = props.durationMs;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * 获取节省的 token 百分比
   */
  getSavingsPercent(): number {
    if (this.tokensBefore === 0) return 0;
    return Math.round((this.tokensSaved / this.tokensBefore) * 100);
  }
}
