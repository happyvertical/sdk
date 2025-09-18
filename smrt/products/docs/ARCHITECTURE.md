# SMRT Template Architecture

## Overview

The SMRT Template demonstrates a **triple-purpose microservice architecture** that enables a single codebase to be consumed in three different ways:

1. **🏗️ Standalone Application** - Complete, independent web application
2. **🔗 Module Federation Provider** - Runtime component sharing via federation
3. **📦 NPM Package Library** - Build-time imports for standalone projects

## Core Philosophy

The template is built on the principle that **one codebase should serve multiple consumption patterns** without forcing developers to maintain separate implementations. This is achieved through:

- **Structured exports** via package.json and TypeScript configurations
- **Multi-mode Vite builds** that generate different output formats
- **SMRT auto-generation** that works consistently across all modes
- **Svelte 5 components** that are framework-agnostic enough to be shared

## Directory Structure

```
src/
├── lib/                          # 📦 NPM Library Code
│   ├── index.ts                  # Main library export
│   ├── models/                   # SMRT domain objects  
│   │   ├── Product.ts            # @smrt() decorated classes
│   │   ├── Category.ts
│   │   └── index.ts              # Model exports
│   ├── components/               # 🔗 Federatable UI components
│   │   ├── ProductCard.svelte
│   │   ├── ProductForm.svelte
│   │   └── index.ts              # Component exports
│   ├── features/                 # 🔗 Complete feature modules
│   │   ├── ProductCatalog.svelte
│   │   └── CategoryManager.svelte
│   ├── stores/                   # 📦 Svelte 5 rune-based stores
│   │   ├── product-store.svelte.ts
│   │   └── index.ts
│   ├── utils/                    # 📦 Shared utilities
│   │   └── index.ts
│   ├── generated/                # 🤖 Auto-generated components
│   │   └── index.ts
│   └── types/                    # 🤖 Auto-generated TypeScript types
│       └── virtual-modules.d.ts
├── app/                          # 🏗️ Standalone Application
│   ├── layouts/                  # App-specific layouts
│   │   └── AppLayout.svelte
│   ├── pages/                    # Complete pages
│   │   └── ProductsPage.svelte
│   ├── main.ts                   # Standalone app entry
│   ├── App.svelte                # Root component
│   └── app.css                   # Global styles
├── federation/                   # 🔗 Module Federation Config
│   ├── expose.config.ts          # What this service exposes
│   ├── consume.config.ts         # What this service consumes
│   └── shared.config.ts          # Shared dependencies
└── modes/                        # 🚀 Different deployment modes
    ├── standalone.ts             # Standalone app mode
    ├── federated.ts              # Federation mode
    └── development.ts            # Development mode
```

## Build System Architecture

### Multi-Mode Vite Configuration

The build system supports three distinct modes via `vite.config.ts`:

#### 1. Library Mode (`npm run build:lib`)
```typescript
// Generates: dist/lib/
{
  build: {
    lib: {
      entry: {
        index: './src/lib/index.ts',
        models: './src/lib/models/index.ts', 
        components: './src/lib/components/index.ts',
        // ... other entry points
      }
    }
  }
}
```

#### 2. Federation Mode (`npm run build:federation`)
```typescript  
// Generates: dist/federation/ + remoteEntry.js
{
  plugins: [federation(federationConfig)],
  build: { outDir: 'dist/federation' }
}
```

#### 3. Standalone Mode (`npm run build:app`)
```typescript
// Generates: dist/app/
{
  build: {
    rollupOptions: {
      input: './src/app/main.ts'
    },
    outDir: 'dist/app'
  }
}
```

### Package.json Export Map

The package supports granular imports via export maps:

```json
{
  "exports": {
    ".": "./dist/lib/index.js",           // Main export
    "./models": "./dist/lib/models/index.js",     // Just models
    "./components": "./dist/lib/components/index.js", // Just components
    "./stores": "./dist/lib/stores/index.js",     // Just stores
    "./generated": "./dist/lib/generated/index.js"    // Auto-generated
  }
}
```

