/**
 * Request 领域实体
 */

import type { BaseEntity, RequestType } from '../../shared/types/common.js';

export interface RequestUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  total?: number;
}

export interface RequestMetadata {
  agentId?: string;
  channelId?: string;
  trigger?: string;
  [key: string]: unknown;
}

/**
 * Request 实体
 */
export class RequestEntity implements BaseEntity {
  public readonly id?: number;
  public readonly type: RequestType;
  public readonly runId: string;
  public readonly taskId?: string;
  public readonly sessionId: string;
  public readonly sessionKey?: string;
  public readonly provider: string;
  public readonly model: string;
  public readonly timestamp: number;
  
  // 输入相关
  public readonly prompt?: string;
  public readonly systemPrompt?: string;
  public readonly historyMessages?: unknown[];
  
  // 输出相关
  public readonly assistantTexts?: string[];
  
  // Token 使用
  public readonly usage?: RequestUsage;
  
  // 其他
  public readonly imagesCount?: number;
  public readonly metadata?: RequestMetadata;
  
  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;

  constructor(props: {
    id?: number;
    type: RequestType;
    runId: string;
    taskId?: string;
    sessionId: string;
    sessionKey?: string;
    provider: string;
    model: string;
    timestamp: number;
    prompt?: string;
    systemPrompt?: string;
    historyMessages?: unknown[];
    assistantTexts?: string[];
    usage?: RequestUsage;
    imagesCount?: number;
    metadata?: RequestMetadata;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.id = props.id;
    this.type = props.type;
    this.runId = props.runId;
    this.taskId = props.taskId;
    this.sessionId = props.sessionId;
    this.sessionKey = props.sessionKey;
    this.provider = props.provider;
    this.model = props.model;
    this.timestamp = props.timestamp;
    this.prompt = props.prompt;
    this.systemPrompt = props.systemPrompt;
    this.historyMessages = props.historyMessages;
    this.assistantTexts = props.assistantTexts;
    this.usage = props.usage;
    this.imagesCount = props.imagesCount;
    this.metadata = props.metadata;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * 计算总 token 数
   */
  getTotalTokens(): number {
    if (!this.usage) return 0;
    return this.usage.total || (this.usage.input || 0) + (this.usage.output || 0);
  }

  /**
   * 判断是否为输入请求
   */
  isInput(): boolean {
    return this.type === 'input';
  }

  /**
   * 判断是否为输出请求
   */
  isOutput(): boolean {
    return this.type === 'output';
  }
}
