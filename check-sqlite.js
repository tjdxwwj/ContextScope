/**
 * Check if SQLite is enabled and has data
 */

import fs from 'node:fs';
import path from 'node:path';

const STORAGE_DIR = path.join(process.env.USERPROFILE, '.openclaw', 'contextscope');

console.log('🔍 检查 ContextScope 存储状态\n');

const files = fs.readdirSync(STORAGE_DIR)
  .filter(f => /^requests-.*\.json$/.test(f) || /\.db$/.test(f))
  .map(f => ({
    name: f,
    path: path.join(STORAGE_DIR, f),
    stat: fs.statSync(path.join(STORAGE_DIR, f))
  }))
  .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

console.log(`📁 存储目录：${STORAGE_DIR}\n`);
console.log('文件列表:');
files.forEach(f => {
  console.log(`   ${f.name.padEnd(30)} ${(f.stat.size / 1024).toFixed(1)} KB`);
});

const dbFile = files.find(f => f.name.endsWith('.db'));
if (dbFile) {
  console.log(`\n✅ SQLite 数据库存在：${dbFile.name}`);
  console.log('   说明 SQLite 已启用，数据存储在数据库中。');
} else {
  console.log('\n❌ SQLite 数据库不存在');
  console.log('   说明 SQLite 未启用，数据存储在 JSON 文件中。');
}

// 检查最新的 JSON 文件中的 output 记录
const jsonFiles = files.filter(f => /^requests-\d{4}-\d{2}-\d{2}\.json$/.test(f));
if (jsonFiles.length > 0) {
  const latestJson = jsonFiles[0];
  const data = JSON.parse(fs.readFileSync(latestJson.path, 'utf-8'));
  
  const outputReqs = data.requests.filter(r => r.type === 'output').slice(0, 5);
  
  console.log(`\n📄 最新 JSON 文件：${latestJson.name}`);
  console.log(`   总请求数：${data.requests.length}`);
  console.log(`   Output 请求数：${data.requests.filter(r => r.type === 'output').length}`);
  
  if (outputReqs.length > 0) {
    console.log('\n最近的 Output 记录:');
    outputReqs.forEach((r, idx) => {
      console.log(`   [${idx+1}] TaskId: ${r.taskId || '❌ N/A'} | Output: ${r.usage?.output || 0}`);
    });
  }
}
