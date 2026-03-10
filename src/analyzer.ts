/**
 * Context Analyzer Module
 * 
 * Provides deep analysis of request contexts including:
 * - Token distribution analysis
 * - Attention heatmap calculation
 * - Context evolution tracking
 * - Tool call dependency graph
 */

import type { RequestData } from './storage.js';

export interface TokenBreakdown {
  systemPrompt: number;
  historyMessages: number;
  currentPrompt: number;
  toolResponses: number;
  totalInput: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface MessageImpact {
  messageId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokenCount: number;
  impactScore: number; // 0-100
  timestamp: number;
}

export interface ContextEvolution {
  timestamp: number;
  totalTokens: number;
  messageCount: number;
  compressionRatio: number;
  summaryApplied: boolean;
  windowUtilization: number; // 0-1
}

export interface ToolCallNode {
  id: string;
  name: string;
  duration: number;
  tokensUsed: number;
  dependencies: string[];
  status: 'success' | 'error' | 'pending';
  children: string[];
}

export interface DependencyGraph {
  nodes: ToolCallNode[];
  edges: Array<{ from: string; to: string; weight: number }>;
}

export interface AnalysisResult {
  runId: string;
  sessionId: string;
  tokenBreakdown: TokenBreakdown;
  messageImpacts: MessageImpact[];
  contextEvolution: ContextEvolution[];
  dependencyGraph: DependencyGraph;
  insights: AnalysisInsight[];
  // Context Analysis
  topicClusters: TopicCluster[];
  contextSimilarities: ContextSimilarity[];
  compressionSuggestions: ContextCompressionSuggestion[];
  attentionDistribution: AttentionDistribution;
  keyMessages: MessageImpact[];
  contextHealth: {
    score: number; // 0-100
    issues: string[];
    recommendations: string[];
  };
}

export interface AnalysisInsight {
  type: 'warning' | 'info' | 'optimization';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ContextSimilarity {
  messageId: string;
  similarTo: string;
  similarityScore: number; // 0-1
  topic: string;
}

export interface TopicCluster {
  topic: string;
  messageIds: string[];
  keywords: string[];
  percentage: number;
}

export interface ContextCompressionSuggestion {
  type: 'remove' | 'summarize' | 'keep';
  messageId: string;
  reason: string;
  tokenSavings: number;
  impact: 'low' | 'medium' | 'high';
}

export interface AttentionDistribution {
  systemPrompt: number; // 0-1
  recentMessages: number; // 0-1
  olderMessages: number; // 0-1
  toolResponses: number; // 0-1
}

export class ContextAnalyzer {
  private readonly MODEL_CONTEXT_WINDOWS: Record<string, number> = {
    'gpt-4': 8192,
    'gpt-4-turbo': 128000,
    'gpt-4-32k': 32768,
    'gpt-3.5-turbo': 16385,
    'gpt-3.5-turbo-16k': 16385,
    'claude-3-opus': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-haiku': 200000,
    'claude-2': 100000,
    'qwen': 32768,
    'qwen2': 128000,
    'default': 8192
  };

  private readonly STOP_WORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'although', 'though', 'after', 'before', 'when', 'whenever', 'where', 'wherever', 'whether', 'which', 'while', 'who', 'whoever', 'whom', 'whose', 'what', 'whatever', 'that', 'this', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs', 'myself', 'yourself', 'himself', 'herself', 'itself', 'ourselves', 'themselves']);

  analyzeRequest(request: RequestData, relatedRequests: RequestData[]): AnalysisResult {
    const tokenBreakdown = this.analyzeTokenDistribution(request);
    const messageImpacts = this.analyzeMessageImpacts(request);
    const contextEvolution = this.analyzeContextEvolution(relatedRequests);
    const dependencyGraph = this.analyzeToolDependencies(relatedRequests);
    const insights = this.generateInsights(tokenBreakdown, messageImpacts, contextEvolution);
    
    // Context Analysis
    const topicClusters = this.analyzeTopicClusters(request);
    const contextSimilarities = this.analyzeContextSimilarities(request);
    const compressionSuggestions = this.generateCompressionSuggestions(request, messageImpacts);
    const attentionDistribution = this.analyzeAttentionDistribution(request);
    const keyMessages = this.extractKeyMessages(messageImpacts);
    const contextHealth = this.calculateContextHealth(request, messageImpacts, tokenBreakdown);

    return {
      runId: request.runId,
      sessionId: request.sessionId,
      tokenBreakdown,
      messageImpacts,
      contextEvolution,
      dependencyGraph,
      insights,
      topicClusters,
      contextSimilarities,
      compressionSuggestions,
      attentionDistribution,
      keyMessages,
      contextHealth
    };
  }

