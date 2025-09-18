/**
 * Main browser entry point demonstrating auto-generated virtual modules
 */

import { manifest } from '@smrt/manifest';
import createClient from '@smrt/client';
import { tools } from '@smrt/mcp';

// Display discovered objects
function displayManifest() {
  const output = document.getElementById('manifest-output');
  if (!output) return;
  
  const objectsList = Object.entries(manifest.objects).map(([name, obj]) => ({
    name: obj.className,
    collection: obj.collection,
    fields: Object.keys(obj.fields),
    methods: Object.keys(obj.methods),
    config: obj.decoratorConfig
  }));
  
  output.innerHTML = '<div class="status success">Found ' + objectsList.length + ' SMRT objects at build time</div><pre>' + JSON.stringify(objectsList, null, 2) + '</pre>';
}

// Display MCP tools
function displayMCPTools() {
  const output = document.getElementById('mcp-output');
  if (!output) return;
  
  output.innerHTML = '<div class="status success">Generated ' + tools.length + ' MCP tools for AI integration</div><pre>' + JSON.stringify(tools, null, 2) + '</pre>';
}

// Display available routes info
function displayRoutes() {
  const output = document.getElementById('routes-output');
  if (!output) return;
  
  const routes = [];
  for (const [name, obj] of Object.entries(manifest.objects)) {
    const config = obj.decoratorConfig.api;
    const exclude = (typeof config === 'object' && config?.exclude) || [];
    
    routes.push({
      collection: obj.collection,
      endpoints: [
        'GET /' + obj.collection,
        'POST /' + obj.collection,
        'GET /' + obj.collection + '/:id',
        'PUT /' + obj.collection + '/:id',
        ...(exclude.includes('delete') ? [] : ['DELETE /' + obj.collection + '/:id'])
      ]
    });
  }
  
  output.innerHTML = '<div class="status success">Auto-generated REST endpoints from SMRT objects</div><pre>' + JSON.stringify(routes, null, 2) + '</pre>';
}

// Test API client
async function testAPI(collection) {
  const client = createClient('http://localhost:37428/api/v1');
  const output = document.getElementById('client-output');
  if (!output) return;
  
  try {
    output.innerHTML = '<div class="status">Testing ' + collection + '...</div>';
    
    // Test listing
    const items = await client[collection].list();
    
    // Test creation
    const testData = collection === 'products' 
      ? { name: 'Test Product', price: 29.99, inStock: true }
      : { name: 'Test Category', active: true };
    
    const created = await client[collection].create(testData);
    
    output.innerHTML = '<div class="status success">✅ ' + collection + ' API test successful!</div><p><strong>List:</strong></p><pre>' + JSON.stringify(items, null, 2) + '</pre><p><strong>Created:</strong></p><pre>' + JSON.stringify(created, null, 2) + '</pre>';
  } catch (error) {
    output.innerHTML = '<div class="status error">❌ API test failed: ' + error.message + '</div>';
  }
}

// Global functions for buttons
(window as any).testProducts = () => testAPI('product');
(window as any).testCategories = () => testAPI('category');

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
  displayManifest();
  displayMCPTools();
  displayRoutes();
});