## SMRT Integration

### Auto-Generation Pipeline

1. **AST Scanning**: Vite plugin scans `@smrt()` decorated classes
2. **Manifest Generation**: Creates metadata about discovered objects
3. **Virtual Modules**: Provides `@smrt/client`, `@smrt/routes`, etc.
4. **Type Generation**: Auto-generates TypeScript declarations
5. **Component Generation**: (Future) Auto-generates UI components

### Virtual Modules

The SMRT Vite plugin provides several virtual modules:

- `@smrt/client` - Auto-generated TypeScript client
- `@smrt/routes` - Auto-generated REST route handlers  
- `@smrt/types` - Auto-generated TypeScript types
- `@smrt/mcp` - Auto-generated MCP (Model Context Protocol) tools
- `@smrt/manifest` - Metadata about discovered objects

These virtual modules work identically across all three usage patterns.

## State Management

### Svelte 5 Runes Architecture

The template uses Svelte 5's new rune-based reactivity:

```typescript
// src/lib/stores/product-store.svelte.ts
export class ProductStoreClass {
  private data = $state<ProductStore>({
    items: [],
    loading: false,
    error: null
  });
  
  // Reactive getters
  get items() { return this.data.items; }
  
  // Derived state
  get inStockCount() {
    return this.data.items.filter(p => p.inStock).length;
  }
  
  // Actions
  async loadProducts() { /* ... */ }
}
```

This approach ensures:
- **Consistency** across all usage patterns
- **Framework agnostic** state that can be shared
- **Auto-reactive** UI updates in Svelte components
- **Type safety** with full TypeScript support

## Module Federation Details

### Expose Configuration

The service exposes components at different granularities:

```typescript
// federation/expose.config.ts
{
  // Component level (fine-grained)
  './ProductCard': './src/lib/components/ProductCard.svelte',
  
  // Feature level (medium-grained) 
  './ProductCatalog': './src/lib/features/ProductCatalog.svelte',
  
  // Application level (coarse-grained)
  './ProductsPage': './src/app/pages/ProductsPage.svelte',
  
  // Business logic
  './ProductStore': './src/lib/stores/product-store.svelte.ts',
  './Product': './src/lib/models/Product.ts'
}
```

### Consumer Usage

Other applications can consume at any level:

```typescript
// Component usage
import ProductCard from 'productService/ProductCard';

// Feature usage  
import ProductCatalog from 'productService/ProductCatalog';

// Full page usage
import ProductsPage from 'productService/ProductsPage';
```

## Development Workflow

### Local Development

```bash
# Start all modes simultaneously
npm run dev:all

# Standalone app: http://localhost:3001
# Federation server: http://localhost:3002
```

### Production Deployment

```bash
# Build all variants
npm run build:all

# Generates:
# - dist/lib/ (NPM package)
# - dist/app/ (Standalone app)  
# - dist/federation/ (Federation modules)
```

### Publishing

```bash
# Publish NPM package
npm publish

# Deploy standalone app
docker build -t product-service .

# Run federation server
npm run start:federation
```

## Benefits

### For Framework Users
- **Single source of truth** for business logic and UI
- **Flexible consumption** based on project needs
- **Consistent APIs** across all usage patterns
- **Automatic updates** when consuming as federated modules

### For Service Developers  
- **Reduced maintenance** - one codebase, three outputs
- **Battle-tested components** - federation uses real application code
- **Auto-generation** reduces boilerplate significantly
- **Type safety** end-to-end across all patterns

### for Organizations
- **Shared component libraries** emerge naturally
- **Flexible deployment** options as requirements change
- **Reduced duplication** across team projects
- **Standard patterns** for microservice UI architecture

This architecture represents the evolution of microservices beyond just backend services to include sophisticated, shareable frontend components and complete applications.