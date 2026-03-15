/**
 * Check raw usage data in session file
 */

import fs from 'node:fs';
import path from 'node:path';

const SESSION_FILE = 'C:\\Users\\10906\\.openclaw\\agents\\main\\sessions\\e93b19e5-be16-4e50-8af5-4588d55c4c30.jsonl';

console.log(`📋 检查 Session: ${path.basename(SESSION_FILE)}\n`);

const content = fs.readFileSync(SESSION_FILE, 'utf-8');
const lines = content.split('\n').filter(line => line.trim());

let foundUsage = false;

for (let i = 0; i < lines.length && !foundUsage; i++) {
  try {
    const msg = JSON.parse(lines[i]);
    
    if (msg.type === 'message' && msg.message?.role === 'assistant' && msg.usage) {
      console.log(`✅ 找到 usage 数据 (line ${i + 1}):\n`);
      console.log(JSON.stringify({
        id: msg.id,
        model: msg.model,
        provider: msg.provider,
        usage: msg.usage,
        timestamp: msg.timestamp
      }, null, 2));
      foundUsage = true;
    }
  } catch (e) {
    // Ignore
  }
}

if (!foundUsage) {
  console.log('❌ 没有找到任何带 usage 的 assistant 消息\n');
  
  // 显示一条 assistant 消息的结构
  console.log('📋 示例 Assistant 消息结构:\n');
  for (let i = 0; i < lines.length; i++) {
    try {
      const msg = JSON.parse(lines[i]);
      if (msg.type === 'message' && msg.message?.role === 'assistant') {
        console.log(JSON.stringify({
          id: msg.id,
          type: msg.type,
          message_role: msg.message?.role,
          has_content: !!msg.message?.content,
          content_length: msg.message?.content?.length,
          api: msg.api,
          provider: msg.provider,
          model: msg.model,
          has_usage: !!msg.usage,
          usage: msg.usage,
          stopReason: msg.stopReason,
          timestamp: msg.timestamp
        }, null, 2));
        break;
      }
    } catch (e) {
      // Ignore
    }
  }
}
