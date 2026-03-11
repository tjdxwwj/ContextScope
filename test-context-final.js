/**
 * Final test for Context API - using storage directly
 */

import { RequestAnalyzerStorage } from './dist/src/storage.js';
import { RequestAnalyzerService } from './dist/src/service.js';

const logger = {
  debug: (msg) => console.log('[DEBUG]', msg),
  info: (msg) => console.log('[INFO]', msg),
  warn: (msg) => console.log('[WARN]', msg),
  error: (msg) => console.log('[ERROR]', msg)
};

async function runTest() {
  console.log('\n🧪 Context API Final Test\n');
  
  // Initialize storage
  const storage = new RequestAnalyzerStorage({
    workspaceDir: './.openclaw-state/contextscope',
    maxRequests: 10000,
    retentionDays: 7,
    compression: true,
    logger
  });
  await storage.initialize();
  
  // Initialize service
  const service = new RequestAnalyzerService({
    storage,
    config: { capture: {} },
    logger
  });
  
  // Create test data using storage directly
  const testRunId = 'test-context-' + Date.now();
  console.log('Creating test data with runId:', testRunId);
  
  await storage.captureRequest({
    type: 'input',
    runId: testRunId,
    sessionId: 'test-session',
    provider: 'bailian',
    model: 'qwen3.5-plus',
    timestamp: Date.now(),
    prompt: '你好，测试上下文分布 API',
    systemPrompt: 'You are a helpful assistant. This is a test system prompt.',
    historyMessages: [
      { role: 'user', content: [{ type: 'text', text: 'Hello' }], timestamp: Date.now() - 60000 },
      { role: 'assistant', content: [{ type: 'text', text: 'Hi!' }], timestamp: Date.now() - 55000 }
    ],
    usage: { input: 100, output: 50, total: 150 }
  });
  
  console.log('✅ Test data created\n');
  
  // Test getContextDistribution
  console.log('Testing getContextDistribution...');
  const result = await service.getContextDistribution(testRunId);
  
  if (result) {
    console.log('✅ SUCCESS!\n');
    console.log('Basic Info:');
    console.log('  - Run ID:', result.runId);
    console.log('  - Model:', result.modelInfo.name);
    console.log('  - Provider:', result.provider);
    
    console.log('\nToken Distribution:');
    console.log('  - Total:', result.tokenDistribution.total);
    console.log('  - System Prompt:', result.tokenDistribution.breakdown.systemPrompt, `(${result.tokenDistribution.percentages.systemPrompt}%)`);
    console.log('  - User Prompt:', result.tokenDistribution.breakdown.userPrompt, `(${result.tokenDistribution.percentages.userPrompt}%)`);
    console.log('  - History:', result.tokenDistribution.breakdown.history, `(${result.tokenDistribution.percentages.history}%)`);
    
    console.log('\nModel Info:');
    console.log('  - Context Window:', result.modelInfo.contextWindow);
    console.log('  - Est. Cost: $' + result.modelInfo.estimatedCost.toFixed(4));
    
    console.log('\nContext:');
    console.log('  - System Prompt Length:', result.context.systemPrompt.length);
    console.log('  - User Prompt Length:', result.context.userPrompt.length);
    console.log('  - History Messages:', result.context.history.length);
  } else {
    console.log('❌ FAILED - Got null');
  }
  
  await storage.close();
  console.log('\n✅ Test completed!\n');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
