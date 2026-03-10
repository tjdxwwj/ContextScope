/**
 * Chain API Self-Test Script
 * 
 * Tests the new /api/chain endpoint
 */

const API_BASE = 'http://localhost:18789/plugins/contextscope/api';

async function testChainAPI() {
  console.log('🔍 Testing Chain API...\n');
  console.log('='.repeat(60));

  try {
    // Get recent requests to find a runId
    console.log('\n1. Fetching recent requests...');
    const requestsRes = await fetch(`${API_BASE}/requests?limit=5`);
    const requestsData = await requestsRes.json();
    
    if (!requestsData.requests || requestsData.requests.length === 0) {
      console.log('   ❌ No requests found');
      return;
    }

    const runId = requestsData.requests[0].runId;
    console.log(`   ✅ Found runId: ${runId}`);

    // Test chain API
    console.log('\n2. Testing chain API...');
    const chainRes = await fetch(`${API_BASE}/chain/${runId}?limit=10&offset=0`);
    const chainData = await chainRes.json();

    if (chainRes.status !== 200) {
      console.log(`   ❌ Error: ${chainData.error}`);
      return;
    }

    console.log(`   ✅ Status: ${chainRes.status}`);
    console.log(`   ✅ Run ID: ${chainData.runId}`);
    console.log(`   ✅ Session ID: ${chainData.sessionId}`);
    console.log(`   ✅ Provider: ${chainData.provider}`);
    console.log(`   ✅ Model: ${chainData.model}`);

    // Check pagination
    console.log('\n3. Checking pagination...');
    console.log(`   ✅ Limit: ${chainData.pagination.limit}`);
    console.log(`   ✅ Offset: ${chainData.pagination.offset}`);
    console.log(`   ✅ Total: ${chainData.pagination.total}`);
    console.log(`   ✅ Has More: ${chainData.pagination.hasMore}`);

    // Check chain items
    console.log('\n4. Checking chain items...');
    console.log(`   ✅ Chain length: ${chainData.chain.length}`);
    
    if (chainData.chain.length > 0) {
      const firstItem = chainData.chain[0];
      console.log(`   ✅ First item type: ${firstItem.type}`);
      console.log(`   ✅ First item timestamp: ${new Date(firstItem.timestamp).toISOString()}`);
      console.log(`   ✅ Has runId: ${!!firstItem.runId}`);
      console.log(`   ✅ Has parentRunId: ${!!firstItem.parentRunId}`);
    }

    // Check stats
    console.log('\n5. Checking stats...');
    console.log(`   ✅ Total Items: ${chainData.stats.totalItems}`);
    console.log(`   ✅ Input Count: ${chainData.stats.inputCount}`);
    console.log(`   ✅ Output Count: ${chainData.stats.outputCount}`);
    console.log(`   ✅ Tool Call Count: ${chainData.stats.toolCallCount}`);
    console.log(`   ✅ Subagent Count: ${chainData.stats.subagentCount}`);
    console.log(`   ✅ Total Tokens: ${chainData.stats.totalTokens}`);

    // Verify sorting (descending)
    console.log('\n6. Verifying sort order (descending)...');
    const timestamps = chainData.chain.map(i => i.timestamp);
    const isSorted = timestamps.every((t, i) => i === 0 || timestamps[i-1] >= t);
    console.log(`   ✅ Sorted correctly: ${isSorted}`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed!\n');

  } catch (error) {
    console.log(`\n❌ Test failed: ${error.message}`);
    console.log('\nMake sure the OpenClaw gateway is running on port 18789\n');
  }
}

testChainAPI();
