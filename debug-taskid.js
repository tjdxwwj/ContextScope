/**
 * Debug: Check if taskId is in the raw JSON file
 */

import fs from 'node:fs';
import path from 'node:path';

const STORAGE_DIR = path.join(process.env.USERPROFILE, '.openclaw', 'contextscope');
const latestFile = path.join(STORAGE_DIR, 'requests-2026-03-15.json');

console.log(`📄 读取文件：${latestFile}\n`);

const content = fs.readFileSync(latestFile, 'utf-8');
const data = JSON.parse(content);

// 找到最新的 output 记录
const outputReqs = data.requests
  .filter(r => r.type === 'output')
  .sort((a, b) => b.timestamp - a.timestamp)
  .slice(0, 3);

console.log('最新的 Output 记录（原始 JSON 数据）:\n');

outputReqs.forEach((r, idx) => {
  console.log(`[${idx+1}] RunId: ${r.runId}`);
  console.log(`    完整数据:`);
  console.log(`    {`);
  console.log(`      type: "${r.type}",`);
  console.log(`      taskId: ${r.taskId ? `"${r.taskId}"` : 'undefined'},`);
  console.log(`      runId: "${r.runId}",`);
  console.log(`      sessionId: "${r.sessionId}",`);
  console.log(`      usage: { output: ${r.usage?.output || 0} },`);
  console.log(`      timestamp: ${r.timestamp}`);
  console.log(`    }`);
  console.log('');
});

// 检查是否有带 taskId 的 output
const withTaskId = data.requests.filter(r => r.type === 'output' && r.taskId);
const withoutTaskId = data.requests.filter(r => r.type === 'output' && !r.taskId);

console.log('统计:');
console.log(`   有 taskId 的 Output: ${withTaskId.length}`);
console.log(`   无 taskId 的 Output: ${withoutTaskId.length}`);
