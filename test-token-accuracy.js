/**
 * Token Accuracy Test Script
 * 
 * Verifies that token counts (input/output/total) are accurate across:
 * - Multiple LLM calls in a single task
 * - Tool calls
 * - Sub-agent spawns
 * 
 * Run this after completing a complex task that involves multiple tool calls and sub-agents
 */

const API_BASE = 'http://localhost:18789/plugins/contextscope/api';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testTokenAccuracy() {
  log(colors.cyan, '\n🔍 Token Accuracy Test\n');
  log(colors.cyan, '='.repeat(70));

  try {
    // Step 1: Get recent requests
    log(colors.blue, '\n1. Fetching recent requests...');
    const requestsRes = await fetch(`${API_BASE}/requests?limit=20`);
    const requestsData = await requestsRes.json();
    
    if (!requestsData.requests || requestsData.requests.length === 0) {
      log(colors.red, '   ❌ No requests found');
      return;
    }

    log(colors.green, `   ✅ Found ${requestsData.requests.length} requests`);

    // Group by runId
    const runIdMap = new Map();
    requestsData.requests.forEach(req => {
      if (!runIdMap.has(req.runId)) {
        runIdMap.set(req.runId, []);
      }
      runIdMap.get(req.runId).push(req);
    });

    log(colors.green, `   ✅ Found ${runIdMap.size} unique runIds`);

    // Step 2: Find a complex task (multiple LLM calls + tools)
    log(colors.blue, '\n2. Finding complex tasks...');
    
    let selectedRunId = null;
    let selectedRequests = null;
    
    for (const [runId, requests] of runIdMap) {
      const inputCount = requests.filter(r => r.type === 'input').length;
      const outputCount = requests.filter(r => r.type === 'output').length;
      
      if (inputCount >= 2 && outputCount >= 2) {
        selectedRunId = runId;
        selectedRequests = requests;
        log(colors.green, `   ✅ Selected runId: ${runId}`);
        log(colors.yellow, `      - Input calls: ${inputCount}`);
        log(colors.yellow, `      - Output calls: ${outputCount}`);
        break;
      }
    }

    if (!selectedRunId) {
      log(colors.yellow, '   ⚠️  No complex tasks found. Using most recent runId...');
      const firstRunId = requestsData.requests[0].runId;
      selectedRunId = firstRunId;
      selectedRequests = runIdMap.get(firstRunId);
    }

    // Step 3: Get chain data
    log(colors.blue, '\n3. Fetching chain data...');
    const chainRes = await fetch(`${API_BASE}/chain/${selectedRunId}?limit=100&offset=0`);
    const chainData = await chainRes.json();

    if (chainRes.status !== 200) {
      log(colors.red, `   ❌ Error: ${chainData.error}`);
      return;
    }

    log(colors.green, `   ✅ Chain retrieved successfully`);

    // Step 4: Verify token calculations
    log(colors.blue, '\n4. Verifying token calculations...\n');

    // Calculate expected totals from individual requests
    let expectedInputTokens = 0;
    let expectedOutputTokens = 0;
    let expectedTotalTokens = 0;

    selectedRequests.forEach((req, index) => {
      const usage = req.usage || {};
      const input = usage.input || 0;
      const output = usage.output || 0;
      const total = usage.total || 0;

      expectedInputTokens += input;
      expectedOutputTokens += output;
      expectedTotalTokens += total;

      log(colors.yellow, `   [${index + 1}] ${req.type.toUpperCase()}`);
      log(colors.reset, `       Input: ${input.toLocaleString()}, Output: ${output.toLocaleString()}, Total: ${total.toLocaleString()}`);
    });

    // Get chain stats totals
    const chainInputTokens = chainData.chain
      .filter(i => i.usage)
      .reduce((sum, i) => sum + (i.usage?.input || 0), 0);
    
    const chainOutputTokens = chainData.chain
      .filter(i => i.usage)
      .reduce((sum, i) => sum + (i.usage?.output || 0), 0);
    
    const chainTotalTokens = chainData.chain
      .filter(i => i.usage)
      .reduce((sum, i) => sum + (i.usage?.total || 0), 0);

    // Step 5: Compare calculations
    log(colors.blue, '\n5. Token Comparison Results:\n');

    const comparisons = [
      { name: 'Input Tokens', expected: expectedInputTokens, actual: chainTotalTokens, unit: 'tokens' },
      { name: 'Output Tokens', expected: expectedOutputTokens, actual: chainOutputTokens, unit: 'tokens' },
      { name: 'Total Tokens', expected: expectedTotalTokens, actual: chainTotalTokens, unit: 'tokens' }
    ];

    let allPassed = true;

    comparisons.forEach(comp => {
      const match = comp.expected === comp.actual;
      const status = match ? '✅' : '❌';
      const color = match ? colors.green : colors.red;
      
      log(color, `   ${status} ${comp.name}:`);
      log(color, `      Expected: ${comp.expected.toLocaleString()} ${comp.unit}`);
      log(color, `      Actual:   ${comp.actual.toLocaleString()} ${comp.unit}`);
      
      if (!match) {
        log(colors.red, `      ⚠️  MISMATCH! Difference: ${(comp.expected - comp.actual).toLocaleString()}`);
        allPassed = false;
      }
    });

    // Step 6: Check tool calls
    log(colors.blue, '\n6. Tool Call Statistics:');
    log(colors.yellow, `   - Total tool calls in chain: ${chainData.stats.toolCallCount}`);
    
    const toolCalls = chainData.chain.filter(i => i.type === 'tool_call' || i.type === 'tool_result');
    log(colors.yellow, `   - Tool call items: ${toolCalls.length}`);
    
    if (toolCalls.length > 0) {
      const toolNames = [...new Set(toolCalls.map(t => t.metadata?.toolName).filter(Boolean))];
      log(colors.yellow, `   - Unique tools: ${toolNames.join(', ')}`);
    }

    // Step 7: Check sub-agent calls
    log(colors.blue, '\n7. Sub-agent Statistics:');
    log(colors.yellow, `   - Sub-agent spawns in chain: ${chainData.stats.subagentCount}`);
    
    const subagentCalls = chainData.chain.filter(i => i.type === 'subagent_spawn' || i.type === 'subagent_result');
    log(colors.yellow, `   - Sub-agent items: ${subagentCalls.length}`);

    // Step 8: Final verdict
    log(colors.blue, '\n8. Final Verdict:');
    log(colors.cyan, '='.repeat(70));
    
    if (allPassed) {
      log(colors.green, '\n   ✅ ALL TOKEN COUNTS MATCH!\n');
      log(colors.green, '   Token tracking is working correctly.\n');
    } else {
      log(colors.red, '\n   ❌ TOKEN COUNT MISMATCH DETECTED!\n');
      log(colors.red, '   There may be an issue with token tracking.\n');
    }

    // Step 9: Additional checks
    log(colors.blue, '\n9. Additional Checks:');
    
    // Check if input/output adds up to total
    const sumOfInputOutput = expectedInputTokens + expectedOutputTokens;
    const totalMatches = sumOfInputOutput === expectedTotalTokens;
    
    if (totalMatches) {
      log(colors.green, `   ✅ Input + Output = Total (${expectedInputTokens} + ${expectedOutputTokens} = ${expectedTotalTokens})`);
    } else {
      log(colors.red, `   ❌ Input + Output ≠ Total (${expectedInputTokens} + ${expectedOutputTokens} ≠ ${expectedTotalTokens})`);
    }

    // Check chain stats consistency
    const statsTotalItems = chainData.stats.inputCount + chainData.stats.outputCount + 
                           chainData.stats.toolCallCount + chainData.stats.subagentCount;
    const itemsMatch = statsTotalItems === chainData.stats.totalItems;
    
    if (itemsMatch) {
      log(colors.green, `   ✅ Chain item counts are consistent`);
    } else {
      log(colors.red, `   ⚠️  Chain item count mismatch (stats: ${statsTotalItems}, actual: ${chainData.chain.length})`);
    }

    log(colors.cyan, '\n' + '='.repeat(70));
    log(colors.cyan, '\n✅ Test completed!\n');

  } catch (error) {
    log(colors.red, `\n❌ Test failed: ${error.message}`);
    log(colors.red, '\nMake sure the OpenClaw gateway is running on port 18789\n');
    console.error(error);
  }
}

// Run the test
testTokenAccuracy();
