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
  private legacyDataFile: string;
  private metaFile: string;
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
    this.legacyDataFile = path.join(options.workspaceDir, 'requests.json');
    this.metaFile = path.join(options.workspaceDir, 'storage-meta.json');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const dir = this.options.workspaceDir;
    
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.metaFile)) {
        const metaContent = fs.readFileSync(this.metaFile, 'utf-8');
        const meta = JSON.parse(metaContent);
        this.nextId = meta.nextId || 1;
        this.nextLinkId = meta.nextLinkId || 1;
        this.nextToolCallId = meta.nextToolCallId || 1;
      }

      if (fs.existsSync(this.legacyDataFile)) {
        const content = fs.readFileSync(this.legacyDataFile, 'utf-8');
        const data = JSON.parse(content);
        this.requests.push(...(data.requests || []));
        this.subagentLinks.push(...(data.subagentLinks || []));
        this.toolCalls.push(...(data.toolCalls || []));
        this.nextId = Math.max(this.nextId, data.nextId || 1);
        this.nextLinkId = Math.max(this.nextLinkId, data.nextLinkId || 1);
        this.nextToolCallId = Math.max(this.nextToolCallId, data.nextToolCallId || 1);
      }

      const datedFiles = this.getDatedDataFiles();
      for (const filePath of datedFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        this.requests.push(...(data.requests || []));
        this.subagentLinks.push(...(data.subagentLinks || []));
        this.toolCalls.push(...(data.toolCalls || []));
      }

      this.requests = this.sortByTimestampDesc(this.requests);
      this.subagentLinks = this.sortByTimestampDesc(this.subagentLinks);
      this.toolCalls = this.sortByTimestampDesc(this.toolCalls);
      this.requests = this.deduplicateById(this.requests);
      this.subagentLinks = this.deduplicateById(this.subagentLinks);
      this.toolCalls = this.deduplicateById(this.toolCalls);

      this.nextId = Math.max(this.nextId, this.getNextIdFromItems(this.requests));
      this.nextLinkId = Math.max(this.nextLinkId, this.getNextIdFromItems(this.subagentLinks));
      this.nextToolCallId = Math.max(this.nextToolCallId, this.getNextIdFromItems(this.toolCalls));

      const hadLegacyFile = fs.existsSync(this.legacyDataFile);

      this.initialized = true;

      if (hadLegacyFile) {
        await this.persist();
        fs.unlinkSync(this.legacyDataFile);
      }

      this.options.logger.info('ContextScope storage initialized');
    } catch (error) {
      this.options.logger.error(`Failed to initialize storage: ${error}`);
      throw error;
    }
  }

  private async persist(): Promise<void> {
    if (!this.initialized) return;

    try {
      const grouped = new Map<string, {
        requests: RequestData[];
        subagentLinks: SubagentLinkData[];
        toolCalls: ToolCallData[];
      }>();

      for (const request of this.requests) {
        const key = this.getDateKey(request.timestamp);
        if (!grouped.has(key)) {
          grouped.set(key, { requests: [], subagentLinks: [], toolCalls: [] });
        }
        grouped.get(key)!.requests.push(request);
      }

      for (const link of this.subagentLinks) {
        const key = this.getDateKey(link.timestamp);
        if (!grouped.has(key)) {
          grouped.set(key, { requests: [], subagentLinks: [], toolCalls: [] });
        }
        grouped.get(key)!.subagentLinks.push(link);
      }

      for (const toolCall of this.toolCalls) {
        const key = this.getDateKey(toolCall.timestamp);
        if (!grouped.has(key)) {
          grouped.set(key, { requests: [], subagentLinks: [], toolCalls: [] });
        }
        grouped.get(key)!.toolCalls.push(toolCall);
      }

      const activeFiles = new Set<string>();
      for (const [dateKey, data] of grouped) {
        const filePath = this.getDataFilePath(dateKey);
        activeFiles.add(path.basename(filePath));
        const payload = {
          date: dateKey,
          requests: this.sortByTimestampDesc(data.requests),
          subagentLinks: this.sortByTimestampDesc(data.subagentLinks),
          toolCalls: this.sortByTimestampDesc(data.toolCalls),
          lastUpdated: Date.now()
        };
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
      }

      for (const oldFilePath of this.getDatedDataFiles()) {
        const fileName = path.basename(oldFilePath);
        if (!activeFiles.has(fileName)) {
          fs.unlinkSync(oldFilePath);
        }
      }

      const meta = {
        nextId: this.nextId,
        nextLinkId: this.nextLinkId,
        nextToolCallId: this.nextToolCallId,
        lastUpdated: Date.now()
      };
      fs.writeFileSync(this.metaFile, JSON.stringify(meta, null, 2), 'utf-8');
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

  /**
   * Get the input request for a specific runId
   */
  async getInputForRun(runId: string): Promise<RequestData | undefined> {
    if (!this.initialized) await this.initialize();
    return this.requests.find(r => r.runId === runId && r.type === 'input');
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
    startTime?: number;
    endTime?: number;
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
      let bytes = 0;
      if (fs.existsSync(this.metaFile)) {
        bytes += fs.statSync(this.metaFile).size;
      }
      if (fs.existsSync(this.legacyDataFile)) {
        bytes += fs.statSync(this.legacyDataFile).size;
      }
      for (const filePath of this.getDatedDataFiles()) {
        bytes += fs.statSync(filePath).size;
      }
      
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

  async clearByDate(dateKey: string): Promise<{ date: string; removedRequests: number; removedSubagentLinks: number; removedToolCalls: number }> {
    if (!this.initialized) await this.initialize();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new Error('Invalid date format, expected YYYY-MM-DD');
    }

    const beforeRequests = this.requests.length;
    const beforeLinks = this.subagentLinks.length;
    const beforeToolCalls = this.toolCalls.length;

    this.requests = this.requests.filter(item => this.getDateKey(item.timestamp) !== dateKey);
    this.subagentLinks = this.subagentLinks.filter(item => this.getDateKey(item.timestamp) !== dateKey);
    this.toolCalls = this.toolCalls.filter(item => this.getDateKey(item.timestamp) !== dateKey);

    await this.persist();

    return {
      date: dateKey,
      removedRequests: beforeRequests - this.requests.length,
      removedSubagentLinks: beforeLinks - this.subagentLinks.length,
      removedToolCalls: beforeToolCalls - this.toolCalls.length
    };
  }

  async clearAll(): Promise<{ removedRequests: number; removedSubagentLinks: number; removedToolCalls: number }> {
    if (!this.initialized) await this.initialize();

    const removedRequests = this.requests.length;
    const removedSubagentLinks = this.subagentLinks.length;
    const removedToolCalls = this.toolCalls.length;

    this.requests = [];
    this.subagentLinks = [];
    this.toolCalls = [];

    await this.persist();

    return {
      removedRequests,
      removedSubagentLinks,
      removedToolCalls
    };
  }

  private getDateKey(timestamp: number): string {
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getDataFilePath(dateKey: string): string {
    return path.join(this.options.workspaceDir, `requests-${dateKey}.json`);
  }

  private getDatedDataFiles(): string[] {
    if (!fs.existsSync(this.options.workspaceDir)) {
      return [];
    }
    const files = fs.readdirSync(this.options.workspaceDir)
      .filter(file => /^requests-\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .map(file => path.join(this.options.workspaceDir, file));
    return files;
  }

  private sortByTimestampDesc<T extends { timestamp: number; id?: number }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
      if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
      return (b.id || 0) - (a.id || 0);
    });
  }

  private getNextIdFromItems<T extends { id?: number }>(items: T[]): number {
    if (items.length === 0) {
      return 1;
    }
    return Math.max(...items.map(item => item.id || 0)) + 1;
  }

  private deduplicateById<T extends { id?: number; timestamp: number }>(items: T[]): T[] {
    const seen = new Set<number>();
    const deduped: T[] = [];
    for (const item of items) {
      const key = item.id || 0;
      if (key > 0) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      deduped.push(item);
    }
    return deduped;
  }
}
