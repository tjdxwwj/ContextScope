/**
 * Complex Task Generator
 * 
 * Creates a complex task that spawns multiple sub-agents and calls multiple tools
 * to test token tracking accuracy
 */

const API_BASE = 'http://localhost:18789/plugins/contextscope/api';

async function waitForTask(runId, maxWaitMs = 30000) {
  console.log(`   Waiting for task ${runId} to complete...`);
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
      const chainRes = await fetch(`${API_BASE}/chain/${runId}?limit=100`);
      const chainData = await chainRes.json();
      
      if (chainData && chainData.chain) {
        const outputCount = chainData.chain.filter(i => i.type === 'output').length;
        if (outputCount > 0) {
          console.log(`   ✅ Task completed with ${outputCount} output(s)`);
          return chainData;
        }
      }
    } catch (e) {
      // Continue waiting
    }
  }
  
  throw new Error('Task timeout');
}

async function generateComplexTask() {
  console.log('\n🔬 Generating Complex Task\n');
  console.log('='.repeat(60));

  try {
    // This script demonstrates what a complex task looks like
    // In reality, you would trigger this through OpenClaw
    
    console.log('\n📋 Complex Task Pattern:\n');
    console.log('   1. User asks a complex question');
    console.log('      └─> [LLM Call #1] Analyzes question');
    console.log('   2. LLM decides to spawn sub-agent A');
    console.log('      └─> [sessions_spawn] Sub-agent A');
    console.log('      └─> [LLM Call #2] Sub-agent A processes');
    console.log('      └─> [Tool Call] Sub-agent A uses web_search');
    console.log('      └─> [LLM Call #3] Sub-agent A responds');
    console.log('   3. LLM decides to spawn sub-agent B');
    console.log('      └─> [sessions_spawn] Sub-agent B');
    console.log('      └─> [LLM Call #4] Sub-agent B processes');
    console.log('      └─> [Tool Call] Sub-agent B uses read');
    console.log('      └─> [LLM Call #5] Sub-agent B responds');
    console.log('   4. Main LLM synthesizes results');
    console.log('      └─> [LLM Call #6] Final response to user');
    console.log('');
    console.log('   Expected captures:');
    console.log('   - 6 LLM input/output pairs');
    console.log('   - 2 sub-agent spawn links');
    console.log('   - 2+ tool calls');
    console.log('   - All with consistent runId or parent-child relationships');
    console.log('');

    // Check recent complex tasks
    console.log('\n📊 Checking for existing complex tasks...\n');
    
    const requestsRes = await fetch(`${API_BASE}/requests?limit=100`);
    const requestsData = await requestsRes.json();
    
    if (!requestsData.requests || requestsData.requests.length === 0) {
      console.log('   ❌ No requests found');
      return;
    }

    // Group by runId
    const runIdMap = new Map();
    requestsData.requests.forEach(req => {
      if (!runIdMap.has(req.runId)) {
        runIdMap.set(req.runId, []);
      }
      runIdMap.get(req.runId).push(req);
    });

    // Find tasks with multiple LLM calls
    console.log('   Analyzing tasks by complexity:\n');
    
    const complexTasks = [];
    
    for (const [runId, requests] of runIdMap) {
      const inputCount = requests.filter(r => r.type === 'input').length;
      const outputCount = requests.filter(r => r.type === 'output').length;
      const totalTokens = requests.reduce((sum, r) => sum + (r.usage?.total || 0), 0);
      
      if (inputCount >= 2 || outputCount >= 2) {
        complexTasks.push({
          runId,
          inputCount,
          outputCount,
          totalTokens,
          requestCount: requests.length
        });
      }
    }

    if (complexTasks.length === 0) {
      console.log('   ⚠️  No complex tasks found yet.');
      console.log('   💡 Try performing a task that:');
      console.log('      - Spawns multiple sub-agents');
      console.log('      - Calls multiple tools');
      console.log('      - Requires multiple LLM iterations');
    } else {
      // Sort by complexity (number of LLM calls)
      complexTasks.sort((a, b) => b.requestCount - a.requestCount);
      
      console.log('   Found complex tasks:\n');
      complexTasks.slice(0, 5).forEach((task, i) => {
        console.log(`   ${i + 1}. RunId: ${task.runId.substring(0, 20)}...`);
        console.log(`      - LLM calls: ${task.inputCount} in / ${task.outputCount} out`);
        console.log(`      - Total tokens: ${task.totalTokens.toLocaleString()}`);
        console.log('');
      });

      // Analyze the most complex task
      const mostComplex = complexTasks[0];
      console.log(`\n🔍 Detailed analysis of most complex task:\n`);
      
      const chainRes = await fetch(`${API_BASE}/chain/${mostComplex.runId}?limit=100`);
      const chainData = await chainRes.json();
      
      if (chainData && chainData.chain) {
        console.log('   Chain breakdown:');
        console.log(`   - Total items: ${chainData.stats.totalItems}`);
        console.log(`   - Inputs: ${chainData.stats.inputCount}`);
        console.log(`   - Outputs: ${chainData.stats.outputCount}`);
        console.log(`   - Tool calls: ${chainData.stats.toolCallCount}`);
        console.log(`   - Sub-agents: ${chainData.stats.subagentCount}`);
        console.log(`   - Total tokens: ${chainData.stats.totalTokens.toLocaleString()}`);
        console.log('');
        
        // Token breakdown verification
        const inputTokens = chainData.chain
          .filter(i => i.usage)
          .reduce((sum, i) => sum + (i.usage.input || 0), 0);
        
        const outputTokens = chainData.chain
          .filter(i => i.usage)
          .reduce((sum, i) => sum + (i.usage.output || 0), 0);
        
        const totalTokens = chainData.chain
          .filter(i => i.usage)
          .reduce((sum, i) => sum + (i.usage.total || 0), 0);
        
        console.log('   Token verification:');
        console.log(`   - Sum of inputs: ${inputTokens.toLocaleString()}`);
        console.log(`   - Sum of outputs: ${outputTokens.toLocaleString()}`);
        console.log(`   - Sum of totals: ${totalTokens.toLocaleString()}`);
        console.log(`   - Input + Output = Total: ${inputTokens + outputTokens} = ${totalTokens} ${inputTokens + outputTokens === totalTokens ? '✅' : '❌'}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Analysis complete!\n');

  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
    console.log('\nMake sure the OpenClaw gateway is running on port 18789\n');
  }
}

generateComplexTask();
