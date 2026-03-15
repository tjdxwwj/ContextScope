/**
 * Query by RunId Script
 * 
 * 根据 runId 查询所有相关记录
 * 用法：node query-by-runid.js <runId>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 实际存储路径是用户主目录，不是插件目录
const STORAGE_DIR = path.join(process.env.USERPROFILE, '.openclaw', 'contextscope');

const runId = process.argv[2];

if (!runId) {
  console.log('用法：node query-by-runid.js <runId>');
  console.log('示例：node query-by-runid.js dcdf4d8a-4d43-4401-a131-9a5e86372658');
  process.exit(1);
}

console.log(`🔍 查询 RunId: ${runId}`);
console.log(`📁 存储目录：${STORAGE_DIR}\n`);

// 读取 JSON 文件
function readJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

// 获取所有数据文件
function getAllDataFiles() {
  const files = [];
  
  const legacyFile = path.join(STORAGE_DIR, 'requests.json');
  if (fs.existsSync(legacyFile)) {
    files.push(legacyFile);
  }
  
  if (fs.existsSync(STORAGE_DIR)) {
    const datedFiles = fs.readdirSync(STORAGE_DIR)
      .filter(f => /^requests-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map(f => path.join(STORAGE_DIR, f));
    files.push(...datedFiles);
  }
  
  return files.sort();
}

const allDataFiles = getAllDataFiles();
console.log(`📄 扫描 ${allDataFiles.length} 个数据文件...\n`);

let foundInFile = null;
let inputData = null;
let outputData = null;
let relatedToolCalls = [];
let relatedSubagentLinks = [];

// 遍历所有文件查找
for (const file of allDataFiles) {
  const data = readJsonFile(file);
  if (!data) continue;
  
  // 查找 requests
  if (data.requests) {
    const inputReq = data.requests.find(r => r.runId === runId && r.type === 'input');
    const outputReq = data.requests.find(r => r.runId === runId && r.type === 'output');
    
    if (inputReq || outputReq) {
      foundInFile = path.basename(file);
      inputData = inputReq;
      outputData = outputReq;
      
      console.log(`✅ 在 ${foundInFile} 中找到记录:\n`);
      
      if (inputReq) {
        console.log('📤 INPUT:');
        console.log(`   RunId: ${inputReq.runId}`);
        console.log(`   SessionId: ${inputReq.sessionId}`);
        console.log(`   Provider: ${inputReq.provider}`);
        console.log(`   Model: ${inputReq.model}`);
        console.log(`   Timestamp: ${new Date(inputReq.timestamp).toLocaleString('zh-CN')}`);
        console.log(`   Input Tokens: ${inputReq.usage?.input || 0}`);
        console.log(`   TaskId: ${inputReq.taskId || 'N/A'}`);
        if (inputReq.prompt) {
          const promptPreview = inputReq.prompt.substring(0, 200);
          console.log(`   Prompt: ${promptPreview}${inputReq.prompt.length > 200 ? '...' : ''}`);
        }
        console.log('');
      }
      
      if (outputReq) {
        console.log('📥 OUTPUT:');
        console.log(`   RunId: ${outputReq.runId}`);
        console.log(`   SessionId: ${outputReq.sessionId}`);
        console.log(`   Provider: ${outputReq.provider}`);
        console.log(`   Model: ${outputReq.model}`);
        console.log(`   Timestamp: ${new Date(outputReq.timestamp).toLocaleString('zh-CN')}`);
        console.log(`   Output Tokens: ${outputReq.usage?.output || 0}`);
        console.log(`   Input Tokens: ${outputReq.usage?.input || 0}`);
        console.log(`   Total Tokens: ${outputReq.usage?.total || 0}`);
        if (outputReq.assistantTexts?.length > 0) {
          const textPreview = outputReq.assistantTexts[0].substring(0, 200);
          console.log(`   Assistant Text: ${textPreview}${outputReq.assistantTexts[0].length > 200 ? '...' : ''}`);
        }
        console.log('');
      }
      
      // 查找相关的 toolCalls
      if (data.toolCalls && inputData?.sessionId) {
        relatedToolCalls = data.toolCalls.filter(t => t.sessionId === inputData.sessionId);
        if (relatedToolCalls.length > 0) {
          console.log(`🛠️  关联的 ${relatedToolCalls.length} 条 ToolCall 记录:`);
          relatedToolCalls.forEach((t, idx) => {
            const duration = t.durationMs ? `${t.durationMs}ms` : 'N/A';
            console.log(`   [${idx+1}] ${t.toolName} | ${duration} | ${new Date(t.timestamp).toLocaleTimeString('zh-CN')}`);
          });
          console.log('');
        }
      }
      
      // 查找相关的 subagentLinks
      if (data.subagentLinks && inputData?.sessionId) {
        relatedSubagentLinks = data.subagentLinks.filter(l => l.parentSessionId === inputData.sessionId);
        if (relatedSubagentLinks.length > 0) {
          console.log(`🔗 关联的 ${relatedSubagentLinks.length} 条 SubagentLink 记录:`);
          relatedSubagentLinks.forEach((l, idx) => {
            console.log(`   [${idx+1}] ${l.kind||'spawn'} | Child: ${l.childSessionKey||'N/A'} | Runtime: ${l.runtime||'N/A'}`);
          });
          console.log('');
        }
      }
    }
  }
}

console.log('═══════════════════════════════════════════════════════════');
console.log('📊 汇总');
console.log('═══════════════════════════════════════════════════════════');

if (!inputData && !outputData) {
  console.log(`❌ 未找到 RunId: ${runId}`);
  console.log('\n可能的原因:');
  console.log('   1. RunId 不正确');
  console.log('   2. 数据已被清理');
  console.log('   3. ContextScope 插件未记录该次请求');
  console.log('   4. 存储文件不存在');
  
  // 显示最近的 runIds
  console.log('\n📋 数据库中最近的 RunIds:');
  for (const file of allDataFiles) {
    const data = readJsonFile(file);
    if (data?.requests?.length > 0) {
      console.log(`\n   文件：${path.basename(file)}`);
      data.requests.slice(0, 5).forEach((r, idx) => {
        console.log(`      [${idx+1}] ${r.runId} (${r.type}) @ ${new Date(r.timestamp).toLocaleString('zh-CN')}`);
      });
    }
  }
} else {
  const sessionId = inputData?.sessionId || outputData?.sessionId;
  const taskId = inputData?.taskId || outputData?.taskId;
  
  console.log(`SessionId: ${sessionId || 'N/A'}`);
  console.log(`TaskId: ${taskId || 'N/A'}`);
  console.log('');
  
  const inputTokens = inputData?.usage?.input || 0;
  const outputTokens = outputData?.usage?.output || 0;
  const totalTokens = inputTokens + outputTokens;
  
  console.log('Token 统计:');
  console.log(`   Input:  ${inputTokens.toLocaleString()}`);
  console.log(`   Output: ${outputTokens.toLocaleString()}`);
  console.log(`   Total:  ${totalTokens.toLocaleString()}`);
  console.log('');
  
  // Output 合理性检查
  console.log('🔍 Output Token 合理性:');
  if (outputTokens === 0) {
    console.log(`   ❌ Output 为 0！说明 llm_output hook 没有正确记录。`);
  } else if (outputTokens < 100) {
    console.log(`   ⚠️  Output 偏低 (${outputTokens} tokens)`);
  } else if (outputTokens > 50000) {
    console.log(`   ⚠️  Output 偏高 (${outputTokens} tokens)`);
  } else {
    console.log(`   ✅ Output 在合理范围内 (${outputTokens} tokens)`);
  }
  
  // 时间差
  if (inputData && outputData) {
    const timeDiff = outputData.timestamp - inputData.timestamp;
    console.log('');
    console.log('响应时间:');
    console.log(`   ${timeDiff}ms (${(timeDiff/1000).toFixed(2)}s)`);
  }
}

console.log('═══════════════════════════════════════════════════════════');
