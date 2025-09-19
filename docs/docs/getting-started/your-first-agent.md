---
id: your-first-agent
title: Your First SMRT Service
sidebar_label: Your First Service
sidebar_position: 2
---

# Your First SMRT Service

Let's build your first auto-generating service step-by-step. In just a few minutes, you'll have a complete API, AI tools, CLI commands, and more—all generated from a single class definition.

## What We'll Build

We'll create a **Product Knowledge Base** that automatically generates:
- ✅ **REST API endpoints** (`GET /products`, `POST /products`, etc.)
- ✅ **AI tools for agents** (search, list, get operations)
- ✅ **CLI commands** (`product list`, `product create`, etc.)
- ✅ **TypeScript client library**
- ✅ **Database schema and migrations**

## Step 1: Project Setup

First, create a new directory and initialize your project:

```bash
mkdir product-knowledge-base
cd product-knowledge-base
bun init -y
```

Install SMRT and supporting packages:

```bash
bun add @have/smrt @have/ai
```

Create a `.env` file with your AI credentials:

```bash
OPENAI_API_KEY=sk-...  # Your OpenAI API key
```

## Step 2: Define Your Product Model

Create `src/models/Product.ts` with the `@smrt()` decorator:

```typescript
import { BaseObject, smrt } from '@have/smrt';

/**
 * Product model with full auto-generation
 */
@smrt({
  api: {
    include: ['list', 'get', 'create', 'update'] // Auto-generates REST endpoints
  },
  mcp: {
    include: ['list', 'get', 'search'] // Auto-generates AI tools
  },
  cli: true // Auto-generates CLI commands
})
export class Product extends BaseObject {
  name: string = '';
  description: string = '';
  category: string = '';
  manufacturer: string = '';
  model: string = '';
  specifications: Record<string, any> = {};
  tags: string[] = [];

  constructor(options: any = {}) {
    super(options);
    Object.assign(this, options);
  }

  async getSpecification(key: string): Promise<any> {
    return this.specifications[key];
  }

  async updateSpecification(key: string, value: any): Promise<void> {
    this.specifications[key] = value;
  }

  // AI-powered methods from BaseObject
  async summarize(): Promise<string> {
    return await this.do(`Create a brief summary of this product: ${this.name} - ${this.description}`);
  }

  async isCompatibleWith(otherProduct: Product): Promise<boolean> {
    return await this.is(`compatible with ${otherProduct.name} based on specifications and category`);
  }

  static async searchByText(query: string): Promise<Product[]> {
    // This method will be auto-implemented by SMRT
    return [];
  }

  static async findByManufacturer(manufacturer: string): Promise<Product[]> {
    // This method will be auto-implemented by SMRT
    return [];
  }
}
```

<div className="callout success">
  <strong>🚀 Auto-Generation Magic:</strong> The `@smrt()` decorator automatically creates:
  <ul>
    <li><strong>REST API</strong>: GET/POST/PUT/DELETE endpoints</li>
    <li><strong>MCP Tools</strong>: AI agent integrations</li>
    <li><strong>CLI Commands</strong>: Admin interface</li>
    <li><strong>Type Definitions</strong>: Full TypeScript support</li>
    <li><strong>Database Schema</strong>: Automatic migrations</li>
  </ul>
</div>

## Step 3: Configure Vite for Auto-Generation

Create `vite.config.ts` to enable SMRT's auto-generation:

```typescript
import { defineConfig } from 'vite';
import { smrtPlugin } from '@have/smrt/vite';

export default defineConfig({
  plugins: [
    smrtPlugin({
      // Discover Product model for auto-generation
      entryPoints: ['./src/models/Product.ts'],
      // Generate virtual modules
      generate: {
        routes: true,    // @smrt/routes
        client: true,    // @smrt/client
        mcp: true,       // @smrt/mcp
        cli: true        // @smrt/cli
      }
    })
  ],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es', 'cjs']
    }
  }
});
```

## Step 4: Use Auto-Generated Modules

Create `src/server.ts` to use the auto-generated API routes:

```typescript
import express from 'express';
import { initializeDatabase } from '@have/smrt';
import { Product } from './models/Product';

// Import auto-generated modules (created by SMRT Vite plugin)
import setupRoutes from '@smrt/routes';      // Auto-generated REST API
import createClient from '@smrt/client';     // Auto-generated TypeScript client
import createMCPServer from '@smrt/mcp';     // Auto-generated AI tools

async function startServer() {
  // Initialize database
  await initializeDatabase();

  // Set up Express server with auto-generated routes
  const app = express();
  app.use(express.json());

  // Mount auto-generated API routes
  app.use('/api/v1', setupRoutes());

  // Start REST API server
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`🚀 Product API running on http://localhost:${port}`);
    console.log(`📚 Auto-generated endpoints:`);
    console.log(`   GET    /api/v1/products`);
    console.log(`   POST   /api/v1/products`);
    console.log(`   GET    /api/v1/products/:id`);
    console.log(`   PUT    /api/v1/products/:id`);
  });

  // Start MCP server for AI tools (parallel to REST API)
  const mcpServer = createMCPServer();
  await mcpServer.start(3001);
  console.log(`🤖 MCP server running on port 3001`);
}

startServer().catch(console.error);
```

## Step 5: Use the Auto-Generated Client

Create `src/client-example.ts` to demonstrate the auto-generated TypeScript client:

```typescript
import createClient from '@smrt/client';     // Auto-generated client
import { Product } from './models/Product';

