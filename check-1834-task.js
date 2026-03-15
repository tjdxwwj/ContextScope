/**
 * Check 18:34 fix task output
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_FILE = path.join(process.env.USERPROFILE || '', '.openclaw', 'contextscope', 'contextscope.db');

console.log('🔍 检查 18:34【修复】任务的 Output 记录\n');

const db = new DatabaseSync(DB_FILE);

// 查找 18:34 左右的 output 记录
console.log('📝 18:30-18:45 之间的 Output 记录:\n');

const outputs = db.prepare(`
  SELECT * FROM requests 
  WHERE type = 'output' 
    AND timestamp >= 1773570600000
    AND timestamp <= 1773571500000
  ORDER BY timestamp
`).all();

outputs.forEach((r, idx) => {
  const usage = JSON.parse(r.usage_json || '{}');
  const time = new Date(r.timestamp).toLocaleTimeString('zh-CN');
  console.log(`[${idx+1}] ${time} | TaskId: ${r.task_id?.substring(0, 24) || 'N/A'}...`);
  console.log(`    RunId: ${r.run_id.substring(0, 8)}...`);
  console.log(`    Input: ${usage.input || 0} | Output: ${usage.output || 0}`);
  
  // 如果有 assistant_texts，显示前 100 字符
  if (r.assistant_texts) {
    const texts = JSON.parse(r.assistant_texts || '[]');
    if (texts.length > 0) {
      const preview = texts[0].substring(0, 100).replace(/\n/g, ' ');
      console.log(`    Preview: ${preview}...`);
    }
  }
  console.log('');
});

// 查找是否有代码相关的 output
console.log('🔍 检查是否有代码修改相关的 output:\n');

const codeOutputs = db.prepare(`
  SELECT * FROM requests 
  WHERE type = 'output' 
    AND assistant_texts LIKE '%edit%'
    OR assistant_texts LIKE '%代码%'
    OR assistant_texts LIKE '%修复%'
  ORDER BY timestamp DESC
  LIMIT 5
`).all();

if (codeOutputs.length === 0) {
  console.log('   没有找到明确包含代码修改关键词的 output');
  console.log('   可能 output 中没有包含代码内容，或者使用了其他关键词\n');
} else {
  codeOutputs.forEach((r, idx) => {
    const usage = JSON.parse(r.usage_json || '{}');
    console.log(`[${idx+1}] TaskId: ${r.task_id?.substring(0, 24)}... | Output: ${usage.output || 0}`);
    const texts = JSON.parse(r.assistant_texts || '[]');
    if (texts.length > 0) {
      const preview = texts[0].substring(0, 150).replace(/\n/g, ' ');
      console.log(`    Preview: ${preview}...`);
    }
    console.log('');
  });
}

db.close();
