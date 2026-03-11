/**
 * Live test for Context API (without restarting OpenClaw)
 * Tests the service layer directly
 */

import { readFileSync } from 'node:fs';
import { RequestAnalyzerStorage } from './dist/src/storage.js';
import { RequestAnalyzerService } from './dist/src/service.js';

const logger = {
  debug: (msg) => console.log('[DEBUG]', msg),
  info: (msg) => console.log('[INFO]', msg),
  warn: (msg) => console.log('[WARN]', msg),
  error: (msg) => console.log('[ERROR]', msg)
};

async function runTest() {
  console.log('\n🧪 Context API Live Test\n');
  
  // Initialize storage
  const storage = new RequestAnalyzerStorage({
    workspaceDir: './.openclaw-state/contextscope',
    logger
  });
  await storage.initialize();
  
  // Initialize service
  const service = new RequestAnalyzerService({
    storage,
    config: { capture: {} },
    logger
  });
  
  // Test 1: Check if method exists
  console.log('✅ Test 1: getContextDistribution method exists');
  console.log('   Method:', typeof service.getContextDistribution);
  
  // Test 2: Try to get context for a non-existent runId
  console.log('\n📝 Test 2: Query non-existent runId');
  const result1 = await service.getContextDistribution('test-non-existent');
  console.log('   Result:', result1);
  
  // Test 3: Create test data
  console.log('\n📝 Test 3: Create test data');
  const testRunId = 'test-' + Date.now();
  
  console.log('   Capturing request...');
  console.log('   Storage initialized?', storage.initialized);
  console.log('   Data file:', storage.dataFile);
  
  const testData = {
    type: 'input',
    runId: testRunId,
    sessionId: 'test-session',
    provider: 'bailian',
    model: 'qwen3.5-plus',
    timestamp: Date.now(),
    prompt: '你好，测试上下文分布',
    systemPrompt: 'You are a helpful assistant.',
    historyMessages: [],
    usage: { input: 100, output: 50, total: 150 }
  };
  
  console.log('   Test data:', JSON.stringify(testData, null, 2).substring(0, 200));
  await storage.captureRequest(testData);
  console.log('   Capture completed');
  
  // Manually call persist to ensure data is written
  await storage.persist();
  console.log('   Persist called');
  
  // Check internal array
  console.log('   Internal requests array length:', storage.requests?.length || 0);
  
  console.log('   ✅ Test data created with runId:', testRunId);
  
  // Check if file was written
  try {
    const fileContent = readFileSync('./.openclaw-state/contextscope/requests.json', 'utf-8');
    const fileData = JSON.parse(fileContent);
    console.log('   File content - requests:', fileData.requests?.length || 0);
    if (fileData.requests?.length > 0) {
      console.log('   First request runId:', fileData.requests[0].runId);
    }
  } catch (err) {
    console.log('   Failed to read file:', err.message);
  }
  
  // Verify data was saved
  const verifyReqs = await storage.getRequests({ limit: 5 });
  console.log('   Storage now has', verifyReqs.length, 'requests');
  
  // Test 4: Debug - check what's in storage
  console.log('\n📝 Test 4a: Debug storage');
  const allReqs = await storage.getRequests({ limit: 10 });
  console.log('   Total requests in storage:', allReqs.length);
  allReqs.forEach(r => console.log('   -', r.runId, r.type));
  
  const testReqs = await storage.getRequests({ runId: testRunId, limit: 10 });
  console.log('   Requests for test runId:', testReqs.length);
  if (testReqs.length > 0) {
    console.log('   First request:', JSON.stringify(testReqs[0], null, 2).substring(0, 500));
  }
  
  // Test 4b: Query the test data
  console.log('\n📝 Test 4b: Query test data');
  const result2 = await service.getContextDistribution(testRunId);
  console.log('   Result:', result2 ? 'SUCCESS' : 'NULL');
  if (!result2) {
    console.log('   Debug: mainRequest =', testReqs.length > 0 ? 'found' : 'not found');
  }
  
  if (result2) {
    console.log('   ✅ Got context distribution:');
    console.log('   - Run ID:', result2.runId);
    console.log('   - Model:', result2.modelInfo.name);
    console.log('   - Total Tokens:', result2.tokenDistribution.total);
    console.log('   - Breakdown:');
    console.log('     * System Prompt:', result2.tokenDistribution.breakdown.systemPrompt, 
                `(${result2.tokenDistribution.percentages.systemPrompt}%)`);
    console.log('     * User Prompt:', result2.tokenDistribution.breakdown.userPrompt, 
                `(${result2.tokenDistribution.percentages.userPrompt}%)`);
    console.log('     * History:', result2.tokenDistribution.breakdown.history, 
                `(${result2.tokenDistribution.percentages.history}%)`);
    console.log('   - Estimated Cost: $' + result2.modelInfo.estimatedCost.toFixed(4));
  } else {
    console.log('   ❌ Failed to get context distribution');
  }
  
  // Test 5: Test token estimation
  console.log('\n📝 Test 5: Token estimation accuracy');
  const testTexts = [
    'Hello',
    '你好世界',
    'This is a longer text to test the token estimation function with more words.',
    '这是一个更长的中文文本，用于测试 token 估算函数，包含更多的字符。'
  ];
  
  for (const text of testTexts) {
    const tokens = service.estimateTokens(text);
    console.log(`   "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}" → ${tokens} tokens`);
  }
  
  // Cleanup
  await storage.close();
  
  console.log('\n✅ All tests completed!\n');
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
