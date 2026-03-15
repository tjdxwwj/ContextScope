/**
 * Check specific task output
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_FILE = path.join(process.env.USERPROFILE || '', '.openclaw', 'contextscope', 'contextscope.db');

console.log('🔍 检查扈十娘搜索任务的 Output 记录\n');

const db = new DatabaseSync(DB_FILE);

// 查找 subagent 相关的记录
console.log('📋 Subagent 相关记录:\n');

const subagentLinks = db.prepare(`
  SELECT * FROM subagent_links 
  WHERE child_session_key LIKE '%6aa857af%'
  ORDER BY timestamp DESC
`).all();

subagentLinks.forEach((l, idx) => {
  console.log(`[${idx+1}] Subagent Link:`);
  console.log(`    Parent RunId: ${l.parent_run_id}`);
  console.log(`    Child RunId: ${l.child_run_id}`);
  console.log(`    Child Session: ${l.child_session_key}`);
  console.log(`    Runtime: ${l.runtime}`);
  console.log(`    Timestamp: ${new Date(l.timestamp).toLocaleString('zh-CN')}`);
  console.log('');
  
  // 查找对应的 output 记录
  const outputReq = db.prepare(`
    SELECT * FROM requests 
    WHERE run_id = ? AND type = 'output'
  `).get(l.child_run_id);
  
  if (outputReq) {
    const usage = JSON.parse(outputReq.usage_json || '{}');
    console.log(`    ✅ 找到 Output 记录:`);
    console.log(`       TaskId: ${outputReq.task_id}`);
    console.log(`       Output Tokens: ${usage.output || 0}`);
    console.log(`       Input Tokens: ${usage.input || 0}`);
    console.log(`       Timestamp: ${new Date(outputReq.timestamp).toLocaleString('zh-CN')}`);
  } else {
    console.log(`    ❌ 未找到 Output 记录`);
  }
  console.log('');
});

// 查找所有与该任务相关的 requests
console.log('📝 该任务的所有 Requests:\n');

const allReqs = db.prepare(`
  SELECT * FROM requests 
  WHERE task_id LIKE '%8881beda%' OR run_id LIKE '%c2aa5463%'
  ORDER BY timestamp
`).all();

allReqs.forEach((r, idx) => {
  const usage = JSON.parse(r.usage_json || '{}');
  console.log(`[${idx+1}] ${r.type.toUpperCase()} | RunId: ${r.run_id.substring(0, 8)}... | TaskId: ${r.task_id?.substring(0, 24) || 'N/A'}...`);
  console.log(`    Input: ${usage.input || 0} | Output: ${usage.output || 0} | Total: ${usage.total || 0}`);
  console.log('');
});

db.close();
