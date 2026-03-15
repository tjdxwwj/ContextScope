/**
 * Test Task Token Aggregation
 * 
 * 验证 Task 是否正确累加所有 LLM 调用的 token
 */

import fs from 'node:fs';
import path from 'node:path';

const STORAGE_DIR = path.join(process.env.USERPROFILE, '.openclaw', 'contextscope');

console.log('🔍 验证 Task Token 累加修复\n');

// 读取最新的数据文件
const files = fs.readdirSync(STORAGE_DIR)
  .filter(f => /^requests-\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .map(f => path.join(STORAGE_DIR, f))
  .sort()
  .reverse();

const latestFile = files[0];
if (!latestFile) {
  console.log('❌ 没有找到数据文件');
  process.exit(1);
}

console.log(`📄 读取文件：${path.basename(latestFile)}\n`);

const data = JSON.parse(fs.readFileSync(latestFile, 'utf-8'));

if (!data.tasks || data.tasks.length === 0) {
  console.log('❌ 没有找到 Task 数据');
  process.exit(1);
}

console.log(`✅ 找到 ${data.tasks.length} 个 Task\n`);

// 验证每个 Task 的 token 累加
let passedTests = 0;
let failedTests = 0;

console.log('📋 Task Token 验证:\n');

data.tasks.slice(0, 10).forEach((task, idx) => {
  const taskRequests = data.requests.filter(r => r.taskId === task.taskId);
  const inputRequests = taskRequests.filter(r => r.type === 'input');
  const outputRequests = taskRequests.filter(r => r.type === 'output');
  
  const sumInput = inputRequests.reduce((sum, r) => sum + (r.usage?.input || 0), 0);
  const sumOutput = outputRequests.reduce((sum, r) => sum + (r.usage?.output || 0), 0);
  
  const taskInput = task.stats?.totalInput || 0;
  const taskOutput = task.stats?.totalOutput || 0;
  
  const inputMatch = taskInput === sumInput;
  const outputMatch = taskOutput === sumOutput;
  
  const status = inputMatch && outputMatch ? '✅' : '❌';
  
  console.log(`[${idx+1}] ${status} ${task.taskId}`);
  console.log(`     Task 记录：Input=${taskInput.toLocaleString()}, Output=${taskOutput.toLocaleString()}`);
  console.log(`     Request 总和：Input=${sumInput.toLocaleString()}, Output=${sumOutput.toLocaleString()}`);
  
  if (inputMatch && outputMatch) {
    passedTests++;
    console.log(`     ✅ 匹配！\n`);
  } else {
    failedTests++;
    if (!inputMatch) {
      console.log(`     ⚠️  Input 不匹配：差值 ${sumInput - taskInput}`);
    }
    if (!outputMatch) {
      console.log(`     ⚠️  Output 不匹配：差值 ${sumOutput - taskOutput}`);
    }
    console.log(`     LLM 调用次数：${task.stats?.llmCalls || 0}`);
    console.log(`     Request 数量：${taskRequests.length} (Input: ${inputRequests.length}, Output: ${outputRequests.length})\n`);
  }
});

console.log('═══════════════════════════════════════════════════════════');
console.log('📊 测试结果');
console.log('═══════════════════════════════════════════════════════════');
console.log(`通过：${passedTests} 个`);
console.log(`失败：${failedTests} 个`);

if (failedTests === 0 && passedTests > 0) {
  console.log('\n✅ 所有 Task 的 Token 累加正确！修复成功！');
} else if (failedTests > 0) {
  console.log('\n⚠️  仍有 Task Token 累加不正确，需要进一步排查。');
} else {
  console.log('\n⚠️  没有找到匹配的 Task 和 Request 数据。');
}
