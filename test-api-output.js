/**
 * Test API returns correct output tokens
 */

const API_BASE = 'http://localhost:18789/plugins/contextscope/api';

async function testTasksApi() {
  console.log('🔍 测试 Tasks API 返回正确的 output tokens\n');
  
  try {
    const res = await fetch(`${API_BASE}/tasks?limit=5`);
    const data = await res.json();
    
    console.log(`获取到 ${data.data.tasks.length} 个 tasks:\n`);
    
    data.data.tasks.forEach((task, idx) => {
      console.log(`[${idx+1}] TaskId: ${task.taskId.substring(0, 24)}...`);
      console.log(`    Stats - Input: ${task.stats.totalInput}, Output: ${task.stats.totalOutput}, Total: ${task.stats.totalTokens}`);
      console.log(`    LLM Calls: ${task.stats.llmCalls}, Tool Calls: ${task.stats.toolCalls}`);
      console.log(`    Output 正确：${task.stats.totalOutput > 0 ? '✅' : '❌'}\n`);
    });
    
  } catch (error) {
    console.error('❌ API 调用失败:', error.message);
    console.log('\n请确保网关已启动：openclaw gateway start');
  }
}

testTasksApi();
