/**
 * Check all LLM output for a specific task
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_FILE = path.join(process.env.USERPROFILE || '', '.openclaw', 'contextscope', 'contextscope.db');

console.log('🔍 检查单个 Task 的所有 LLM Output\n');

const db = new DatabaseSync(DB_FILE);

// 找到最近的一个有多个 LLM 调用的 task
const tasksWithMultipleCalls = db.prepare(`
  SELECT * FROM tasks 
  WHERE llm_calls > 1
  ORDER BY start_time DESC
  LIMIT 1
`).get();

if (!tasksWithMultipleCalls) {
  console.log('❌ 没有找到多次 LLM 调用的 Task');
  
  // 显示所有 tasks
  console.log('\n📋 所有 Tasks:\n');
  const allTasks = db.prepare('SELECT * FROM tasks ORDER BY start_time DESC LIMIT 10').all();
  allTasks.forEach((t, idx) => {
    console.log(`[${idx+1}] ${t.task_id.substring(0, 24)}... | LLM: ${t.llm_calls} | Output: ${t.total_output}`);
  });
} else {
  console.log('✅ 找到有多次 LLM 调用的 Task:\n');
  console.log(`TaskId: ${tasksWithMultipleCalls.task_id}`);
  console.log(`SessionId: ${tasksWithMultipleCalls.session_id}`);
  console.log(`LLM Calls: ${tasksWithMultipleCalls.llm_calls}`);
  console.log(`Total Output: ${tasksWithMultipleCalls.total_output} tokens`);
  console.log(`Start Time: ${new Date(tasksWithMultipleCalls.start_time).toLocaleString('zh-CN')}`);
  console.log('');
  
  // 查找该 task 的所有 requests
  console.log('📝 该 Task 的所有 Requests:\n');
  
  const requests = db.prepare(`
    SELECT * FROM requests 
    WHERE task_id = ?
    ORDER BY timestamp
  `).all(tasksWithMultipleCalls.task_id);
  
  console.log(`共 ${requests.length} 条记录:\n`);
  
  requests.forEach((r, idx) => {
    const usage = JSON.parse(r.usage_json || '{}');
    const time = new Date(r.timestamp).toLocaleTimeString('zh-CN');
    
    console.log(`[${idx+1}] ${time} | ${r.type.toUpperCase()}`);
    console.log(`    RunId: ${r.run_id.substring(0, 8)}...`);
    console.log(`    Input: ${usage.input || 0} | Output: ${usage.output || 0} | Total: ${usage.total || 0}`);
    
    // 显示 output 内容预览
    if (r.type === 'output' && r.assistant_texts) {
      const texts = JSON.parse(r.assistant_texts || '[]');
      if (texts.length > 0) {
        const preview = texts[0].substring(0, 150).replace(/\n/g, ' ');
        console.log(`    Preview: ${preview}...`);
      }
    }
    console.log('');
  });
  
  // 统计 output
  const outputReqs = requests.filter(r => r.type === 'output');
  const totalOutput = outputReqs.reduce((sum, r) => {
    const usage = JSON.parse(r.usage_json || '{}');
    return sum + (usage.output || 0);
  }, 0);
  
  console.log('📊 Output 统计:');
  console.log(`   Request 中的 Output 总和：${totalOutput} tokens`);
  console.log(`   Task 记录的 Output: ${tasksWithMultipleCalls.total_output} tokens`);
  console.log(`   是否匹配：${totalOutput === tasksWithMultipleCalls.total_output ? '✅' : '❌'}`);
}

// 查找前端修复任务的所有 LLM 调用
console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('🔍 前端修复任务 (18:58-19:01) 的所有 LLM 调用:\n');

const frontendFixRequests = db.prepare(`
  SELECT * FROM requests 
  WHERE timestamp >= 1773572280000
    AND timestamp <= 1773572700000
  ORDER BY timestamp
`).all();

console.log(`共 ${frontendFixRequests.length} 条记录:\n`);

frontendFixRequests.forEach((r, idx) => {
  const usage = JSON.parse(r.usage_json || '{}');
  const time = new Date(r.timestamp).toLocaleTimeString('zh-CN');
  
  console.log(`[${idx+1}] ${time} | ${r.type.toUpperCase().padEnd(6)} | TaskId: ${r.task_id?.substring(0, 24) || 'N/A'}...`);
  console.log(`    RunId: ${r.run_id.substring(0, 8)}... | Input: ${usage.input || 0} | Output: ${usage.output || 0}`);
  
  if (r.type === 'output' && r.assistant_texts) {
    const texts = JSON.parse(r.assistant_texts || '[]');
    if (texts.length > 0) {
      const preview = texts[0].substring(0, 100).replace(/\n/g, ' ');
      console.log(`    Preview: ${preview}...`);
    }
  }
  console.log('');
});

// 按 task_id 分组统计
console.log('📊 按 Task 分组统计:\n');

const taskGroups = new Map();
frontendFixRequests.forEach(r => {
  if (!r.task_id) return;
  if (!taskGroups.has(r.task_id)) {
    taskGroups.set(r.task_id, { input: 0, output: 0, count: 0 });
  }
  const group = taskGroups.get(r.task_id);
  const usage = JSON.parse(r.usage_json || '{}');
  group.input += usage.input || 0;
  group.output += usage.output || 0;
  group.count++;
});

taskGroups.forEach((stats, taskId, idx) => {
  console.log(`[${idx+1}] TaskId: ${taskId.substring(0, 24)}...`);
  console.log(`    Requests: ${stats.count} | Input: ${stats.input} | Output: ${stats.output}`);
});

db.close();
