/**
 * Check if output content is truncated
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const DB_FILE = path.join(process.env.USERPROFILE || '', '.openclaw', 'contextscope', 'contextscope.db');

const db = new DatabaseSync(DB_FILE);

// 检查 19:01:05 的 output
const output = db.prepare(`
  SELECT run_id, task_id, usage_json, assistant_texts, length(assistant_texts) as text_length
  FROM requests 
  WHERE run_id = '580a7b61-1627-4bae-9fc2-449a706516e9'
    AND type = 'output'
`).get();

if (output) {
  console.log('📝 Output 内容检查\n');
  console.log(`RunId: ${output.run_id}`);
  console.log(`TaskId: ${output.task_id}`);
  
  const usage = JSON.parse(output.usage_json || '{}');
  console.log(`Output Tokens: ${usage.output || 0}`);
  console.log(`assistant_texts 长度：${output.text_length} 字符\n`);
  
  // 计算 token 估算
  const estimatedTokens = Math.round(output.text_length / 4); // 粗略估算
  console.log(`估算 Tokens: ~${estimatedTokens} (按 4 字符=1 token)`);
  console.log(`实际 Tokens: ${usage.output}`);
  console.log(`差异：${usage.output - estimatedTokens} tokens\n`);
  
  if (output.text_length < 100 && usage.output > 500) {
    console.log('❌ 内容严重丢失！');
    console.log('   assistant_texts 太短，与 output tokens 不匹配\n');
  }
  
  if (output.assistant_texts) {
    try {
      const texts = JSON.parse(output.assistant_texts || '[]');
      console.log(`解析后的数组长度：${texts.length}`);
      if (texts.length > 0) {
        console.log(`第一个元素长度：${texts[0].length} 字符`);
        console.log('\n完整内容:');
        console.log('='.repeat(60));
        console.log(texts[0]);
        console.log('='.repeat(60));
      }
    } catch (e) {
      console.log(`❌ JSON 解析失败：${e.message}`);
      console.log(`原始内容：${output.assistant_texts}`);
    }
  }
} else {
  console.log('❌ 未找到 output 记录');
}

// 检查 edit 工具的 params
console.log('\n═══════════════════════════════════════════════════════════\n');
console.log('🛠️  检查 Edit 工具的 params:\n');

const edits = db.prepare(`
  SELECT run_id, tool_name, params_json, length(params_json) as params_length
  FROM tool_calls 
  WHERE tool_name = 'edit'
    AND run_id = '580a7b61-1627-4bae-9fc2-449a706516e9'
  ORDER BY timestamp
`).all();

edits.forEach((e, idx) => {
  console.log(`[${idx+1}] Edit 工具:`);
  console.log(`    params 长度：${e.params_length} 字符`);
  
  if (e.params_json) {
    const params = JSON.parse(e.params_json || '{}');
    if (params.newText) {
      console.log(`    newText 长度：${params.newText.length} 字符`);
      console.log(`    估算 tokens: ~${Math.round(params.newText.length / 4)}`);
      
      // 显示前 200 字符
      console.log(`    Preview: ${params.newText.substring(0, 200).replace(/\n/g, ' ')}...`);
    }
  }
  console.log('');
});

db.close();
