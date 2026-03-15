/**
 * Query Task Data Script
 * 
 * 查询指定 taskId 的所有相关记录，如果没有则列出所有可用 tasks
 * 用法：node query-task.js [taskId] [--verbose]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 实际存储路径是用户主目录，不是插件目录
const STORAGE_DIR = path.join(process.env.USERPROFILE, '.openclaw', 'contextscope');

const taskId = process.argv[2];
const verbose = process.argv.includes('--verbose');

console.log(`🔍 ContextScope 数据查询工具`);
console.log(`📁 存储目录：${STORAGE_DIR}\n`);

// 读取所有 JSON 文件
function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`⚠️  读取失败 ${path.basename(filePath)}: ${error.message}`);
    return null;
  }
}

// 获取所有数据文件
function getAllDataFiles() {
  const files = [];
  
  const legacyFile = path.join(STORAGE_DIR, 'requests.json');
  if (fs.existsSync(legacyFile)) {
    files.push(legacyFile);
  }
  
  if (fs.existsSync(STORAGE_DIR)) {
    const datedFiles = fs.readdirSync(STORAGE_DIR)
      .filter(f => /^requests-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map(f => path.join(STORAGE_DIR, f));
    files.push(...datedFiles);
  }
  
  return files.sort();
}

const allDataFiles = getAllDataFiles();
console.log(`📄 找到 ${allDataFiles.length} 个数据文件:\n`);
allDataFiles.forEach(f => console.log(`   - ${path.basename(f)}`));
console.log('');

// 收集所有 tasks
const allTasks = [];
const allRequests = [];
const allToolCalls = [];
const allSubagentLinks = [];

for (const file of allDataFiles) {
  const data = readJsonFile(file);
  if (!data) continue;
  
  if (data.tasks) allTasks.push(...data.tasks);
  if (data.requests) allRequests.push(...data.requests);
  if (data.toolCalls) allToolCalls.push(...data.toolCalls);
  if (data.subagentLinks) allSubagentLinks.push(...data.subagentLinks);
}

// 如果有指定 taskId，查找它
if (taskId) {
  console.log(`🎯 查询 Task: ${taskId}\n`);
  
  const task = allTasks.find(t => t.taskId === taskId);
  
  if (!task) {
    console.log(`❌ 未找到 Task: ${taskId}`);
    console.log('\n可能的原因:');
    console.log('   1. Task ID 不正确');
    console.log('   2. 数据已被清理（超过保留期）');
    console.log('   3. ContextScope 插件未正确记录数据');
    console.log('   4. 存储文件不存在或损坏');
  } else {
    console.log(`✅ Task 数据:`);
    console.log(`   状态：${task.status}`);
    console.log(`   开始时间：${new Date(task.startTime).toLocaleString('zh-CN')}`);
    console.log(`   结束时间：${task.endTime ? new Date(task.endTime).toLocaleString('zh-CN') : 'N/A'}`);
    console.log(`   持续时间：${task.duration ? `${(task.duration / 1000).toFixed(2)}s` : 'N/A'}`);
    console.log(`   LLM 调用次数：${task.stats?.llmCalls || 0}`);
    console.log(`   工具调用次数：${task.stats?.toolCalls || 0}`);
    console.log(`   子任务数：${task.stats?.subagentSpawns || 0}`);
    console.log(`   Input Tokens: ${task.stats?.totalInput || 0}`);
    console.log(`   Output Tokens: ${task.stats?.totalOutput || 0}`);
    console.log(`   Total Tokens: ${task.stats?.totalTokens || 0}`);
    console.log(`   预估成本：$${(task.stats?.estimatedCost || 0).toFixed(6)}`);
    if (task.runIds?.length > 0) {
      console.log(`   Run IDs: ${task.runIds.join(', ')}`);
    }
    console.log('');
    
    // 查找相关的 requests
    const relatedRequests = allRequests.filter(r => r.taskId === taskId);
    if (relatedRequests.length > 0) {
      console.log(`📝 关联的 ${relatedRequests.length} 条 Request 记录:`);
      let totalIn = 0, totalOut = 0;
      relatedRequests.forEach((r, idx) => {
        const tokens = r.type === 'input' ? `In:${r.usage?.input||0}` : `Out:${r.usage?.output||0}`;
        totalIn += r.usage?.input || 0;
        totalOut += r.usage?.output || 0;
        console.log(`   [${idx+1}] ${r.type.toUpperCase().padEnd(6)} | ${tokens.padEnd(12)} | RunId: ${r.runId}`);
      });
      console.log(`   小计：Input=${totalIn}, Output=${totalOut}\n`);
    } else {
      console.log(`⚠️  没有找到关联的 Request 记录\n`);
    }
  }
} else {
  // 没有指定 taskId，列出所有可用的 tasks
  console.log(`📋 所有可用的 Tasks (共 ${allTasks.length} 个):\n`);
  
  if (allTasks.length === 0) {
    console.log(`   ❌ 没有找到任何 Task 记录！`);
    console.log(`\n   说明 ContextScope 插件没有正确记录任务数据。`);
  } else {
    // 按时间排序
    allTasks.sort((a, b) => b.startTime - a.startTime);
    
    // 显示最近的 20 个
    const displayTasks = allTasks.slice(0, 20);
    console.log(`   显示最近的 ${displayTasks.length} 个:\n`);
    
    displayTasks.forEach((t, idx) => {
      const time = new Date(t.startTime).toLocaleString('zh-CN');
      const duration = t.duration ? `${(t.duration/1000).toFixed(1)}s` : 'N/A';
      const tokens = `${t.stats?.totalInput||0}+${t.stats?.totalOutput||0}=${t.stats?.totalTokens||0}`;
      const status = t.status || 'unknown';
      const llmCalls = t.stats?.llmCalls || 0;
      const tools = t.stats?.toolCalls || 0;
      const output = t.stats?.totalOutput || 0;
      
      console.log(`   [${idx+1}] ${t.taskId}`);
      console.log(`       ${time} | ${duration} | ${status.padEnd(10)} | LLM:${llmCalls.toString().padStart(3)} | Tools:${tools.toString().padStart(3)} | Out:${output.toString().padStart(6)} | ${tokens}`);
    });
    
    if (allTasks.length > 20) {
      console.log(`\n   ... 还有 ${allTasks.length - 20} 个 tasks`);
    }
  }
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('📊 总体统计');
console.log('═══════════════════════════════════════════════════════════');
console.log(`Tasks:        ${allTasks.length}`);
console.log(`Requests:     ${allRequests.length} (Input: ${allRequests.filter(r=>r.type==='input').length}, Output: ${allRequests.filter(r=>r.type==='output').length})`);
console.log(`Tool Calls:   ${allToolCalls.length}`);
console.log(`Subagent Links: ${allSubagentLinks.length}`);

// 检查数据完整性
console.log('\n🔍 数据完整性检查:');
const inputReqs = allRequests.filter(r => r.type === 'input');
const outputReqs = allRequests.filter(r => r.type === 'output');

if (inputReqs.length > 0 && outputReqs.length === 0) {
  console.log(`   ⚠️  警告：有 ${inputReqs.length} 条 Input 记录，但 Output 记录为 0！`);
  console.log(`      说明 llm_output hook 可能没有正确触发或保存。`);
} else if (outputReqs.length === 0 && allTasks.length === 0) {
  console.log(`   ⚠️  警告：没有任何 Output 记录和 Task 记录！`);
  console.log(`      ContextScope 插件可能没有正常工作。`);
} else {
  console.log(`   ✅ 数据看起来正常`);
}

if (verbose && allTasks.length > 0) {
  console.log('\n📋 完整 Task 数据:');
  console.log(JSON.stringify(allTasks, null, 2));
}