  private analyzeTokenDistribution(request: RequestData): TokenBreakdown {
    const breakdown: TokenBreakdown = {
      systemPrompt: 0,
      historyMessages: 0,
      currentPrompt: 0,
      toolResponses: 0,
      totalInput: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0
    };

    // Estimate token counts based on content length
    if (request.systemPrompt) {
      breakdown.systemPrompt = this.estimateTokens(request.systemPrompt);
    }

    if (request.historyMessages) {
      const historyContent = JSON.stringify(request.historyMessages);
      breakdown.historyMessages = this.estimateTokens(historyContent);
    }

    if (request.prompt) {
      breakdown.currentPrompt = this.estimateTokens(request.prompt);
    }

    // Analyze tool responses in history
    if (request.historyMessages) {
      for (const msg of request.historyMessages) {
        const msgAny = msg as any;
        if (msgAny?.role === 'tool' || msgAny?.type === 'tool_response') {
          const content = typeof msgAny.content === 'string' ? msgAny.content : JSON.stringify(msgAny.content);
          breakdown.toolResponses += this.estimateTokens(content);
        }
      }
    }

    breakdown.totalInput = breakdown.systemPrompt + breakdown.historyMessages + 
                           breakdown.currentPrompt + breakdown.toolResponses;

    if (request.usage) {
      breakdown.output = request.usage.output || 0;
      breakdown.cacheRead = request.usage.cacheRead || 0;
      breakdown.cacheWrite = request.usage.cacheWrite || 0;
    }

    return breakdown;
  }

  private analyzeMessageImpacts(request: RequestData): MessageImpact[] {
    const impacts: MessageImpact[] = [];

    if (!request.historyMessages) return impacts;

    const now = request.timestamp;
    const halfLife = 30 * 60 * 1000; // 30 minutes half-life

    request.historyMessages.forEach((msg: any, index: number) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      const tokenCount = this.estimateTokens(content);
      
      // Calculate impact score based on:
      // - Recency (exponential decay)
      // - Content length (longer = potentially more important)
      // - Position (later messages often more relevant)
      const timeDecay = Math.exp(-(now - (msg.timestamp || now)) / halfLife);
      const lengthFactor = Math.log10(tokenCount + 10);
      const positionFactor = (index + 1) / request.historyMessages!.length;

      const impactScore = Math.round(
        (timeDecay * 0.5 + lengthFactor * 0.3 + positionFactor * 0.2) * 100
      );

      impacts.push({
        messageId: msg.id || `msg-${index}`,
        role: msg.role || 'user',
        content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
        tokenCount,
        impactScore: Math.min(100, Math.max(0, impactScore)),
        timestamp: msg.timestamp || now
      });
    });

    // Sort by impact score descending
    impacts.sort((a, b) => b.impactScore - a.impactScore);

    return impacts;
  }

  private analyzeContextEvolution(requests: RequestData[]): ContextEvolution[] {
    const evolution: ContextEvolution[] = [];
    const sortedRequests = [...requests].sort((a, b) => a.timestamp - b.timestamp);

    let cumulativeTokens = 0;
    let messageCount = 0;

    sortedRequests.forEach((request, index) => {
      const tokens = request.usage?.total || 
                     this.estimateTokens(request.prompt || '') + 
                     this.estimateTokens(request.systemPrompt || '');
      
      cumulativeTokens += tokens;
      messageCount++;

      const modelWindow = this.getModelContextWindow(request.model);
      const compressionRatio = cumulativeTokens / modelWindow;
      const summaryApplied = compressionRatio > 0.8;

      evolution.push({
        timestamp: request.timestamp,
        totalTokens: cumulativeTokens,
        messageCount,
        compressionRatio: Math.min(1, compressionRatio),
        summaryApplied,
        windowUtilization: compressionRatio
      });

      // If compression ratio exceeded, simulate context compression
      if (compressionRatio > 1) {
        cumulativeTokens = Math.round(modelWindow * 0.7); // Compress to 70% after summary
      }
    });

    return evolution;
  }

