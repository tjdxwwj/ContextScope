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
  private options: StorageOptions;
  private initialized = false;
  private nextId = 1;

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
        this.nextId = data.nextId || (this.requests.length > 0 ? Math.max(...this.requests.map(r => r.id || 0)) + 1 : 1);
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
        nextId: this.nextId,
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
    
    // Remove excess requests if over limit
    if (this.requests.length > this.options.maxRequests) {
      this.requests = this.requests.slice(0, this.options.maxRequests);
    }
  }

  async close(): Promise<void> {
    await this.persist();
    this.initialized = false;
  }
}
