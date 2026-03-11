/**
 * Simple storage test - minimal reproduction
 */

import { RequestAnalyzerStorage } from './dist/src/storage.js';

const logger = {
  debug: (msg) => console.log('[DEBUG]', msg),
  info: (msg) => console.log('[INFO]', msg),
  warn: (msg) => console.log('[WARN]', msg),
  error: (msg) => console.log('[ERROR]', msg)
};

async function test() {
  console.log('Creating storage...');
  const storage = new RequestAnalyzerStorage({
    workspaceDir: './.openclaw-state/contextscope',
    maxRequests: 10000,
    retentionDays: 7,
    compression: true,
    logger
  });
  
  console.log('Initializing...');
  await storage.initialize();
  
  console.log('Before capture - requests length:', storage.requests.length);
  console.log('Before capture - nextId:', storage.nextId);
  
  console.log('\nCapturing request...');
  await storage.captureRequest({
    type: 'input',
    runId: 'test-123',
    sessionId: 'test',
    provider: 'test',
    model: 'test',
    timestamp: Date.now(),
    prompt: 'test'
  });
  
  console.log('After capture - requests length:', storage.requests.length);
  console.log('After capture - nextId:', storage.nextId);
  console.log('After capture - first request:', storage.requests[0]?.runId);
  
  await storage.close();
}

test().catch(console.error);
