/**
 * Token Estimation Service using Tiktoken
 * 
 * Server-side accurate token estimation using OpenAI's tiktoken library.
 * Supports multiple models with proper tokenizer selection.
 */

import { encoding_for_model, get_encoding, type TiktokenModel } from 'tiktoken';

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
  model?: TiktokenModel;  // Model to use for tokenization (default: 'gpt-3.5-turbo')
  enableDebug?: boolean;  // Enable debug logging
}

export class TokenEstimationService {
  private readonly model: TiktokenModel;
  private readonly enableDebug: boolean;

  constructor(options: EstimationOptions = {}) {
    this.model = options.model || 'gpt-3.5-turbo';
    this.enableDebug = options.enableDebug ?? false;
  }

  /**
   * Count tokens for a text string using tiktoken
   */
  countTokens(text: string): number {
    if (!text) return 0;

    let encoder;
    try {
      encoder = encoding_for_model(this.model);
      const tokens = encoder.encode(text);
      encoder.free();
      return tokens.length;
    } catch (error) {
      // Fallback to cl100k_base encoding
      encoder = get_encoding('cl100k_base');
      const tokens = encoder.encode(text);
      encoder.free();
      return tokens.length;
    }
  }

  /**
   * Count tokens for an array of messages
   * Supports multimodal messages (text + images)
   */
  countMessagesTokens(messages: any[]): number {
    if (!messages || messages.length === 0) return 0;
    
    let total = 0;
    messages.forEach(msg => {
      if (typeof msg.content === 'string') {
        total += this.countTokens(msg.content);
      } else if (Array.isArray(msg.content)) {
        // Handle multimodal messages
        msg.content.forEach((item: any) => {
          if (item.type === 'text' && item.text) {
            total += this.countTokens(item.text);
          }
          // Images, files, etc. don't contribute to token count in estimation
        });
      }
    });
    
    return total;
  }

  /**
   * Count full context tokens from request data
   * Includes: system prompt, history, current prompt, and assistant response
   */
  countContext(data: {
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

    // Count input tokens
    if (data.systemPrompt) {
      breakdown.systemPrompt = this.countTokens(data.systemPrompt);
    }

    if (data.historyMessages && data.historyMessages.length > 0) {
      breakdown.historyMessages = this.countMessagesTokens(data.historyMessages);
    }

    if (data.prompt) {
      breakdown.currentPrompt = this.countTokens(data.prompt);
    }

    // Count output tokens
    if (data.assistantTexts && data.assistantTexts.length > 0) {
      breakdown.assistantResponse = this.countTokens(data.assistantTexts.join('\n'));
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
   * Only counts if usage is missing or zero
   */
  estimateUsage(data: any): TokenEstimate | null {
    // Skip if usage already exists and has valid data
    if (data.usage && data.usage.totalTokens > 0) {
      return null;
    }

    const estimate = this.countContext({
      systemPrompt: data.systemPrompt,
      historyMessages: data.historyMessages,
      prompt: data.prompt,
      assistantTexts: data.assistantTexts
    });

    // Update data.usage with counted values
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
