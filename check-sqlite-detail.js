/**
 * Check detailed SQLite data
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_FILE = path.join(process.env.USERPROFILE || '', '.openclaw', 'contextscope', 'contextscope.db');

console.log('🔍 详细检查 SQLite 数据\n');

const db = new DatabaseSync(DB_FILE);

// 检查最新的 subagent 记录
console.log('📋 Subagent Links 表:');
const subagentLinks = db.prepare(`
  SELECT * FROM subagent_links ORDER BY timestamp DESC LIMIT 3
`).all();

subagentLinks.forEach((l, idx) => {
  console.log(`   [${idx+1}] Parent RunId: ${l.parent_run_id.substring(0, 8)}...`);
  console.log(`       Child Session: ${l.child_session_key || 'N/A'}`);
  console.log(`       Runtime: ${l.runtime || 'N/A'}`);
  console.log(`       Timestamp: ${new Date(l.timestamp).toLocaleString('zh-CN')}`);
  console.log('');
});

// 检查 Requests 关联
console.log('📝 Requests 与 Task 关联:');
const reqsWithTask = db.prepare(`
  SELECT r.run_id, r.task_id, r.type, r.usage_json, r.timestamp
  FROM requests r
  WHERE r.task_id IS NOT NULL
  ORDER BY r.timestamp DESC
  LIMIT 5
`).all();

reqsWithTask.forEach((r, idx) => {
  const usage = JSON.parse(r.usage_json || '{}');
  console.log(`   [${idx+1}] ${r.type.toUpperCase()} | TaskId: ${r.task_id?.substring(0, 24)}... | Output: ${usage.output || 0}`);
});

console.log('');

// 检查是否有 task 相关的数据
console.log('🔍 检查 Tasks 表为何为空:');
const taskCount = db.prepare('SELECT COUNT(*) as count FROM tasks').get();
console.log(`   Tasks 记录数：${taskCount.count}`);

// 检查是否有 captureTask 的日志
const logs = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table'
`).all();
console.log(`   数据库表：${logs.map(l => l.name).join(', ')}`);

db.close();
