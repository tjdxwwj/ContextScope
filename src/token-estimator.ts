/**
 * Token Estimation Service
 * 
 * Server-side token estimation when API doesn't return accurate usage data.
 * Uses character-based estimation optimized for Chinese and English text.
 */

export interface TokenEstimate {
  input: number;
  output: number;
  total: number;
  breakdown: {
    systemPrompt: number;
    historyMessages: number;
    currentPrompt: number;
    assistantResponse: number;
  };
}

export interface EstimationOptions {
  chineseRatio?: number;    // Characters per token for Chinese (default: 1.5)
  englishRatio?: number;    // Characters per token for English (default: 4)
  enableDebug?: boolean;    // Enable debug logging
}

export class TokenEstimationService {
  private readonly chineseRatio: number;
  private readonly englishRatio: number;
  private readonly enableDebug: boolean;

  constructor(options: EstimationOptions = {}) {
    this.chineseRatio = options.chineseRatio || 1.5;
    this.englishRatio = options.englishRatio || 4;
    this.enableDebug = options.enableDebug ?? false;
  }

  /**
   * Estimate tokens for a text string
   * Chinese: ~1.5 characters = 1 token
   * English: ~4 characters = 1 token
   */
  estimateText(text: string): number {
    if (!text) return 0;
    
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    
    return Math.round(
      chineseChars / this.chineseRatio + 
      otherChars / this.englishRatio
    );
  }

  /**
   * Estimate tokens for an array of messages
   * Supports multimodal messages (text + images)
   */
  estimateMessages(messages: any[]): number {
    if (!messages || messages.length === 0) return 0;
    
    let total = 0;
    messages.forEach(msg => {
      if (typeof msg.content === 'string') {
        total += this.estimateText(msg.content);
      } else if (Array.isArray(msg.content)) {
        // Handle multimodal messages
        msg.content.forEach((item: any) => {
          if (item.type === 'text' && item.text) {
            total += this.estimateText(item.text);
          }
          // Images, files, etc. don't contribute to token count in estimation
        });
      }
    });
    
    return total;
  }

  /**
   * Estimate full context tokens from request data
   * Includes: system prompt, history, current prompt, and assistant response
   */
  estimateContext(data: {
    systemPrompt?: string;
    historyMessages?: any[];
    prompt?: string;
    assistantTexts?: string[];
  }): TokenEstimate {
    const breakdown = {
      systemPrompt: 0,
      historyMessages: 0,
      currentPrompt: 0,
      assistantResponse: 0
    };

    // Estimate input tokens
    if (data.systemPrompt) {
      breakdown.systemPrompt = this.estimateText(data.systemPrompt);
    }

    if (data.historyMessages && data.historyMessages.length > 0) {
      breakdown.historyMessages = this.estimateMessages(data.historyMessages);
    }

    if (data.prompt) {
      breakdown.currentPrompt = this.estimateText(data.prompt);
    }

    // Estimate output tokens
    if (data.assistantTexts && data.assistantTexts.length > 0) {
      breakdown.assistantResponse = this.estimateText(data.assistantTexts.join('\n'));
    }

    const input = breakdown.systemPrompt + breakdown.historyMessages + breakdown.currentPrompt;
    const output = breakdown.assistantResponse;

    return {
      input,
      output,
      total: input + output,
      breakdown
    };
  }

  /**
   * Estimate and update usage data in-place
   * Only estimates if usage is missing or zero
   */
  estimateUsage(data: any): TokenEstimate | null {
    // Skip if usage already exists and has valid data
    if (data.usage && data.usage.totalTokens > 0) {
      return null;
    }

    const estimate = this.estimateContext({
      systemPrompt: data.systemPrompt,
      historyMessages: data.historyMessages,
      prompt: data.prompt,
      assistantTexts: data.assistantTexts
    });

    // Update data.usage with estimated values
    data.usage = {
      input: estimate.input,
      output: estimate.output,
      cacheRead: 0,
      cacheWrite: 0,
      total: estimate.total
    };

    return estimate;
  }
}

// Singleton instance for use across the application
let instance: TokenEstimationService | null = null;

export function getTokenEstimator(options?: EstimationOptions): TokenEstimationService {
  if (!instance) {
    instance = new TokenEstimationService(options);
  }
  return instance;
}
