/**
 * Get full output content for the frontend fix task
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_FILE = path.join(process.env.USERPROFILE || '', '.openclaw', 'contextscope', 'contextscope.db');

const db = new DatabaseSync(DB_FILE);

// 获取 19:01:05 的完整 output (用 run_id)
const output = db.prepare(`
  SELECT * FROM requests 
  WHERE run_id = '580a7b61-1627-4bae-9fc2-449a706516e9'
    AND type = 'output'
  LIMIT 1
`).get();

if (output) {
  console.log('📝 19:01:05 的完整 LLM Output\n');
  console.log(`RunId: ${output.run_id}`);
  console.log(`TaskId: ${output.task_id}`);
  const usage = JSON.parse(output.usage_json || '{}');
  console.log(`Output Tokens: ${usage.output || 0}\n`);
  
  if (output.assistant_texts) {
    const texts = JSON.parse(output.assistant_texts || '[]');
    if (texts.length > 0) {
      console.log('完整内容:\n');
      console.log('='.repeat(60));
      console.log(texts[0]);
      console.log('='.repeat(60));
    }
  }
} else {
  console.log('❌ 未找到 output 记录');
}

db.close();
