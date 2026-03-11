/**
 * Token Estimation Test Script
 * 
 * 测试 token 估算功能的准确性
 */

// 测试用例
const testCases = [
  {
    name: '纯中文',
    text: '你好，我是一个人工智能助手。我可以帮你回答问题、写代码、分析数据等。',
    expected: 25
  },
  {
    name: '纯英文',
    text: 'Hello, I am an AI assistant. I can help you with questions, coding, data analysis, etc.',
    expected: 20
  },
  {
    name: '混合文本',
    text: '你好 Hello，这是一个测试 this is a test。',
    expected: 15
  },
  {
    name: '代码',
    text: 'function add(a, b) { return a + b; }',
    expected: 10
  },
  {
    name: '长文本',
    text: 'ContextScope 是一个强大的工具，可以帮你分析和可视化 API 请求、prompts、completions 和 token 使用情况。它提供了实时的请求上下文可视化、token 消耗分析、上下文heatmap 等功能。',
    expected: 80
  }
];

// Token 估算函数
function estimateTokens(text) {
  if (!text) return 0;
  
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  
  return Math.round(chineseChars / 1.5 + otherChars / 4);
}

// 运行测试
console.log('Token Estimation Test Results\n');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

testCases.forEach(({ name, text, expected }) => {
  const actual = estimateTokens(text);
  const diff = Math.abs(actual - expected);
  const accuracy = 100 - (diff / expected * 100);
  const status = accuracy >= 70 ? '✅ PASS' : '⚠️  CLOSE';
  
  if (accuracy >= 70) passed++;
  else failed++;
  
  console.log(`\n${status} - ${name}`);
  console.log(`   Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
  console.log(`   Expected: ~${expected} tokens`);
  console.log(`   Actual:   ${actual} tokens`);
  console.log(`   Accuracy: ${accuracy.toFixed(1)}%`);
});

console.log('\n' + '='.repeat(60));
console.log(`\nSummary: ${passed} passed, ${failed} need review`);
console.log(`Overall Accuracy: ${((passed / testCases.length) * 100).toFixed(1)}%`);

// 测试完整上下文估算
console.log('\n\nFull Context Estimation Example\n');
console.log('='.repeat(60));

const mockData = {
  systemPrompt: '你是一个有帮助的 AI 助手，擅长编程和数据分析。',
  historyMessages: [
    { role: 'user', content: '帮我写一个排序函数' },
    { role: 'assistant', content: '好的，这是一个快速排序的实现：function quickSort(arr)...' }
  ],
  prompt: '现在添加一个二分查找函数',
  assistantTexts: ['好的，这是二分查找的实现：function binarySearch(arr, target)...']
};

let totalInput = 0;
let totalOutput = 0;

if (mockData.systemPrompt) {
  const tokens = estimateTokens(mockData.systemPrompt);
  totalInput += tokens;
  console.log(`System Prompt:    ${tokens} tokens`);
}

if (mockData.historyMessages) {
  const tokens = mockData.historyMessages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
  totalInput += tokens;
  console.log(`History Messages: ${tokens} tokens`);
}

if (mockData.prompt) {
  const tokens = estimateTokens(mockData.prompt);
  totalInput += tokens;
  console.log(`Current Prompt:   ${tokens} tokens`);
}

if (mockData.assistantTexts) {
  const tokens = estimateTokens(mockData.assistantTexts.join('\n'));
  totalOutput += tokens;
  console.log(`Assistant Output: ${tokens} tokens`);
}

console.log('\n' + '='.repeat(60));
console.log(`Total Input:  ${totalInput} tokens`);
console.log(`Total Output: ${totalOutput} tokens`);
console.log(`Total:        ${totalInput + totalOutput} tokens`);
