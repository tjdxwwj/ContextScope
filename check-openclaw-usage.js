/**
 * Check if OpenClaw session has usage data
 */

import fs from 'node:fs';
import path from 'node:path';

const SESSIONS_DIR = path.join(process.env.USERPROFILE, '.openclaw', 'agents', 'main', 'sessions');

console.log('🔍 检查 OpenClaw Session Usage 数据\n');

// 读取最新的 session 文件
const sessionFiles = fs.readdirSync(SESSIONS_DIR)
  .filter(f => f.endsWith('.jsonl'))
  .map(f => ({ name: f, path: path.join(SESSIONS_DIR, f), stat: fs.statSync(path.join(SESSIONS_DIR, f)) }))
  .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

const latestSession = sessionFiles[0];
if (!latestSession) {
  console.log('❌ 没有找到 session 文件');
  process.exit(1);
}

console.log(`📄 分析 Session: ${latestSession.name}\n`);

const content = fs.readFileSync(latestSession.path, 'utf-8');
const lines = content.split('\n').filter(line => line.trim());

let assistantCount = 0;
let withUsage = 0;
let withoutUsage = 0;

for (const line of lines) {
  try {
    const msg = JSON.parse(line);
    
    if (msg.type === 'message' && msg.message?.role === 'assistant') {
      assistantCount++;
      
      if (msg.usage && (msg.usage.output > 0 || msg.usage.totalTokens > 0)) {
        withUsage++;
        if (withUsage <= 3) {
          console.log(`✅ 有 usage 的消息:`);
          console.log(`   Model: ${msg.model}`);
          console.log(`   Usage:`, JSON.stringify(msg.usage));
          console.log('');
        }
      } else {
        withoutUsage++;
      }
    }
  } catch (e) {
    // Ignore
  }
}

console.log('═══════════════════════════════════════════════════════════');
console.log('📊 统计');
console.log('═══════════════════════════════════════════════════════════');
console.log(`Assistant 消息总数：${assistantCount}`);
console.log(`有 usage 数据：${withUsage}`);
console.log(`没有 usage 数据：${withoutUsage}`);

if (withoutUsage > 0) {
  console.log('\n⚠️  警告：大部分消息没有 usage 数据！');
  console.log('   这说明 OpenClaw 没有在 llm_output hook 中传递 usage。');
  console.log('   需要检查 OpenClaw 配置或模型提供商是否返回 usage。');
}
