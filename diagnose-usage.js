/**
 * Diagnose Usage Data in OpenClaw Sessions
 * 
 * 检查 OpenClaw session 文件中的 usage 数据
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SESSIONS_DIR = path.join(process.env.USERPROFILE, '.openclaw', 'agents', 'main', 'sessions');

console.log('🔍 诊断 OpenClaw Session Usage 数据\n');
console.log(`📁 Sessions 目录：${SESSIONS_DIR}\n`);

// 读取最新的 session 文件
const sessionFiles = fs.readdirSync(SESSIONS_DIR)
  .filter(f => f.endsWith('.jsonl'))
  .map(f => ({
    name: f,
    path: path.join(SESSIONS_DIR, f),
    stat: fs.statSync(path.join(SESSIONS_DIR, f))
  }))
  .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

console.log(`找到 ${sessionFiles.length} 个 session 文件:\n`);
sessionFiles.slice(0, 5).forEach((f, idx) => {
  console.log(`   [${idx+1}] ${f.name}`);
  console.log(`       大小：${(f.stat.size / 1024).toFixed(1)} KB | 修改时间：${new Date(f.stat.mtime).toLocaleString('zh-CN')}`);
});
console.log('');

// 分析最新的 session 文件
const latestSession = sessionFiles[0];
if (!latestSession) {
  console.log('❌ 没有找到 session 文件');
  process.exit(1);
}

console.log(`📋 分析最新 Session: ${latestSession.name}\n`);

const content = fs.readFileSync(latestSession.path, 'utf-8');
const lines = content.split('\n').filter(line => line.trim());

let totalMessages = 0;
let assistantMessages = 0;
let toolCalls = 0;
let usageData = [];

for (const line of lines) {
  try {
    const msg = JSON.parse(line);
    totalMessages++;
    
    if (msg.type === 'message' && msg.message?.role === 'assistant') {
      assistantMessages++;
      
      if (msg.api && msg.usage) {
        const usage = msg.usage;
        usageData.push({
          runId: msg.id,
          model: msg.model,
          provider: msg.provider,
          input: usage.input || 0,
          output: usage.output || 0,
          totalTokens: usage.totalTokens || 0,
          timestamp: msg.timestamp
        });
      }
    }
    
    if (msg.type === 'message' && msg.message?.role === 'toolResult') {
      toolCalls++;
    }
  } catch (e) {
    // Ignore parse errors
  }
}

console.log(`📊 Session 统计:`);
console.log(`   总消息数：${totalMessages}`);
console.log(`   Assistant 消息：${assistantMessages}`);
console.log(`   Tool 调用：${toolCalls}`);
console.log(`   有 Usage 的消息：${usageData.length}\n`);

if (usageData.length > 0) {
  console.log('📈 Usage 数据采样 (最近 10 条):\n');
  
  const recentUsage = usageData.slice(-10).reverse();
  let totalInput = 0;
  let totalOutput = 0;
  
  recentUsage.forEach((u, idx) => {
    const time = new Date(u.timestamp).toLocaleTimeString('zh-CN');
    const hasUsage = u.input > 0 || u.output > 0;
    const icon = hasUsage ? '✅' : '❌';
    
    console.log(`   [${idx+1}] ${icon} ${time} | ${u.model}`);
    console.log(`       Input: ${u.input.toString().padStart(6)} | Output: ${u.output.toString().padStart(6)} | Total: ${u.totalTokens.toString().padStart(6)}`);
    
    totalInput += u.input;
    totalOutput += u.output;
  });
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 汇总');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`采样中 Input 总计：${totalInput.toLocaleString()} tokens`);
  console.log(`采样中 Output 总计：${totalOutput.toLocaleString()} tokens`);
  console.log('');
  
  // 检查有多少条 usage 为 0
  const zeroUsage = usageData.filter(u => u.input === 0 && u.output === 0).length;
  const nonZeroUsage = usageData.filter(u => u.input > 0 || u.output > 0).length;
  
  console.log(`Usage 为 0 的消息：${zeroUsage} 条 (${(zeroUsage / usageData.length * 100).toFixed(1)}%)`);
  console.log(`Usage 非 0 的消息：${nonZeroUsage} 条 (${(nonZeroUsage / usageData.length * 100).toFixed(1)}%)`);
  
  if (zeroUsage > 0) {
    console.log('\n⚠️  警告：发现 usage 为 0 的消息！');
    console.log('   这说明 OpenClaw 可能没有正确传递 usage 数据给插件。');
    console.log('   这会导致 ContextScope 插件记录的 output token 数为 0。');
  }
} else {
  console.log('❌ 没有找到任何 usage 数据');
}

console.log('═══════════════════════════════════════════════════════════');
