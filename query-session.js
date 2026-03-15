/**
 * Query all LLM calls for a session
 */

import fs from 'node:fs';
import path from 'node:path';

const STORAGE_DIR = path.join(process.env.USERPROFILE, '.openclaw', 'contextscope');
const sessionId = process.argv[2];

if (!sessionId) {
  console.log('用法：node query-session.js <sessionId>');
  process.exit(1);
}

console.log(`🔍 查询 Session: ${sessionId}\n`);

// 读取所有数据文件
function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

const files = fs.readdirSync(STORAGE_DIR)
  .filter(f => /^requests-\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .map(f => path.join(STORAGE_DIR, f))
  .sort();

console.log(`📄 扫描 ${files.length} 个数据文件...\n`);

const allRequests = [];
for (const file of files) {
  const data = readJsonFile(file);
  if (data?.requests) {
    allRequests.push(...data.requests);
  }
}

// 筛选该 session 的请求
const sessionRequests = allRequests.filter(r => r.sessionId === sessionId);

if (sessionRequests.length === 0) {
  console.log(`❌ 未找到 Session: ${sessionId}`);
  process.exit(1);
}

console.log(`✅ 找到 ${sessionRequests.length} 条请求记录\n`);

// 按时间排序
sessionRequests.sort((a, b) => a.timestamp - b.timestamp);

// 统计
let totalInput = 0;
let totalOutput = 0;
let inputCalls = 0;
let outputCalls = 0;

console.log('📋 LLM 调用时间线:\n');

sessionRequests.forEach((r, idx) => {
  const time = new Date(r.timestamp).toLocaleTimeString('zh-CN');
  const type = r.type === 'input' ? '📤 INPUT' : '📥 OUTPUT';
  const tokens = r.type === 'input' ? r.usage?.input || 0 : r.usage?.output || 0;
  
  if (r.type === 'input') {
    totalInput += r.usage?.input || 0;
    inputCalls++;
  } else {
    totalOutput += r.usage?.output || 0;
    outputCalls++;
  }
  
  console.log(`[${idx+1}] ${time} ${type.padEnd(10)} | ${tokens.toString().padStart(6)} tokens`);
  
  // 简短显示 prompt 或 assistant text
  if (r.type === 'input' && r.prompt) {
    const preview = r.prompt.substring(0, 80).replace(/\n/g, ' ');
    console.log(`     ${preview}${r.prompt.length > 80 ? '...' : ''}`);
  } else if (r.type === 'output' && r.assistantTexts?.[0]) {
    const preview = r.assistantTexts[0].substring(0, 80).replace(/\n/g, ' ');
    console.log(`     ${preview}${r.assistantTexts[0].length > 80 ? '...' : ''}`);
  }
  console.log('');
});

console.log('═══════════════════════════════════════════════════════════');
console.log('📊 汇总');
console.log('═══════════════════════════════════════════════════════════');
console.log(`Input 调用：${inputCalls} 次 | ${totalInput.toLocaleString()} tokens`);
console.log(`Output 调用：${outputCalls} 次 | ${totalOutput.toLocaleString()} tokens`);
console.log(`Total: ${(totalInput + totalOutput).toLocaleString()} tokens`);
console.log('');

// 检查 input/output 是否匹配
if (inputCalls !== outputCalls) {
  console.log(`⚠️  警告：Input (${inputCalls}) 和 Output (${outputCalls}) 数量不匹配！`);
  if (inputCalls > outputCalls) {
    console.log(`   缺少 ${inputCalls - outputCalls} 条 Output 记录`);
  }
} else {
  console.log(`✅ Input/Output 数量匹配`);
}
