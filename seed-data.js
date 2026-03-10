/**
 * Seed test data for ContextScope
 * Run: node seed-data.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', '.openclaw', 'contextscope', 'requests.json');

// Create sample requests
const sampleRequests = [
  {
    id: 1,
    type: 'input',
    runId: 'run_001',
    sessionId: 'session_abc',
    provider: 'openai',
    model: 'gpt-4-turbo',
    timestamp: Date.now() - 1000 * 60 * 5,
    prompt: 'Explain quantum computing',
    systemPrompt: 'You are a helpful assistant...',
    historyMessages: [
      { role: 'user', content: 'What is quantum?', timestamp: Date.now() - 1000 * 60 * 10 },
      { role: 'assistant', content: 'Quantum is...', timestamp: Date.now() - 1000 * 60 * 9 }
    ],
    usage: { input: 1250, output: 0, total: 1250 }
  },
  {
    id: 2,
    type: 'output',
    runId: 'run_001',
    sessionId: 'session_abc',
    provider: 'openai',
    model: 'gpt-4-turbo',
    timestamp: Date.now() - 1000 * 60 * 4,
    assistantTexts: ['Quantum computing uses...'],
    usage: { input: 0, output: 450, total: 450 }
  },
  {
    id: 3,
    type: 'input',
    runId: 'run_002',
    sessionId: 'session_abc',
    provider: 'anthropic',
    model: 'claude-3-sonnet',
    timestamp: Date.now() - 1000 * 60 * 3,
    prompt: 'Write a Python function',
    systemPrompt: 'You are a coding assistant...',
    historyMessages: [],
    usage: { input: 890, output: 0, total: 890 }
  },
  {
    id: 4,
    type: 'output',
    runId: 'run_002',
    sessionId: 'session_abc',
    provider: 'anthropic',
    model: 'claude-3-sonnet',
    timestamp: Date.now() - 1000 * 60 * 2,
    assistantTexts: ['def fibonacci(n):...'],
    usage: { input: 0, output: 320, total: 320 }
  },
  {
    id: 5,
    type: 'input',
    runId: 'run_003',
    sessionId: 'session_xyz',
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    timestamp: Date.now() - 1000 * 60,
    prompt: 'Translate to French',
    systemPrompt: 'You are a translator...',
    usage: { input: 567, output: 0, total: 567 }
  },
  {
    id: 6,
    type: 'output',
    runId: 'run_003',
    sessionId: 'session_xyz',
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    timestamp: Date.now(),
    assistantTexts: ['Bonjour! Comment puis-je...'],
    usage: { input: 0, output: 234, total: 234 }
  }
];

// Add more historical data for trends
for (let i = 0; i < 20; i++) {
  const hoursAgo = Math.floor(Math.random() * 24);
  sampleRequests.push({
    id: sampleRequests.length + 1,
    type: 'input',
    runId: `run_hist_${i}`,
    sessionId: `session_hist_${Math.floor(i / 3)}`,
    provider: ['openai', 'anthropic', 'openai'][i % 3],
    model: ['gpt-4-turbo', 'claude-3-sonnet', 'gpt-3.5-turbo'][i % 3],
    timestamp: Date.now() - hoursAgo * 60 * 60 * 1000 - Math.random() * 60 * 60 * 1000,
    prompt: 'Historical request',
    usage: {
      input: Math.floor(Math.random() * 2000) + 500,
      output: 0,
      total: Math.floor(Math.random() * 2000) + 500
    }
  });
  
  sampleRequests.push({
    id: sampleRequests.length + 1,
    type: 'output',
    runId: `run_hist_${i}`,
    sessionId: `session_hist_${Math.floor(i / 3)}`,
    provider: ['openai', 'anthropic', 'openai'][i % 3],
    model: ['gpt-4-turbo', 'claude-3-sonnet', 'gpt-3.5-turbo'][i % 3],
    timestamp: Date.now() - hoursAgo * 60 * 60 * 1000 - Math.random() * 60 * 60 * 1000 + 30000,
    usage: {
      input: 0,
      output: Math.floor(Math.random() * 1000) + 200,
      total: Math.floor(Math.random() * 1000) + 200
    }
  });
}

// Ensure directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Write to file
const data = {
  requests: sampleRequests,
  nextId: sampleRequests.length + 1,
  lastUpdated: Date.now()
};

fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8');

console.log(`✅ Seeded ${sampleRequests.length} requests to ${dbPath}`);
console.log(`📊 Providers: openai (${sampleRequests.filter(r => r.provider === 'openai').length}), anthropic (${sampleRequests.filter(r => r.provider === 'anthropic').length})`);
console.log(`📊 Models: gpt-4-turbo, claude-3-sonnet, gpt-3.5-turbo`);
console.log(`📊 Sessions: ${new Set(sampleRequests.map(r => r.sessionId)).size} unique sessions`);
