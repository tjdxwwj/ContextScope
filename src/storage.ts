/**
 * ContextScope Storage Module
 * 
 * Handles persistent storage of request data using JSON files
 */

import path from 'node:path';
import fs from 'node:fs';

interface PluginLogger {
  debug?: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

export interface RequestData {
  id?: number;
  type: 'input' | 'output';
  runId: string;
  sessionId: string;
  sessionKey?: string;
  provider: string;
  model: string;
  timestamp: number;
  prompt?: string;
  systemPrompt?: string;
  historyMessages?: unknown[];
  assistantTexts?: string[];
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    total?: number;
  };
  imagesCount?: number;
  metadata?: Record<string, unknown>;
}

export interface SubagentLinkData {
  id?: number;
  kind?: 'spawn' | 'send';
  parentRunId: string;
  childRunId?: string;
  parentSessionId?: string;
  parentSessionKey?: string;
  childSessionKey?: string;
  runtime?: 'subagent' | 'acp';
  mode?: 'run' | 'session';
  label?: string;
  toolCallId?: string;
  timestamp: number;
  endedAt?: number;
  outcome?: 'success' | 'error' | 'timeout' | 'aborted' | 'unknown';
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolCallData {
  id?: number;
  runId: string;
  sessionId?: string;
  sessionKey?: string;
  toolName: string;
  toolCallId?: string;
  timestamp: number;
  startedAt?: number;
  durationMs?: number;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface StorageStats {
  totalRequests: number;
  todayRequests: number;
  weekRequests: number;
  storageSize: string;
  oldestRequest?: number;
  newestRequest?: number;
}

export interface StorageOptions {
  workspaceDir: string;
  maxRequests: number;
  retentionDays: number;
  compression: boolean;
  logger: PluginLogger;
}

export class RequestAnalyzerStorage {
  private dataFile: string;
  private requests: RequestData[] = [];
  private subagentLinks: SubagentLinkData[] = [];
  private toolCalls: ToolCallData[] = [];
  private options: StorageOptions;
  private initialized = false;
  private nextId = 1;
  private nextLinkId = 1;
  private nextToolCallId = 1;

  constructor(options: StorageOptions) {
    this.options = options;
    this.dataFile = path.join(options.workspaceDir, 'requests.json');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const dir = this.options.workspaceDir;
    
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Load existing data
      if (fs.existsSync(this.dataFile)) {
        const content = fs.readFileSync(this.dataFile, 'utf-8');
        const data = JSON.parse(content);
        this.requests = data.requests || [];
        this.subagentLinks = data.subagentLinks || [];
        this.toolCalls = data.toolCalls || [];
        this.nextId = data.nextId || (this.requests.length > 0 ? Math.max(...this.requests.map(r => r.id || 0)) + 1 : 1);
        this.nextLinkId = data.nextLinkId || (this.subagentLinks.length > 0 ? Math.max(...this.subagentLinks.map(r => r.id || 0)) + 1 : 1);
        this.nextToolCallId = data.nextToolCallId || (this.toolCalls.length > 0 ? Math.max(...this.toolCalls.map(r => r.id || 0)) + 1 : 1);
      }

      this.initialized = true;
      this.options.logger.info('ContextScope storage initialized');
    } catch (error) {
      this.options.logger.error(`Failed to initialize storage: ${error}`);
      throw error;
    }
  }

  private async persist(): Promise<void> {
    if (!this.initialized) return;

    try {
      const data = {
        requests: this.requests,
        subagentLinks: this.subagentLinks,
        toolCalls: this.toolCalls,
        nextId: this.nextId,
        nextLinkId: this.nextLinkId,
        nextToolCallId: this.nextToolCallId,
        lastUpdated: Date.now()
      };
      fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      this.options.logger.error(`Failed to persist data: ${error}`);
    }
  }

  async captureRequest(data: RequestData): Promise<void> {
    if (!this.initialized) await this.initialize();

    try {
      const requestWithId: RequestData = {
        ...data,
        id: this.nextId++
      };

      this.requests.unshift(requestWithId); // Add to beginning for latest-first order

      // Cleanup old requests if needed
      this.cleanupOldRequests();
      
      // Persist to disk (debounced in production, but simple here)
      await this.persist();
      
    } catch (error) {
      this.options.logger.error(`Failed to capture request: ${error}`);
      throw error;
    }
  }

  async captureSubagentLink(data: SubagentLinkData): Promise<void> {
    if (!this.initialized) await this.initialize();

    try {
      const recordWithId: SubagentLinkData = {
        ...data,
        kind: data.kind ?? 'spawn',
        outcome: data.outcome ?? undefined,
        id: this.nextLinkId++
      };

      this.subagentLinks.unshift(recordWithId);
      this.cleanupOldRequests();
      await this.persist();
    } catch (error) {
      this.options.logger.error(`Failed to capture subagent link: ${error}`);
      throw error;
    }
  }

  async updateSubagentLinkByChildRunId(params: {
    childRunId: string;
    patch: Partial<Pick<SubagentLinkData, 'endedAt' | 'outcome' | 'error' | 'metadata'>>;
  }): Promise<void> {
    if (!this.initialized) await this.initialize();

    const childRunId = params.childRunId.trim();
    if (!childRunId) {
      return;
    }

    const idx = this.subagentLinks.findIndex(r => r.childRunId === childRunId);
    if (idx < 0) {
      return;
    }

    const current = this.subagentLinks[idx];
    const next: SubagentLinkData = {
      ...current,
      ...params.patch,
      metadata: {
        ...(current.metadata || {}),
        ...(params.patch.metadata || {})
      }
    };
    this.subagentLinks[idx] = next;
    await this.persist();
  }

  async captureToolCall(data: ToolCallData): Promise<void> {
    if (!this.initialized) await this.initialize();

    try {
      const recordWithId: ToolCallData = {
        ...data,
        id: this.nextToolCallId++
      };
      this.toolCalls.unshift(recordWithId);
      this.cleanupOldRequests();
      await this.persist();
    } catch (error) {
      this.options.logger.error(`Failed to capture tool call: ${error}`);
      throw error;
    }
  }

  async getRequests(filters: {
    sessionId?: string;
    runId?: string;
    provider?: string;
    model?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<RequestData[]> {
    if (!this.initialized) await this.initialize();

    let filtered = [...this.requests];

    if (filters.sessionId) {
      filtered = filtered.filter(r => r.sessionId === filters.sessionId);
    }
    if (filters.runId) {
      filtered = filtered.filter(r => r.runId === filters.runId);
    }
    if (filters.provider) {
      filtered = filtered.filter(r => r.provider === filters.provider);
    }
    if (filters.model) {
      filtered = filtered.filter(r => r.model === filters.model);
    }
    if (filters.startTime) {
      filtered = filtered.filter(r => r.timestamp >= filters.startTime!);
    }
    if (filters.endTime) {
      filtered = filtered.filter(r => r.timestamp <= filters.endTime!);
    }

    const offset = filters.offset || 0;
    const limit = filters.limit || 100;

    return filtered.slice(offset, offset + limit);
  }

  async getToolCalls(filters: {
    runId?: string;
    sessionId?: string;
    toolName?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  } = {}): Promise<ToolCallData[]> {
    if (!this.initialized) await this.initialize();

    let filtered = [...this.toolCalls];

    if (filters.runId) {
      filtered = filtered.filter(r => r.runId === filters.runId);
    }
    if (filters.sessionId) {
      filtered = filtered.filter(r => r.sessionId === filters.sessionId);
    }
    if (filters.toolName) {
      filtered = filtered.filter(r => r.toolName === filters.toolName);
    }
    if (filters.startTime) {
      filtered = filtered.filter(r => r.timestamp >= filters.startTime!);
    }
    if (filters.endTime) {
      filtered = filtered.filter(r => r.timestamp <= filters.endTime!);
    }

    const offset = filters.offset || 0;
    const limit = filters.limit || 100;
    return filtered.slice(offset, offset + limit);
  }

  async getSubagentLinks(filters: {
    parentRunId?: string;
    childRunId?: string;
    parentSessionId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<SubagentLinkData[]> {
    if (!this.initialized) await this.initialize();

    let filtered = [...this.subagentLinks];

    if (filters.parentRunId) {
      filtered = filtered.filter(r => r.parentRunId === filters.parentRunId);
    }
    if (filters.childRunId) {
      filtered = filtered.filter(r => r.childRunId === filters.childRunId);
    }
    if (filters.parentSessionId) {
      filtered = filtered.filter(r => r.parentSessionId === filters.parentSessionId);
    }

    const offset = filters.offset || 0;
    const limit = filters.limit || 100;
    return filtered.slice(offset, offset + limit);
  }

  async getStats(): Promise<StorageStats> {
    if (!this.initialized) await this.initialize();

    const now = Date.now();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const todayTime = today.getTime();
    const weekAgoTime = weekAgo.getTime();

    const totalRequests = this.requests.length;
    const todayRequests = this.requests.filter(r => r.timestamp >= todayTime).length;
    const weekRequests = this.requests.filter(r => r.timestamp >= weekAgoTime).length;
    const oldestRequest = this.requests.length > 0 ? this.requests[this.requests.length - 1].timestamp : undefined;

    return {
      totalRequests,
      todayRequests,
      weekRequests,
      storageSize: this.getDatabaseSize(),
      oldestRequest,
      newestRequest: now
    };
  }

  private getDatabaseSize(): string {
    try {
      if (!fs.existsSync(this.dataFile)) return '0 B';
      const stats = fs.statSync(this.dataFile);
      const bytes = stats.size;
      
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    } catch {
      return '0 B';
    }
  }

  private cleanupOldRequests(): void {
    const cutoffTime = Date.now() - (this.options.retentionDays * 24 * 60 * 60 * 1000);
    
    // Remove old requests
    this.requests = this.requests.filter(r => r.timestamp >= cutoffTime);
    this.subagentLinks = this.subagentLinks.filter(r => r.timestamp >= cutoffTime);
    this.toolCalls = this.toolCalls.filter(r => r.timestamp >= cutoffTime);
    
    // Remove excess requests if over limit
    if (this.requests.length > this.options.maxRequests) {
      this.requests = this.requests.slice(0, this.options.maxRequests);
    }
    if (this.subagentLinks.length > this.options.maxRequests) {
      this.subagentLinks = this.subagentLinks.slice(0, this.options.maxRequests);
    }
    if (this.toolCalls.length > this.options.maxRequests) {
      this.toolCalls = this.toolCalls.slice(0, this.options.maxRequests);
    }
  }

  async close(): Promise<void> {
    await this.persist();
    this.initialized = false;
  }
}
