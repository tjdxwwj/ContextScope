/**
 * Check latest output requests for taskId
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

const outputRequests = data.requests.filter(r => r.type === 'output').slice(0, 10);

console.log('最近的 Output 记录:\n');

outputRequests.forEach((r, idx) => {
  console.log(`[${idx+1}] ${new Date(r.timestamp).toLocaleTimeString('zh-CN')}`);
  console.log(`    RunId: ${r.runId}`);
  console.log(`    TaskId: ${r.taskId || '❌ N/A'}`);
  console.log(`    Output: ${r.usage?.output || 0}`);
  console.log(`    Model: ${r.model}`);
  console.log('');
});

const withTaskId = outputRequests.filter(r => r.taskId).length;
const withoutTaskId = outputRequests.filter(r => !r.taskId).length;

console.log(`有 taskId: ${withTaskId}`);
console.log(`无 taskId: ${withoutTaskId}`);
