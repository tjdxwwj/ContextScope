/**
 * Check 19:52 task complete output
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_FILE = path.join(process.env.USERPROFILE || '', '.openclaw', 'contextscope', 'contextscope.db');

const db = new DatabaseSync(DB_FILE);

console.log('🔍 检查 19:52 任务的完整 Output\n');

// 找到 19:52 左右的 task
const task = db.prepare(`
  SELECT * FROM tasks 
  WHERE start_time BETWEEN 1773575400000 AND 1773575700000
  ORDER BY start_time DESC
  LIMIT 1
`).get();

if (!task) {
  console.log('❌ 未找到 19:52 的 task');
  
  // 显示最近的 tasks
  console.log('\n最近的 Tasks:\n');
  const recentTasks = db.prepare(`
    SELECT task_id, start_time, llm_calls, total_output 
    FROM tasks 
    ORDER BY start_time DESC 
    LIMIT 5
  `).all();
  
  recentTasks.forEach((t, idx) => {
    console.log(`[${idx+1}] ${t.task_id.substring(0, 24)}... | ${new Date(t.start_time).toLocaleString('zh-CN')} | Output: ${t.total_output}`);
  });
  
  db.close();
  process.exit(1);
}

console.log('📋 Task 信息:\n');
console.log(`TaskId: ${task.task_id}`);
console.log(`SessionId: ${task.session_id}`);
console.log(`开始时间：${new Date(task.start_time).toLocaleString('zh-CN')}`);
console.log(`结束时间：${task.end_time ? new Date(task.end_time).toLocaleString('zh-CN') : 'N/A'}`);
console.log(`LLM Calls: ${task.llm_calls}`);
console.log(`Tool Calls: ${task.tool_calls}`);
console.log(`Stats - Input: ${task.total_input}, Output: ${task.total_output}, Total: ${task.total_tokens}`);
console.log('');

// 查找该 task 的 requests
console.log('📝 Requests 记录:\n');

const requests = db.prepare(`
  SELECT * FROM requests 
  WHERE task_id = ?
  ORDER BY timestamp
`).all(task.task_id);

console.log(`共 ${requests.length} 条记录:\n`);

requests.forEach((r, idx) => {
  const usage = JSON.parse(r.usage_json || '{}');
  const time = new Date(r.timestamp).toLocaleTimeString('zh-CN');
  
  console.log(`[${idx+1}] ${time} | ${r.type.toUpperCase()}`);
  console.log(`    RunId: ${r.run_id}`);
  console.log(`    Input: ${usage.input || 0} | Output: ${usage.output || 0}`);
  
  if (r.type === 'output' && r.assistant_texts) {
    const texts = JSON.parse(r.assistant_texts || '[]');
    if (texts.length > 0) {
      console.log(`    LLM 文字回复 (${texts[0].length} 字符):`);
      console.log('    ' + '─'.repeat(60));
      console.log(`    ${texts[0].substring(0, 500).replace(/\n/g, '\n    ')}${texts[0].length > 500 ? '...' : ''}`);
      console.log('    ' + '─'.repeat(60));
    }
  }
  console.log('');
});

// 查找该 task 的 tool calls
console.log('🛠️  Tool Calls 记录:\n');

const toolCalls = db.prepare(`
  SELECT * FROM tool_calls 
  WHERE run_id IN (
    SELECT run_id FROM requests WHERE task_id = ?
  )
  ORDER BY timestamp
`).all(task.task_id);

console.log(`共 ${toolCalls.length} 次工具调用:\n`);

toolCalls.forEach((t, idx) => {
  const time = new Date(t.timestamp).toLocaleTimeString('zh-CN');
  
  console.log(`[${idx+1}] ${time} | ${t.tool_name}`);
  console.log(`    RunId: ${t.run_id}`);
  console.log(`    Duration: ${t.duration_ms || 'N/A'}ms`);
  
  if (t.params_json) {
    const params = JSON.parse(t.params_json || '{}');
    console.log(`    参数:`);
    console.log('    ' + '─'.repeat(60));
    
    // 显示关键参数
    if (params.path) {
      console.log(`    文件：${params.path}`);
    }
    
    if (params.newText) {
      console.log(`    newText (${params.newText.length} 字符):`);
      console.log(`    ${params.newText.substring(0, 300).replace(/\n/g, '\n    ')}${params.newText.length > 300 ? '...' : ''}`);
    }
    
    if (params.command) {
      console.log(`    command: ${params.command.substring(0, 100)}...`);
    }
    
    console.log('    ' + '─'.repeat(60));
  }
  console.log('');
});

// 统计
console.log('📊 完整 Output 统计:\n');

const outputReqs = requests.filter(r => r.type === 'output');
const totalOutputFromRequests = outputReqs.reduce((sum, r) => {
  const usage = JSON.parse(r.usage_json || '{}');
  return sum + (usage.output || 0);
}, 0);

console.log(`Requests Output 总和：${totalOutputFromRequests} tokens`);
console.log(`Task 记录 Output: ${task.total_output} tokens`);
console.log(`匹配：${totalOutputFromRequests === task.total_output ? '✅' : '❌'}`);
console.log('');

console.log(`Tool Calls: ${toolCalls.length} 次`);
console.log(`LLM 文字回复：${outputReqs.length} 条`);

db.close();
