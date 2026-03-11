/**
 * Tiktoken Accuracy Test
 * Compare tiktoken vs character-based estimation
 */

import { encoding_for_model } from 'tiktoken';

const testCases = [
  {
    name: '纯中文',
    text: '你好，我是一个人工智能助手。我可以帮你回答问题、写代码、分析数据等。'
  },
  {
    name: '纯英文',
    text: 'Hello, I am an AI assistant. I can help you with questions, coding, data analysis, etc.'
  },
  {
    name: '混合文本',
    text: '你好 Hello，这是一个测试 this is a test。'
  },
  {
    name: '代码',
    text: 'function add(a, b) { return a + b; }'
  },
  {
    name: '长文本',
    text: 'ContextScope 是一个强大的工具，可以帮你分析和可视化 API 请求、prompts、completions 和 token 使用情况。'
  },
  {
    name: 'Markdown',
    text: '## Title\n\nThis is **bold** and this is *italic*.\n\n- List item 1\n- List item 2'
  }
];

// Character-based estimation (old method)
function estimateTokensChar(text) {
  if (!text) return 0;
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.round(chineseChars / 1.5 + otherChars / 4);
}

// Tiktoken (accurate method)
function countTokensTiktoken(text) {
  const encoder = encoding_for_model('gpt-3.5-turbo');
  const tokens = encoder.encode(text);
  encoder.free();
  return tokens.length;
}

console.log('Tiktoken vs Character-based Estimation Comparison\n');
console.log('='.repeat(80));

testCases.forEach(({ name, text }) => {
  const tiktokenCount = countTokensTiktoken(text);
  const charEstimate = estimateTokensChar(text);
  const diff = charEstimate - tiktokenCount;
  const accuracy = 100 - (Math.abs(diff) / tiktokenCount * 100);
  
  console.log(`\n${name}`);
  console.log(`   Text: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);
  console.log(`   Tiktoken:        ${tiktokenCount} tokens ✅`);
  console.log(`   Char Estimate:   ${charEstimate} tokens`);
  console.log(`   Difference:      ${diff > 0 ? '+' : ''}${diff} (${accuracy.toFixed(1)}% accuracy)`);
});

console.log('\n' + '='.repeat(80));
console.log('\n✅ Tiktoken provides accurate token counts matching the actual tokenizer!');
