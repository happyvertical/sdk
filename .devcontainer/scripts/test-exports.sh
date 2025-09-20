#!/bin/bash
set -e

echo "🔬 Testing export resolution in CI environment..."

# Create a test script to check exports
cat > /tmp/test-exports.js << 'EOF'
console.log('Testing @have/sql exports...');

try {
  // Check if the built files exist
  const fs = require('fs');
  const path = '/home/runner/work/sdk/sdk/packages/sql/dist/index.d.ts';

  if (fs.existsSync(path)) {
    console.log('✅ index.d.ts exists');
    const content = fs.readFileSync(path, 'utf8');
    console.log('📄 File content preview:');
    console.log(content.substring(0, 500) + '...');

    // Check for getDatabase export
    if (content.includes('export declare function getDatabase')) {
      console.log('✅ getDatabase export found in .d.ts');
    } else {
      console.log('❌ getDatabase export NOT found in .d.ts');
    }
  } else {
    console.log('❌ index.d.ts does not exist');
  }

  // Try to require the module
  const sql = require('@have/sql');
  console.log('✅ @have/sql module loaded successfully');
  console.log('📦 Available exports:', Object.keys(sql));

  if (sql.getDatabase) {
    console.log('✅ getDatabase function is available');
  } else {
    console.log('❌ getDatabase function is NOT available');
  }

} catch (error) {
  console.log('❌ Error:', error.message);
  console.log('Stack:', error.stack);
}
EOF

# Run the test in CI environment
echo "Running export test in CI environment..."
act -j test --step "Build packages" \
  --env NODE_PATH=/home/runner/work/sdk/sdk/node_modules \
  --bind \
  --shell \
  -- bash -c "cd /home/runner/work/sdk/sdk && node /tmp/test-exports.js"

echo "✅ Export test complete."