/**
 * Check data completeness for token calculation
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_FILE = path.join(process.env.USERPROFILE || '', '.openclaw', 'contextscope', 'contextscope.db');

const db = new DatabaseSync(DB_FILE);

console.log('🔍 检查数据完整性\n');

// 检查最近的 tasks
const tasks = db.prepare(`
  SELECT * FROM tasks 
  ORDER BY start_time DESC 
  LIMIT 5
`).all();

console.log('📋 最近的 Tasks:\n');

tasks.forEach((t, idx) => {
  console.log(`[${idx+1}] TaskId: ${t.task_id.substring(0, 24)}...`);
  console.log(`    SessionId: ${t.session_id.substring(0, 24)}...`);
  console.log(`    LLM Calls: ${t.llm_calls}`);
  console.log(`    Tool Calls: ${t.tool_calls}`);
  console.log(`    Stats - Input: ${t.total_input}, Output: ${t.total_output}, Total: ${t.total_tokens}`);
  console.log('');
  
  // 检查该 task 的 requests
  const requests = db.prepare(`
    SELECT type, COUNT(*) as count, SUM(CAST(usage_json AS INTEGER)) as total_usage
    FROM requests 
    WHERE task_id = ?
    GROUP BY type
  `).all(t.task_id);
  
  console.log(`    Requests 统计:`);
  requests.forEach((r) => {
    console.log(`       ${r.type}: ${r.count} 条`);
  });
  
  // 检查该 task 的 tool calls
  const toolCalls = db.prepare(`
    SELECT tool_name, COUNT(*) as count
    FROM tool_calls 
    WHERE run_id IN (
      SELECT run_id FROM requests WHERE task_id = ?
    )
    GROUP BY tool_name
  `).all(t.task_id);
  
  if (toolCalls.length > 0) {
    console.log(`    Tool Calls 统计:`);
    toolCalls.forEach((tc) => {
      console.log(`       ${tc.tool_name}: ${tc.count} 次`);
    });
  }
  
  // 计算实际的 output tokens
  const outputReqs = db.prepare(`
    SELECT usage_json FROM requests 
    WHERE task_id = ? AND type = 'output'
  `).all(t.task_id);
  
  let actualOutput = 0;
  outputReqs.forEach((r) => {
    const usage = JSON.parse(r.usage_json || '{}');
    actualOutput += usage.output || 0;
  });
  
  console.log(`    实际 Output: ${actualOutput} tokens`);
  console.log(`    Task 记录 Output: ${t.total_output} tokens`);
  console.log(`    匹配：${actualOutput === t.total_output ? '✅' : '❌'}`);
  console.log('');
  console.log('    ──────────────────────────────────────');
  console.log('');
});

// 统计总体情况
console.log('📊 总体统计:\n');

const totalStats = db.prepare(`
  SELECT 
    (SELECT COUNT(*) FROM tasks) as total_tasks,
    (SELECT COUNT(*) FROM requests WHERE type = 'input') as total_input_reqs,
    (SELECT COUNT(*) FROM requests WHERE type = 'output') as total_output_reqs,
    (SELECT COUNT(*) FROM tool_calls) as total_tool_calls
`).get();

console.log(`Tasks 总数：${totalStats.total_tasks}`);
console.log(`Input Requests: ${totalStats.input_reqs}`);
console.log(`Output Requests: ${totalStats.output_reqs}`);
console.log(`Tool Calls: ${totalStats.tool_calls}`);
console.log('');

// 检查 token 计算
console.log('💰 Token 计算检查:\n');

const tokenStats = db.prepare(`
  SELECT 
    SUM(CAST(usage_json AS INTEGER)) as total_input
  FROM requests
  WHERE type = 'input'
`).get();

const outputStats = db.prepare(`
  SELECT 
    SUM(CAST(usage_json AS INTEGER)) as total_output
  FROM requests
  WHERE type = 'output'
`).get();

console.log(`Requests Input Tokens: ${tokenStats.total_input || 0}`);
console.log(`Requests Output Tokens: ${outputStats.total_output || 0}`);

const tasksStats = db.prepare(`
  SELECT 
    SUM(total_input) as tasks_input,
    SUM(total_output) as tasks_output,
    SUM(total_tokens) as tasks_total
  FROM tasks
`).get();

console.log(`Tasks Input Tokens: ${tasksStats.tasks_input || 0}`);
console.log(`Tasks Output Tokens: ${tasksStats.tasks_output || 0}`);
console.log(`Tasks Total Tokens: ${tasksStats.tasks_total || 0}`);
console.log('');

console.log(`差异 - Input: ${(tokenStats.total_input || 0) - (tasksStats.tasks_input || 0)}`);
console.log(`差异 - Output: ${(outputStats.total_output || 0) - (tasksStats.tasks_output || 0)}`);

db.close();
