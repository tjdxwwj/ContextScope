/**
 * Check if requests have taskId
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_FILE = path.join(process.env.USERPROFILE || '', '.openclaw', 'contextscope', 'contextscope.db');

const db = new DatabaseSync(DB_FILE);

console.log('🔍 检查 Requests 是否有 taskId\n');

// 检查最近的 requests
const requests = db.prepare(`
  SELECT run_id, task_id, type, usage_json 
  FROM requests 
  ORDER BY timestamp DESC 
  LIMIT 10
`).all();

console.log('最近的 10 条 Requests:\n');

requests.forEach((r, idx) => {
  const usage = JSON.parse(r.usage_json || '{}');
  console.log(`[${idx+1}] ${r.type.toUpperCase()}`);
  console.log(`    RunId: ${r.run_id.substring(0, 8)}...`);
  console.log(`    TaskId: ${r.task_id ? r.task_id.substring(0, 24) + '...' : '❌ NULL'}`);
  console.log(`    Output: ${usage.output || 0}\n`);
});

db.close();
