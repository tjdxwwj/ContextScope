/**
 * Check detailed frontend fix task
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_FILE = path.join(process.env.USERPROFILE || '', '.openclaw', 'contextscope', 'contextscope.db');

console.log('🔍 详细检查前端修复任务 (18:58-19:05)\n');

const db = new DatabaseSync(DB_FILE);

// 查找该时间段的所有 output
console.log('📝 该时间段的所有 Output:\n');

const outputs = db.prepare(`
  SELECT * FROM requests 
  WHERE type = 'output' 
    AND timestamp >= 1773572280000
    AND timestamp <= 1773572700000
  ORDER BY timestamp
`).all();

outputs.forEach((r, idx) => {
  const usage = JSON.parse(r.usage_json || '{}');
  const time = new Date(r.timestamp).toLocaleTimeString('zh-CN');
  console.log(`[${idx+1}] ${time} | Output: ${usage.output || 0} tokens`);
  console.log(`    TaskId: ${r.task_id}`);
  console.log(`    RunId: ${r.run_id}`);
  
  if (r.assistant_texts) {
    const texts = JSON.parse(r.assistant_texts || '[]');
    if (texts.length > 0) {
      const text = texts[0];
      // 检查是否包含代码修改说明
      const hasCode = text.includes('```') || text.includes('edit') || text.includes('修改');
      const hasPricing = text.includes('Pricing') || text.includes('价格') || text.includes('缓存');
      
      console.log(`    包含代码：${hasCode ? '✅' : '❌'}`);
      console.log(`    包含价格相关：${hasPricing ? '✅' : '❌'}`);
      
      // 显示前 300 字符
      const preview = text.substring(0, 300).replace(/\n/g, ' ');
      console.log(`    Preview: ${preview}...`);
    }
  }
  console.log('');
});

// 查找该时间段的 edit 工具调用
console.log('🛠️  该时间段的 Edit 工具调用:\n');

const edits = db.prepare(`
  SELECT * FROM tool_calls 
  WHERE tool_name = 'edit'
    AND timestamp >= 1773572280000
    AND timestamp <= 1773572700000
  ORDER BY timestamp
`).all();

edits.forEach((t, idx) => {
  const time = new Date(t.timestamp).toLocaleTimeString('zh-CN');
  console.log(`[${idx+1}] ${time} | Duration: ${t.duration_ms || 'N/A'}ms`);
  console.log(`    RunId: ${t.run_id}`);
  
  if (t.params_json) {
    const params = JSON.parse(t.params_json || '{}');
    console.log(`    File: ${params.path || 'N/A'}`);
    if (params.oldText) {
      const oldPreview = params.oldText.substring(0, 100).replace(/\n/g, ' ');
      console.log(`    OldText Preview: ${oldPreview}...`);
    }
    if (params.newText) {
      const newPreview = params.newText.substring(0, 100).replace(/\n/g, ' ');
      console.log(`    NewText Preview: ${newPreview}...`);
    }
  }
  console.log('');
});

db.close();
