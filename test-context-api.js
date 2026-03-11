/**
 * Test script for Context API
 * Tests the new /api/context endpoint
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Read package.json to get project info
const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf-8'));
console.log(`\n📦 ${pkg.name} v${pkg.version} - Context API Test\n`);

// Check if dist files exist
try {
  const serviceFile = await readFile(new URL('./dist/src/service.js', import.meta.url), 'utf-8');
  
  // Check if getContextDistribution method exists
  if (serviceFile.includes('getContextDistribution')) {
    console.log('✅ Service: getContextDistribution method found');
  } else {
    console.log('❌ Service: getContextDistribution method NOT found');
  }
  
  // Check if TokenDistribution interface exists
  if (serviceFile.includes('TokenDistribution')) {
    console.log('✅ Service: TokenDistribution interface found');
  } else {
    console.log('❌ Service: TokenDistribution interface NOT found');
  }
  
  // Check if calculateTokenDistribution method exists
  if (serviceFile.includes('calculateTokenDistribution')) {
    console.log('✅ Service: calculateTokenDistribution method found');
  } else {
    console.log('❌ Service: calculateTokenDistribution method NOT found');
  }
  
} catch (error) {
  console.log('❌ Failed to read dist/service.js:', error.message);
}

try {
  const handlerFile = await readFile(new URL('./dist/src/web/handler.js', import.meta.url), 'utf-8');
  
  // Check if handleContext function exists
  if (handlerFile.includes('handleContext')) {
    console.log('✅ Handler: handleContext function found');
  } else {
    console.log('❌ Handler: handleContext function NOT found');
  }
  
  // Check if /api/context route is registered
  if (handlerFile.includes('/api/context')) {
    console.log('✅ Handler: /api/context route registered');
  } else {
    console.log('❌ Handler: /api/context route NOT registered');
  }
  
} catch (error) {
  console.log('❌ Failed to read dist/web/handler.js:', error.message);
}

console.log('\n✅ Build verification complete!\n');

console.log('📝 Next steps:');
console.log('1. Start OpenClaw with the plugin enabled');
console.log('2. Make some API calls to generate data');
console.log('3. Test the API:');
console.log('   curl "http://localhost:18789/plugins/contextscope/api/context?runId=<your-run-id>"');
console.log('');
