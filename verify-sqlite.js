/**
 * Verify SQLite database has correct data with taskId
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_FILE = path.join(process.env.USERPROFILE || '', '.openclaw', 'contextscope', 'contextscope.db');

console.log('🔍 验证 SQLite 数据库\n');
console.log(`📁 数据库路径：${DB_FILE}\n`);

try {
  const db = new DatabaseSync(DB_FILE);
  
  // 检查表结构
  console.log('📋 数据库表结构:');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  tables.forEach((t) => console.log(`   - ${t.name}`));
  console.log('');
  
  // 检查 requests 表
  console.log('📊 Requests 表统计:');
  const reqStats = db.prepare('SELECT type, COUNT(*) as count, SUM(CAST(usage_json AS INTEGER)) as total_tokens FROM requests GROUP BY type').all();
  reqStats.forEach((r) => {
    console.log(`   ${r.type}: ${r.count} 条记录`);
  });
  console.log('');
  
  // 检查最新的 output 记录是否有 taskId
  console.log('📝 最新的 Output 记录 (检查 taskId):');
  const latestOutputs = db.prepare(`
    SELECT run_id, task_id, session_id, usage_json, timestamp 
    FROM requests 
    WHERE type = 'output' 
    ORDER BY timestamp DESC 
    LIMIT 5
  `).all();
  
  latestOutputs.forEach((r, idx) => {
    const usage = JSON.parse(r.usage_json || '{}');
    const hasTaskId = r.task_id ? '✅' : '❌';
    console.log(`   [${idx+1}] ${hasTaskId} TaskId: ${r.task_id || 'N/A'} | Output: ${usage.output || 0} | RunId: ${r.run_id.substring(0, 8)}...`);
  });
  console.log('');
  
  // 检查 tasks 表
  console.log('📋 Tasks 表统计:');
  const taskStats = db.prepare('SELECT COUNT(*) as count FROM tasks').get();
  console.log(`   总任务数：${taskStats.count}`);
  
  const latestTasks = db.prepare(`
    SELECT task_id, session_id, llm_calls, total_input, total_output, tool_calls 
    FROM tasks 
    ORDER BY start_time DESC 
    LIMIT 3
  `).all();
  
  console.log('\n最新的 Tasks:');
  latestTasks.forEach((t, idx) => {
    console.log(`   [${idx+1}] ${t.task_id.substring(0, 24)}...`);
    console.log(`       LLM: ${t.llm_calls} | Input: ${t.total_input} | Output: ${t.total_output} | Tools: ${t.tool_calls}`);
  });
  console.log('');
  
  // 验证 Task 和 Request 的关联
  console.log('🔗 Task-Request 关联验证:');
  const 关联验证 = db.prepare(`
    SELECT t.task_id, t.total_output as task_output, 
           COUNT(r.id) as req_count, 
           SUM(CAST(r.usage_json AS INTEGER)) as req_output
    FROM tasks t
    LEFT JOIN requests r ON t.task_id = r.task_id AND r.type = 'output'
    GROUP BY t.task_id
    ORDER BY t.start_time DESC
    LIMIT 3
  `).all();
  
  关联验证.forEach((v, idx) => {
    const match = v.task_output === v.req_output ? '✅' : '❌';
    console.log(`   [${idx+1}] ${match} Task: ${v.task_id.substring(0, 24)}...`);
    console.log(`       Task Output: ${v.task_output} | Request Output: ${v.req_output || 0} | Request Count: ${v.req_count}`);
  });
  
  db.close();
  
} catch (error) {
  console.log(`❌ 错误：${error.message}`);
}
