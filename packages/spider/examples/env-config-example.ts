/**
 * Example: Using environment variables for spider configuration
 *
 * This example demonstrates how to configure the spider package using
 * environment variables following the HAVE_SPIDER_* pattern.
 */

import { getSpider } from '../src/index';

/**
 * Example 1: Using environment variables
 */
async function exampleWithEnvVars() {
  console.log('\n=== Example 1: Environment Variable Configuration ===\n');

  // Set environment variables
  process.env.HAVE_SPIDER_TIMEOUT = '60000'; // 60 seconds
  process.env.HAVE_SPIDER_USER_AGENT = 'ExampleBot/1.0 (+https://example.com/bot)';
  process.env.HAVE_SPIDER_MAX_REQUESTS = '50';

  // Create spider (uses env vars automatically)
  const spider = await getSpider({ adapter: 'simple' });

  console.log('Environment variables set:');
  console.log('  HAVE_SPIDER_TIMEOUT:', process.env.HAVE_SPIDER_TIMEOUT);
  console.log('  HAVE_SPIDER_USER_AGENT:', process.env.HAVE_SPIDER_USER_AGENT);
  console.log('  HAVE_SPIDER_MAX_REQUESTS:', process.env.HAVE_SPIDER_MAX_REQUESTS);
  console.log('\nSpider will use these values when fetching pages.');

  // Clean up for next example
  delete process.env.HAVE_SPIDER_TIMEOUT;
  delete process.env.HAVE_SPIDER_USER_AGENT;
  delete process.env.HAVE_SPIDER_MAX_REQUESTS;
}

/**
 * Example 2: User options override environment variables
 */
async function exampleWithUserOverride() {
  console.log('\n=== Example 2: User Options Override Env Vars ===\n');

  // Set environment variable
  process.env.HAVE_SPIDER_TIMEOUT = '30000'; // 30 seconds

  const spider = await getSpider({ adapter: 'simple' });

  console.log('Environment variable:');
  console.log('  HAVE_SPIDER_TIMEOUT:', process.env.HAVE_SPIDER_TIMEOUT, 'ms');
  console.log('\nUser option will override this when specified in fetch options.');

  // Clean up
  delete process.env.HAVE_SPIDER_TIMEOUT;
}

/**
 * Example 3: Different adapters with environment configuration
 */
async function exampleWithDifferentAdapters() {
  console.log('\n=== Example 3: Different Adapters with Env Config ===\n');

  // Set common environment variables
  process.env.HAVE_SPIDER_TIMEOUT = '45000';
  process.env.HAVE_SPIDER_USER_AGENT = 'MultiBot/1.0';

  // Create different adapters - all will use the same env vars
  const simpleSpider = await getSpider({ adapter: 'simple' });
  const domSpider = await getSpider({ adapter: 'dom' });
  const crawleeSpider = await getSpider({
    adapter: 'crawlee',
    headless: true,
  });

  console.log('Created three different adapters:');
  console.log('  1. Simple adapter');
  console.log('  2. DOM adapter');
  console.log('  3. Crawlee adapter (headless)');
  console.log('\nAll adapters will use:');
  console.log('  - Timeout: 45000ms (from HAVE_SPIDER_TIMEOUT)');
  console.log('  - User Agent: MultiBot/1.0 (from HAVE_SPIDER_USER_AGENT)');

  // Clean up
  delete process.env.HAVE_SPIDER_TIMEOUT;
  delete process.env.HAVE_SPIDER_USER_AGENT;
}

/**
 * Example 4: Production vs Development configuration
 */
async function exampleProductionVsDevelopment() {
  console.log('\n=== Example 4: Production vs Development Config ===\n');

  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    // Production: Use longer timeouts, custom user agent
    process.env.HAVE_SPIDER_TIMEOUT = '120000'; // 2 minutes
    process.env.HAVE_SPIDER_USER_AGENT = 'ProductionBot/1.0 (+https://mysite.com/bot)';
    process.env.HAVE_SPIDER_MAX_REQUESTS = '100';

    console.log('Production environment detected:');
  } else {
    // Development: Use shorter timeouts for faster feedback
    process.env.HAVE_SPIDER_TIMEOUT = '15000'; // 15 seconds
    process.env.HAVE_SPIDER_USER_AGENT = 'DevBot/1.0';
    process.env.HAVE_SPIDER_MAX_REQUESTS = '10';

    console.log('Development environment detected:');
  }

  console.log('  Timeout:', process.env.HAVE_SPIDER_TIMEOUT, 'ms');
  console.log('  User Agent:', process.env.HAVE_SPIDER_USER_AGENT);
  console.log('  Max Requests:', process.env.HAVE_SPIDER_MAX_REQUESTS);

  const spider = await getSpider({ adapter: 'simple' });
  console.log('\nSpider configured with environment-specific settings.');

  // Clean up
  delete process.env.HAVE_SPIDER_TIMEOUT;
  delete process.env.HAVE_SPIDER_USER_AGENT;
  delete process.env.HAVE_SPIDER_MAX_REQUESTS;
}

/**
 * Example 5: Docker/Container deployment with env vars
 */
async function exampleDockerDeployment() {
  console.log('\n=== Example 5: Docker/Container Deployment ===\n');

  console.log('In a Dockerfile or docker-compose.yml, set:');
  console.log('');
  console.log('  environment:');
  console.log('    - HAVE_SPIDER_TIMEOUT=60000');
  console.log('    - HAVE_SPIDER_USER_AGENT=ContainerBot/1.0');
  console.log('    - HAVE_SPIDER_MAX_REQUESTS=200');
  console.log('');
  console.log('Then your application code can simply:');
  console.log('');
  console.log("  const spider = await getSpider({ adapter: 'simple' });");
  console.log('  await spider.fetch(url);');
  console.log('');
  console.log('And it will automatically use the container env vars!');
}

/**
 * Run all examples
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  @have/spider Environment Variable Configuration     ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  await exampleWithEnvVars();
  await exampleWithUserOverride();
  await exampleWithDifferentAdapters();
  await exampleProductionVsDevelopment();
  await exampleDockerDeployment();

  console.log('\n=== Examples Complete ===\n');
  console.log('Key Takeaways:');
  console.log('  1. Set HAVE_SPIDER_* env vars to configure globally');
  console.log('  2. User options always override env vars');
  console.log('  3. All adapters (simple, dom, crawlee) support env vars');
  console.log('  4. Perfect for production/container deployments');
  console.log('  5. Type-safe with automatic type conversion\n');
}

// Run examples
main().catch(console.error);
