/**
 * Check latest requests for output data
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

const outputRequests = data.requests.filter(r => r.type === 'output');
const inputRequests = data.requests.filter(r => r.type === 'input');

console.log(`Input 请求：${inputRequests.length}`);
console.log(`Output 请求：${outputRequests.length}\n`);

if (outputRequests.length === 0) {
  console.log('❌ 没有任何 Output 请求记录！');
  console.log('\n这说明 llm_output hook 没有捕获任何数据。');
  console.log('可能原因:');
  console.log('1. OpenClaw 没有触发 llm_output hook');
  console.log('2. Hook 触发了但 event.usage 为空');
  console.log('3. ContextScope 插件没有正确注册 hook');
} else {
  console.log('最近的 Output 记录:');
  outputRequests.slice(0, 5).forEach((r, idx) => {
    console.log(`  [${idx+1}] ${new Date(r.timestamp).toLocaleString('zh-CN')} | Output: ${r.usage?.output || 0} | Model: ${r.model}`);
  });
}