  private analyzeToolDependencies(requests: RequestData[]): DependencyGraph {
    const nodes: Map<string, ToolCallNode> = new Map();
    const edges: Array<{ from: string; to: string; weight: number }> = [];

    requests.forEach((request, index) => {
      // Extract tool calls from history messages
      if (request.historyMessages) {
        request.historyMessages.forEach((msg: any) => {
          if (msg.tool_call_id || msg.type === 'tool_call') {
            const nodeId = msg.tool_call_id || `tool-${Date.now()}-${Math.random()}`;
            const toolName = msg.name || msg.tool_name || 'unknown';
            
            if (!nodes.has(nodeId)) {
              nodes.set(nodeId, {
                id: nodeId,
                name: toolName,
                duration: msg.duration || 0,
                tokensUsed: this.estimateTokens(JSON.stringify(msg)),
                dependencies: [],
                status: msg.status || 'success',
                children: []
              });
            }
          }

          // Track tool call relationships
          if (msg.tool_call_id && msg.role === 'tool') {
            // This is a tool response, link to the original call
            const responseId = `response-${msg.tool_call_id}`;
            nodes.set(responseId, {
              id: responseId,
              name: `${msg.name || 'tool'}-response`,
              duration: 0,
              tokensUsed: this.estimateTokens(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)),
              dependencies: [msg.tool_call_id],
              status: 'success',
              children: []
            });

            edges.push({
              from: msg.tool_call_id,
              to: responseId,
              weight: 1
            });
          }
        });
      }

      // Track sequential tool calls as dependencies
      if (request.metadata && (request.metadata as any).toolCalls) {
        const toolCalls = (request.metadata as any).toolCalls as any[];
        toolCalls.forEach((call: any, idx: number) => {
          const callId = call.id || `call-${index}-${idx}`;
          
          if (!nodes.has(callId)) {
            nodes.set(callId, {
              id: callId,
              name: call.name || 'unknown',
              duration: call.duration || 0,
              tokensUsed: call.tokens || 0,
              dependencies: idx > 0 ? [toolCalls[idx - 1].id || `call-${index}-${idx - 1}`] : [],
              status: call.status || 'success',
              children: []
            });
          }

          // Add edge from previous tool call
          if (idx > 0) {
            const prevId = toolCalls[idx - 1].id || `call-${index}-${idx - 1}`;
            edges.push({
              from: prevId,
              to: callId,
              weight: 1
            });
          }
        });
      }
    });

    // Build children arrays from dependencies
    edges.forEach(edge => {
      const fromNode = nodes.get(edge.from);
      if (fromNode) {
        fromNode.children.push(edge.to);
      }
    });

    return {
      nodes: Array.from(nodes.values()),
      edges
    };
  }

  private generateInsights(
    tokenBreakdown: TokenBreakdown,
    messageImpacts: MessageImpact[],
    contextEvolution: ContextEvolution[]
  ): AnalysisInsight[] {
    const insights: AnalysisInsight[] = [];

    // Check for high token usage in system prompt
    if (tokenBreakdown.systemPrompt > tokenBreakdown.totalInput * 0.3) {
      insights.push({
        type: 'optimization',
        title: '系统提示占用过高',
        description: `系统提示占用了 ${Math.round(tokenBreakdown.systemPrompt / tokenBreakdown.totalInput * 100)}% 的输入 token，考虑优化或压缩系统提示`,
        severity: 'medium'
      });
    }

    // Check for context window pressure
    const latestEvolution = contextEvolution[contextEvolution.length - 1];
    if (latestEvolution && latestEvolution.windowUtilization > 0.8) {
      insights.push({
        type: 'warning',
        title: '上下文窗口压力大',
        description: `上下文窗口使用率已达 ${Math.round(latestEvolution.windowUtilization * 100)}%，可能触发自动摘要或截断`,
        severity: latestEvolution.windowUtilization > 0.95 ? 'high' : 'medium'
      });
    }

    // Check for low-impact messages consuming tokens
    const lowImpactHighToken = messageImpacts.filter(
      m => m.impactScore < 30 && m.tokenCount > 100
    );
    if (lowImpactHighToken.length > 0) {
      insights.push({
        type: 'optimization',
        title: '低价值消息占用上下文',
        description: `发现 ${lowImpactHighToken.length} 条低影响力但占用较多 token 的消息，考虑从上下文中移除`,
        severity: 'low'
      });
    }

    // Check for cache efficiency
    if (tokenBreakdown.cacheRead > 0 && tokenBreakdown.cacheWrite > 0) {
      const cacheHitRate = tokenBreakdown.cacheRead / (tokenBreakdown.cacheRead + tokenBreakdown.cacheWrite);
      if (cacheHitRate < 0.5) {
        insights.push({
          type: 'info',
          title: '缓存命中率较低',
          description: `缓存命中率仅为 ${Math.round(cacheHitRate * 100)}%，考虑优化提示结构以提高缓存效率`,
          severity: 'low'
        });
      }
    }

    return insights;
  }

