/**
 * Check latest task and its requests
 */

import fs from 'node:fs';
import path from 'node:path';

const STORAGE_DIR = path.join(process.env.USERPROFILE, '.openclaw', 'contextscope');

const files = fs.readdirSync(STORAGE_DIR)
  .filter(f => /^requests-\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .map(f => path.join(STORAGE_DIR, f))
  .sort()
  .reverse();

const latestFile = files[0];
const data = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));

console.log(`📄 检查文件：${path.basename(latestFile)}\n`);

// 找到最新的 task
const latestTask = data.tasks[0];
if (!latestTask) {
  console.log('❌ 没有找到 Task');
  process.exit(1);
}

console.log('📋 最新 Task:');
console.log(`   ID: ${latestTask.taskId}`);
console.log(`   SessionId: ${latestTask.sessionId}`);
console.log(`   LLM Calls: ${latestTask.stats?.llmCalls || 0}`);
console.log(`   Tool Calls: ${latestTask.stats?.toolCalls || 0}`);
console.log(`   Input Tokens: ${latestTask.stats?.totalInput || 0}`);
console.log(`   Output Tokens: ${latestTask.stats?.totalOutput || 0}`);
console.log(`   Run IDs: ${latestTask.runIds?.join(', ') || 'N/A'}`);
console.log('');

// 查找该 task 的 requests
const taskRequests = data.requests.filter(r => r.taskId === latestTask.taskId);
const sessionRequests = data.requests.filter(r => r.sessionId === latestTask.sessionId);

console.log(`📝 Task 关联的 Requests: ${taskRequests.length}`);
console.log(`📝 Session 关联的 Requests: ${sessionRequests.length}`);
console.log('');

if (taskRequests.length === 0 && sessionRequests.length > 0) {
  console.log('⚠️  Task 没有关联 Requests，但 Session 有 Requests');
  console.log('   说明 taskId 没有正确传递给 Request\n');
  
  console.log('Session 的 Requests:');
  sessionRequests.forEach((r, idx) => {
    console.log(`  [${idx+1}] ${r.type.toUpperCase()} | Input: ${r.usage?.input||0} | Output: ${r.usage?.output||0} | TaskId: ${r.taskId || 'N/A'}`);
  });
} else if (taskRequests.length > 0) {
  let sumInput = 0;
  let sumOutput = 0;
  
  taskRequests.forEach((r) => {
    sumInput += r.usage?.input || 0;
    sumOutput += r.usage?.output || 0;
  });
  
  console.log('Task Requests 统计:');
  console.log(`   Input 总和：${sumInput}`);
  console.log(`   Output 总和：${sumOutput}`);
  console.log('');
  
  const inputMatch = latestTask.stats?.totalInput === sumInput;
  const outputMatch = latestTask.stats?.totalOutput === sumOutput;
  
  if (inputMatch && outputMatch) {
    console.log('✅ Task 统计与 Request 总和匹配！');
  } else {
    console.log('❌ Task 统计与 Request 总和不匹配:');
    if (!inputMatch) console.log(`   Input: Task=${latestTask.stats?.totalInput}, Requests=${sumInput}`);
    if (!outputMatch) console.log(`   Output: Task=${latestTask.stats?.totalOutput}, Requests=${sumOutput}`);
  }
}
