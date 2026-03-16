/**
 * Configuration schema for ContextScope
 */

export interface PluginConfig {
  storage?: {
    maxRequests?: number;
    retentionDays?: number;
    compression?: boolean;
  };
  visualization?: {
    theme?: 'light' | 'dark' | 'auto';
    autoRefresh?: boolean;
    refreshInterval?: number;
    charts?: string[];
  };
  capture?: {
    includeSystemPrompts?: boolean;
    includeMessageHistory?: boolean;
    anonymizeContent?: boolean;
    maxPromptLength?: number;
  };
  alerts?: {
    enabled?: boolean;
    tokenThreshold?: number;
    costThreshold?: number;
  };
}

export const configSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    storage: {
      type: 'object',
      additionalProperties: false,
      properties: {
        maxRequests: {
          type: 'number',
          minimum: 100,
          maximum: 100000,
          default: 10000
        },
        retentionDays: {
          type: 'number',
          minimum: 1,
          maximum: 365,
          default: 7
        },
        compression: {
          type: 'boolean',
          default: true
        }
      }
    },
    visualization: {
      type: 'object',
      additionalProperties: false,
      properties: {
        theme: {
          type: 'string',
          enum: ['light', 'dark', 'auto'],
          default: 'dark'
        },
        autoRefresh: {
          type: 'boolean',
          default: true
        },
        refreshInterval: {
          type: 'number',
          minimum: 1000,
          maximum: 30000,
          default: 5000
        },
        charts: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['tokens', 'cost', 'timeline', 'models', 'providers']
          },
          default: ['tokens', 'cost', 'timeline']
        }
      }
    },
    capture: {
      type: 'object',
      additionalProperties: false,
      properties: {
        includeSystemPrompts: {
          type: 'boolean',
          default: true
        },
        includeMessageHistory: {
          type: 'boolean',
          default: true
        },
        anonymizeContent: {
          type: 'boolean',
          default: true
        },
        maxPromptLength: {
          type: 'number',
          minimum: 100,
          maximum: 100000,
          default: 4000
        }
      }
    },
    alerts: {
      type: 'object',
      additionalProperties: false,
      properties: {
        enabled: {
          type: 'boolean',
          default: false
        },
        tokenThreshold: {
          type: 'number',
          minimum: 1000,
          maximum: 1000000,
          default: 50000
        },
        costThreshold: {
          type: 'number',
          minimum: 0.1,
          maximum: 1000,
          default: 10.0
        }
      }
    }
  }
} as const;
