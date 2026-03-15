/**
 * Direct database check for task output tokens
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_FILE = path.join(process.env.USERPROFILE || '', '.openclaw', 'contextscope', 'contextscope.db');

const db = new DatabaseSync(DB_FILE);

console.log('🔍 直接从数据库验证 Task Output Tokens\n');

// 获取最近 5 个 tasks
const tasks = db.prepare(`
  SELECT * FROM tasks 
  ORDER BY start_time DESC 
  LIMIT 5
`).all();

tasks.forEach((task, idx) => {
  console.log(`[${idx+1}] TaskId: ${task.task_id.substring(0, 24)}...`);
  console.log(`    Task 表 Output: ${task.total_output}`);
  
  // 从 requests 表计算真实的 output
  const outputReqs = db.prepare(`
    SELECT usage_json FROM requests 
    WHERE task_id = ? AND type = 'output'
  `).all(task.task_id);
  
  const realOutput = outputReqs.reduce((sum, r) => {
    const usage = JSON.parse(r.usage_json || '{}');
    return sum + (usage.output || 0);
  }, 0);
  
  console.log(`    Requests 表 Output: ${realOutput}`);
  console.log(`    匹配：${realOutput > 0 ? '✅' : '❌'}\n`);
});

db.close();
