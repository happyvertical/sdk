/**
 * SMRT Template Server
 * 
 * Demonstrates auto-generated REST API from SMRT objects.
 * No manual route definitions needed - everything is generated from @smrt() decorated classes.
 */

import { createSmrtServer } from '@have/smrt';
import setupRoutes from '@smrt/routes'; // Virtual module from Vite plugin
import { manifest } from '@smrt/manifest'; // Virtual module from Vite plugin

async function startServer() {
  console.log('🚀 Starting SMRT Template Server...');
  
  // Create server instance
  const server = createSmrtServer({
    port: 3000,
    hostname: 'localhost',
    basePath: '/api/v1',
    cors: true
  });

  // Setup auto-generated routes from SMRT objects
  setupRoutes(server);

  // Log discovered objects
  const objectCount = Object.keys(manifest.objects).length;
  const objectNames = Object.keys(manifest.objects).join(', ');
  console.log(`📊 Discovered ${objectCount} SMRT objects: ${objectNames}`);

  // Start the server
  const { url } = await server.start();
  
  console.log('✅ Server ready!');
  console.log(`📡 REST API: ${url}/api/v1`);
  console.log(`📚 Endpoints:`);
  
  // Log available endpoints for each object
  Object.entries(manifest.objects).forEach(([name, obj]) => {
    const { collection } = obj;
    console.log(`   GET    ${url}/api/v1/${collection} - List ${collection}`);
    console.log(`   POST   ${url}/api/v1/${collection} - Create ${name}`);
    console.log(`   GET    ${url}/api/v1/${collection}/:id - Get ${name}`);
    console.log(`   PUT    ${url}/api/v1/${collection}/:id - Update ${name}`);
    
    const config = obj.decoratorConfig;
    if (!config.api?.exclude?.includes('delete')) {
      console.log(`   DELETE ${url}/api/v1/${collection}/:id - Delete ${name}`);
    }
  });

  console.log('\n💡 Try these endpoints:');
  console.log(`   curl ${url}/api/v1/products`);
  console.log(`   curl ${url}/api/v1/categories`);
  console.log(`   curl -X POST ${url}/api/v1/products -H "Content-Type: application/json" -d '{"name":"Test Product","price":29.99}'`);

  return server;
}

// Start if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(console.error);
}

export { startServer };