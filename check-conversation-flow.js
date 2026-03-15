/**
 * Check conversation flow with tool calls
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_FILE = path.join(process.env.USERPROFILE || '', '.openclaw', 'contextscope', 'contextscope.db');

console.log('🔍 检查前端修复任务的完整对话流程\n');

const db = new DatabaseSync(DB_FILE);

// 找到前端修复任务的 runId
const frontendFixRunId = '580a7b61-1627-4bae-9fc2-449a706516e9';

console.log(`📋 RunId: ${frontendFixRunId} 的所有记录:\n`);

const allRecords = db.prepare(`
  SELECT 'request' as type, run_id, task_id, type as req_type, usage_json, assistant_texts, timestamp, NULL as tool_name, NULL as params_json
  FROM requests
  WHERE run_id = ? OR task_id LIKE '%e93b19e5%'
  
  UNION ALL
  
  SELECT 'tool' as type, run_id, NULL as task_id, NULL as req_type, NULL as usage_json, NULL as assistant_texts, timestamp, tool_name, params_json
  FROM tool_calls
  WHERE run_id = ?
  
  ORDER BY timestamp
`).all(frontendFixRunId, frontendFixRunId);

console.log(`共 ${allRecords.length} 条记录:\n`);

let llmCallCount = 0;
let toolCallCount = 0;

allRecords.forEach((r, idx) => {
  const time = new Date(r.timestamp).toLocaleTimeString('zh-CN');
  
  if (r.type === 'request') {
    llmCallCount++;
    const usage = JSON.parse(r.usage_json || '{}');
    console.log(`[${idx+1}] ${time} | LLM ${r.req_type?.toUpperCase()}`);
    console.log(`    RunId: ${r.run_id.substring(0, 8)}... | TaskId: ${r.task_id?.substring(0, 24)}`);
    console.log(`    Input: ${usage.input || 0} | Output: ${usage.output || 0}`);
    
    if (r.req_type === 'output' && r.assistant_texts) {
      const texts = JSON.parse(r.assistant_texts || '[]');
      if (texts.length > 0) {
        const preview = texts[0].substring(0, 150).replace(/\n/g, ' ');
        console.log(`    Preview: ${preview}...`);
      }
    }
  } else if (r.type === 'tool') {
    toolCallCount++;
    console.log(`[${idx+1}] ${time} | TOOL: ${r.tool_name}`);
    console.log(`    RunId: ${r.run_id.substring(0, 8)}...`);
    
    if (r.params_json) {
      const params = JSON.parse(r.params_json || '{}');
      if (params.path) {
        console.log(`    File: ${params.path.split('\\').pop()}`);
      }
    }
  }
  console.log('');
});

console.log('📊 统计:');
console.log(`   LLM 调用：${llmCallCount} 次`);
console.log(`   工具调用：${toolCallCount} 次`);
console.log('');

// 查找包含代码修改的 LLM output
console.log('🔍 查找包含代码修改建议的 LLM output:\n');

const codeOutputs = db.prepare(`
  SELECT * FROM requests 
  WHERE type = 'output'
    AND assistant_texts IS NOT NULL
  ORDER BY timestamp DESC
  LIMIT 5
`).all();

codeOutputs.forEach((r, idx) => {
  const time = new Date(r.timestamp).toLocaleTimeString('zh-CN');
  const usage = JSON.parse(r.usage_json || '{}');
  
  console.log(`[${idx+1}] ${time} | Output: ${usage.output || 0} tokens`);
  console.log(`    TaskId: ${r.task_id?.substring(0, 24)}...`);
  
  if (r.assistant_texts) {
    const texts = JSON.parse(r.assistant_texts || '[]');
    if (texts.length > 0) {
      const text = texts[0];
      // 检查是否包含代码块或编辑说明
      const hasCodeBlock = text.includes('```');
      const hasEditInstruction = text.includes('修改') || text.includes('edit') || text.includes('添加') || text.includes('修复');
      
      console.log(`    包含代码块：${hasCodeBlock ? '✅' : '❌'}`);
      console.log(`    包含编辑说明：${hasEditInstruction ? '✅' : '❌'}`);
      
      // 显示前 300 字符
      const preview = text.substring(0, 300).replace(/\n/g, ' ');
      console.log(`    Preview: ${preview}...`);
    }
  }
  console.log('');
});

db.close();
