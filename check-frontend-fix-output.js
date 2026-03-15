/**
 * Check frontend fix task output for code content
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_FILE = path.join(process.env.USERPROFILE || '', '.openclaw', 'contextscope', 'contextscope.db');

console.log('🔍 检查前端修复任务的 Output 是否包含代码\n');

const db = new DatabaseSync(DB_FILE);

// 查找 19:00 左右的 output 记录
console.log('📝 19:00 前后的 Output 记录:\n');

const outputs = db.prepare(`
  SELECT * FROM requests 
  WHERE type = 'output' 
    AND timestamp >= 1773571200000
    AND timestamp <= 1773572400000
  ORDER BY timestamp
`).all();

outputs.forEach((r, idx) => {
  const usage = JSON.parse(r.usage_json || '{}');
  const time = new Date(r.timestamp).toLocaleTimeString('zh-CN');
  console.log(`[${idx+1}] ${time} | TaskId: ${r.task_id?.substring(0, 24)}... | Output: ${usage.output || 0}`);
  
  // 检查 assistant_texts
  if (r.assistant_texts) {
    const texts = JSON.parse(r.assistant_texts || '[]');
    if (texts.length > 0) {
      const text = texts[0];
      const hasCode = text.includes('```') || text.includes('const ') || text.includes('function ') || text.includes('return ');
      const hasEdit = text.includes('edit') || text.includes('修改') || text.includes('修复');
      
      console.log(`    RunId: ${r.run_id.substring(0, 8)}...`);
      console.log(`    包含代码：${hasCode ? '✅' : '❌'}`);
      console.log(`    包含编辑：${hasEdit ? '✅' : '❌'}`);
      
      // 显示前 200 字符
      const preview = text.substring(0, 200).replace(/\n/g, ' ');
      console.log(`    Preview: ${preview}...`);
    }
  }
  console.log('');
});

// 查找包含代码的 output
console.log('🔍 查找包含代码块的 output:\n');

const codeOutputs = db.prepare(`
  SELECT * FROM requests 
  WHERE type = 'output' 
  ORDER BY timestamp DESC
  LIMIT 10
`).all();

if (codeOutputs.length === 0) {
  console.log('   没有找到包含代码块的 output\n');
} else {
  codeOutputs.forEach((r, idx) => {
    const usage = JSON.parse(r.usage_json || '{}');
    const time = new Date(r.timestamp).toLocaleTimeString('zh-CN');
    console.log(`[${idx+1}] ${time} | TaskId: ${r.task_id?.substring(0, 24)}... | Output: ${usage.output || 0}`);
    
    const texts = JSON.parse(r.assistant_texts || '[]');
    if (texts.length > 0) {
      // 提取代码块
      const codeBlocks = texts[0].match(/```[\s\S]*?```/g);
      if (codeBlocks) {
        console.log(`    代码块数量：${codeBlocks.length}`);
        codeBlocks.forEach((block, i) => {
          const firstLine = block.split('\n')[0];
          console.log(`    [${i+1}] ${firstLine.substring(0, 50)}...`);
        });
      }
    }
    console.log('');
  });
}

// 查找包含 edit 工具调用的记录
console.log('🔍 查找包含 edit 工具调用的任务:\n');

const editToolCalls = db.prepare(`
  SELECT * FROM tool_calls 
  WHERE tool_name = 'edit'
  ORDER BY timestamp DESC
  LIMIT 5
`).all();

if (editToolCalls.length === 0) {
  console.log('   没有找到 edit 工具调用\n');
} else {
  editToolCalls.forEach((t, idx) => {
    const time = new Date(t.timestamp).toLocaleTimeString('zh-CN');
    console.log(`[${idx+1}] ${time} | ${t.tool_name} | Duration: ${t.duration_ms || 'N/A'}ms`);
    console.log(`    RunId: ${t.run_id}`);
    if (t.params) {
      const params = JSON.parse(t.params_json || '{}');
      console.log(`    File: ${params.path || 'N/A'}`);
    }
    console.log('');
  });
}

db.close();
