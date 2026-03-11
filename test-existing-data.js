/**
 * Test Context API with existing requests.json data
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
  console.log('\n🧪 Test with Existing Data\n');
  
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
  
  // Get existing requests
  const requests = await storage.getRequests({ limit: 10 });
  console.log('Found', requests.length, 'requests in storage\n');
  
  if (requests.length === 0) {
    console.log('❌ No data found!');
    await storage.close();
    return;
  }
  
  // Test each request
  for (const req of requests) {
    console.log('─'.repeat(60));
    console.log('Testing runId:', req.runId);
    console.log('  Type:', req.type);
    console.log('  Model:', req.model);
    console.log('  Timestamp:', new Date(req.timestamp).toLocaleString());
    
    const result = await service.getContextDistribution(req.runId);
    
    if (result) {
      console.log('  ✅ SUCCESS');
      console.log('  Token Distribution:');
      console.log('    - Total:', result.tokenDistribution.total);
      console.log('    - System:', result.tokenDistribution.breakdown.systemPrompt, `(${result.tokenDistribution.percentages.systemPrompt}%)`);
      console.log('    - User:', result.tokenDistribution.breakdown.userPrompt, `(${result.tokenDistribution.percentages.userPrompt}%)`);
      console.log('    - History:', result.tokenDistribution.breakdown.history, `(${result.tokenDistribution.percentages.history}%)`);
      console.log('  Context:');
      console.log('    - System Prompt:', result.context.systemPrompt.substring(0, 50) + '...');
      console.log('    - User Prompt:', result.context.userPrompt.substring(0, 50) + '...');
      console.log('    - History Messages:', result.context.history.length);
    } else {
      console.log('  ❌ FAILED');
    }
    console.log('');
  }
  
  await storage.close();
  console.log('✅ Test completed!\n');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