async function demonstrateClient() {
  // Create client instance
  const client = createClient('http://localhost:3000/api/v1');

  console.log('🛠️  Testing auto-generated client...\n');

  // Example 1: Create a product
  console.log('📦 Creating a product...');
  const newProduct = await client.products.create({
    name: 'MacBook Pro M3',
    description: 'Latest MacBook Pro with M3 chip',
    category: 'laptops',
    manufacturer: 'Apple',
    model: 'MBP-M3-14',
    specifications: {
      processor: 'M3 Pro',
      memory: '16GB',
      storage: '512GB SSD',
      display: '14-inch Liquid Retina XDR'
    },
    tags: ['apple', 'laptop', 'm3', 'professional']
  });

  console.log(`✅ Created product: ${newProduct.data.name} (ID: ${newProduct.data.id})`);

  // Example 2: List all products
  console.log('\n📋 Listing all products...');
  const products = await client.products.list();
  console.log(`Found ${products.data.length} products`);

  // Example 3: Search products (auto-generated search)
  console.log('\n🔍 Searching for Apple products...');
  const appleProducts = await client.products.search({ query: 'Apple' });
  console.log(`Found ${appleProducts.data.length} Apple products`);

  // Example 4: Update a product
  console.log('\n✏️  Updating product...');
  const updated = await client.products.update(newProduct.data.id, {
    specifications: {
      ...newProduct.data.specifications,
      warranty: '1 year AppleCare+'
    }
  });
  console.log(`✅ Updated product specifications`);

  // Example 5: Use AI capabilities directly on objects
  console.log('\n🤖 Using AI capabilities...');
  const product = new Product(newProduct.data);
  const summary = await product.summarize();
  console.log(`AI Summary: ${summary}`);

  const isExpensive = await product.is('an expensive product over $1000');
  console.log(`Is expensive: ${isExpensive}`);
}

demonstrateClient().catch(console.error);
```

## Step 6: Test Your Service

Add scripts to your `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "start:server": "bun src/server.ts",
    "test:client": "bun src/client-example.ts"
  }
}
```

Now run your service:

```bash
# Terminal 1: Start the server
bun run start:server

# Terminal 2: Test the client
bun run test:client
```

You should see output like:

```
🚀 Product API running on http://localhost:3000
📚 Auto-generated endpoints:
   GET    /api/v1/products
   POST   /api/v1/products
   GET    /api/v1/products/:id
   PUT    /api/v1/products/:id
🤖 MCP server running on port 3001

🛠️  Testing auto-generated client...

📦 Creating a product...
✅ Created product: MacBook Pro M3 (ID: abc123)

📋 Listing all products...
Found 1 products

🔍 Searching for Apple products...
Found 1 Apple products

✏️  Updating product...
✅ Updated product specifications

🤖 Using AI capabilities...
AI Summary: Professional laptop with M3 chip offering high performance for creative work
Is expensive: true
```

## What Just Happened?

Let's break down the magic that occurred:

### 🎯 **The `@smrt()` Decorator**
- **Analyzed your Product class** and generated complete API infrastructure
- **Created REST endpoints** with proper HTTP methods and validation
- **Generated MCP tools** for AI agent integration
- **Built TypeScript client** with full type safety

### ⚡ **Vite Plugin Integration**
- **Virtual modules** (`@smrt/routes`, `@smrt/client`) appear as real imports
- **Hot module replacement** updates generated code instantly
- **Zero configuration** for common patterns

### 🤖 **AI-First Design**
- **Built-in AI methods** (`do()`, `is()`) on every object
- **MCP server** exposes tools for Claude/GPT integration
- **Natural language** queries and operations

### 🏗️ **Production Ready**
- **Type-safe throughout** with full TypeScript support
- **Database integration** with automatic schema generation
- **Error handling** and validation built-in

## Try the CLI Commands

Your Product class also auto-generated CLI commands. Try these:

```bash
# List products
bun run cli product list

# Create a product
bun run cli product create \
  --name "iPhone 15 Pro" \
  --category "smartphones" \
  --manufacturer "Apple"

# Search products
bun run cli product search --query "Apple"

# Get product details
bun run cli product get --id abc123
```

## Next Steps

Now that you've built your first auto-generating service, explore these advanced features:

<div className="row">
  <div className="col col--4">
    <div className="feature-card">
      <h3>🎯 Triple-Purpose Architecture</h3>
      <p>Learn how to deploy your service as a standalone app, module federation, or NPM package</p>
      <a href="/docs/tutorials/triple-purpose-architecture" className="nav-pill">Learn More →</a>
    </div>
  </div>
  <div className="col col--4">
    <div className="feature-card">
      <h3>🧠 Content Processing</h3>
      <p>Add AI-powered content analysis with the smrt/content module</p>
      <a href="/docs/supporting-libraries/content" className="nav-pill">Explore Content →</a>
    </div>
  </div>
  <div className="col col--4">
    <div className="feature-card">
      <h3>🔧 Advanced Patterns</h3>
      <p>Master relationships, validation, and custom integrations</p>
      <a href="/docs/smrt-framework/advanced-patterns" className="nav-pill">Advanced Guide →</a>
    </div>
  </div>
</div>

## Quick Reference

| Feature | What You Get | Configuration |
|---------|-------------|---------------|
| **`@smrt({ api: {...} })`** | REST API endpoints | `include: ['list', 'get', 'create', 'update', 'delete']` |
| **`@smrt({ mcp: {...} })`** | AI agent tools | `include: ['list', 'get', 'search', 'create']` |
| **`@smrt({ cli: true })`** | CLI commands | Automatic based on API configuration |
| **Virtual Modules** | Import auto-generated code | `@smrt/routes`, `@smrt/client`, `@smrt/mcp` |
| **AI Methods** | Natural language operations | `object.do()`, `object.is()` |

---

<div className="callout success">
  <strong>🎉 Congratulations!</strong> You've built a complete auto-generating service with SMRT. Share your creation with the community on <a href="https://discord.gg/smrt-agents">Discord</a>!
</div>