  private estimateTokens(text: string): number {
    // Simple estimation: ~4 characters per token for English
    // For Chinese, ~1.5 characters per token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    
    return Math.round(chineseChars / 1.5 + otherChars / 4);
  }

  private getModelContextWindow(model: string): number {
    const modelLower = model.toLowerCase();
    for (const [key, value] of Object.entries(this.MODEL_CONTEXT_WINDOWS)) {
      if (modelLower.includes(key)) {
        return value;
      }
    }
    return this.MODEL_CONTEXT_WINDOWS['default'];
  }

  /**
   * Analyze topic clusters in the conversation
   */
  private analyzeTopicClusters(request: RequestData): TopicCluster[] {
    const clusters: TopicCluster[] = [];
    const messages = request.historyMessages || [];
    
    if (messages.length === 0) return clusters;

    // Extract keywords from each message
    const messageKeywords = messages.map((msg: any) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      const words = content.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w: string) => w.length > 3 && !this.STOP_WORDS.has(w));
      
      const wordFreq: Record<string, number> = {};
      words.forEach((w: string) => wordFreq[w] = (wordFreq[w] || 0) + 1);
      
      return {
        messageId: msg.id || `msg-${messages.indexOf(msg)}`,
        keywords: Object.entries(wordFreq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([word]) => word),
        content
      };
    });

    // Group by common keywords (simple clustering)
    const allKeywords = new Set<string>();
    messageKeywords.forEach(mk => mk.keywords.forEach(k => allKeywords.add(k)));

    const keywordToMessages: Record<string, string[]> = {};
    allKeywords.forEach(keyword => {
      keywordToMessages[keyword] = messageKeywords
        .filter(mk => mk.keywords.includes(keyword))
        .map(mk => mk.messageId);
    });

    // Create clusters from top keywords
    const topKeywords = Array.from(allKeywords).slice(0, 5);
    const totalMessages = messages.length;

    topKeywords.forEach(keyword => {
      const msgIds = keywordToMessages[keyword];
      if (msgIds.length > 0) {
        clusters.push({
          topic: keyword,
          messageIds: msgIds,
          keywords: [keyword],
          percentage: Math.round((msgIds.length / totalMessages) * 100)
        });
      }
    });

    return clusters;
  }

  /**
   * Analyze similarity between messages
   */
  private analyzeContextSimilarities(request: RequestData): ContextSimilarity[] {
    const similarities: ContextSimilarity[] = [];
    const messages = request.historyMessages || [];

    if (messages.length < 2) return similarities;

    // Simple Jaccard similarity based on word overlap
    for (let i = 0; i < messages.length; i++) {
      for (let j = i + 1; j < messages.length; j++) {
        const msg1 = messages[i] as any;
        const msg2 = messages[j] as any;
        
        const content1 = typeof msg1.content === 'string' ? msg1.content : JSON.stringify(msg1.content);
        const content2 = typeof msg2.content === 'string' ? msg2.content : JSON.stringify(msg2.content);
        
        const words1 = new Set(content1.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
        const words2 = new Set(content2.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
        
        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);
        
        const similarity = union.size > 0 ? intersection.size / union.size : 0;
        
        if (similarity > 0.3) { // Only report significant similarities
          const commonWords = Array.from(intersection).slice(0, 3).join(', ');
          similarities.push({
            messageId: msg1.id || `msg-${i}`,
            similarTo: msg2.id || `msg-${j}`,
            similarityScore: Math.round(similarity * 100) / 100,
            topic: commonWords
          });
        }
      }
    }

    return similarities.sort((a, b) => b.similarityScore - a.similarityScore).slice(0, 10);
  }

  /**
   * Generate context compression suggestions
   */
  private generateCompressionSuggestions(request: RequestData, messageImpacts: MessageImpact[]): ContextCompressionSuggestion[] {
    const suggestions: ContextCompressionSuggestion[] = [];
    const messages = request.historyMessages || [];

    messages.forEach((msg: any, index: number) => {
      const impact = messageImpacts.find(mi => mi.messageId === (msg.id || `msg-${index}`));
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      const tokenCount = this.estimateTokens(content);
      
      // Low impact, high token messages are candidates for removal
      if (impact && impact.impactScore < 30 && tokenCount > 200) {
        suggestions.push({
          type: 'remove',
          messageId: msg.id || `msg-${index}`,
          reason: 'Low impact message consuming significant tokens',
          tokenSavings: tokenCount,
          impact: 'low'
        });
      }
      
      // Old messages with medium impact could be summarized
      const msgTime = msg.timestamp || request.timestamp;
      const age = request.timestamp - msgTime;
      if (age > 30 * 60 * 1000 && impact && impact.impactScore >= 30 && impact.impactScore < 60) {
        suggestions.push({
          type: 'summarize',
          messageId: msg.id || `msg-${index}`,
          reason: 'Old message that could be summarized',
          tokenSavings: Math.round(tokenCount * 0.5),
          impact: 'medium'
        });
      }
    });

    // High impact messages should be kept
    messageImpacts.filter(m => m.impactScore >= 80).forEach(m => {
      suggestions.push({
        type: 'keep',
        messageId: m.messageId,
        reason: 'High impact message - keep in context',
        tokenSavings: 0,
        impact: 'high'
      });
    });

    return suggestions.sort((a, b) => b.tokenSavings - a.tokenSavings);
  }

  /**
   * Analyze attention distribution
   */
  private analyzeAttentionDistribution(request: RequestData): AttentionDistribution {
    const breakdown = this.analyzeTokenDistribution(request);
    const total = breakdown.totalInput || 1;
    
    // Estimate attention based on token distribution and recency
    return {
      systemPrompt: Math.round((breakdown.systemPrompt / total) * 100) / 100,
      recentMessages: 0.4, // Recent messages typically get more attention
      olderMessages: 0.2, // Older messages get less attention
      toolResponses: Math.round((breakdown.toolResponses / total) * 100) / 100
    };
  }

  /**
   * Extract key messages
   */
  private extractKeyMessages(messageImpacts: MessageImpact[]): MessageImpact[] {
    return messageImpacts
      .filter(m => m.impactScore >= 70)
      .sort((a, b) => b.impactScore - a.impactScore)
      .slice(0, 5);
  }

  /**
   * Calculate overall context health score
   */
  private calculateContextHealth(request: RequestData, messageImpacts: MessageImpact[], tokenBreakdown: TokenBreakdown): {
    score: number;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check for topic drift
    const topicClusters = this.analyzeTopicClusters(request);
    if (topicClusters.length > 5) {
      issues.push('Conversation covers too many topics');
      recommendations.push('Consider focusing on fewer topics per conversation');
      score -= 10;
    }

    // Check for redundant messages
    const similarities = this.analyzeContextSimilarities(request);
    const highSimilarity = similarities.filter(s => s.similarityScore > 0.7);
    if (highSimilarity.length > 3) {
      issues.push('Multiple highly similar messages detected');
      recommendations.push('Remove or merge redundant messages');
      score -= 15;
    }

    // Check system prompt ratio
    const totalTokens = tokenBreakdown.totalInput || 1;
    const systemPromptRatio = tokenBreakdown.systemPrompt / totalTokens;
    if (systemPromptRatio > 0.3) {
      issues.push('System prompt takes up too much context');
      recommendations.push('Consider shortening or optimizing system prompt');
      score -= 20;
    }

    // Check for low-impact messages
    const lowImpact = messageImpacts.filter(m => m.impactScore < 30).length;
    if (lowImpact > messageImpacts.length * 0.3) {
      issues.push('Many low-impact messages in context');
      recommendations.push('Remove or summarize low-value messages');
      score -= 15;
    }

    // Check context window utilization
    const modelWindow = this.getModelContextWindow(request.model);
    const utilization = totalTokens / modelWindow;
    if (utilization > 0.9) {
      issues.push('Context window nearly full');
      recommendations.push('Apply compression or start new conversation');
      score -= 25;
    } else if (utilization > 0.7) {
      issues.push('Context window getting full');
      recommendations.push('Consider proactive compression');
      score -= 10;
    }

    return {
      score: Math.max(0, score),
      issues,
      recommendations
    };
  }
}
