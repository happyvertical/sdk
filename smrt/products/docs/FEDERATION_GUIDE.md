# Module Federation Guide

## Overview

This guide explains how to use the SMRT template's module federation capabilities to share components, features, and entire applications between microservices at runtime.

## Quick Start

### 1. As a Federation Provider (Exposing Components)

Your SMRT service automatically exposes components via the federation configuration:

```bash
# Start federation server
npm run dev:federation
# or
npm run start:federation

# Federation available at: http://localhost:3002/assets/remoteEntry.js
```

### 2. As a Federation Consumer (Using Remote Components)

```typescript
// vite.config.ts in your consuming application
import { defineConfig } from 'vite';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    federation({
      name: 'mainApp',
      remotes: {
        productService: 'http://localhost:3002/assets/remoteEntry.js'
      }
    })
  ]
});
```

```svelte
<!-- MyApp.svelte -->
<script>
  import ProductCard from 'productService/ProductCard';
  import ProductCatalog from 'productService/ProductCatalog';
</script>

<ProductCatalog />
```

## What's Available for Federation

### Component Level (Fine-Grained)

Perfect for building blocks and reusable UI elements:

```typescript
// Individual components
import ProductCard from 'productService/ProductCard';
import ProductForm from 'productService/ProductForm';

// Usage
<ProductCard {product} onEdit={handleEdit} />
```

**Use when:**
- Building custom layouts with standard components
- Need specific functionality without full features
- Creating new applications with consistent design elements

### Feature Level (Medium-Grained)  

Complete feature modules with their own state and logic:

```typescript
// Feature modules
import ProductCatalog from 'productService/ProductCatalog';
import CategoryManager from 'productService/CategoryManager';

// Usage - fully functional feature
<ProductCatalog showCreateForm={true} readonly={false} />
```

**Use when:**
- Embedding complete functionality into larger applications
- Need feature parity without reimplementing logic
- Building composite applications from multiple services

### Application Level (Coarse-Grained)

Complete pages or app sections:

```typescript
// Full pages/applications
import ProductsPage from 'productService/ProductsPage';
import ProductApp from 'productService/ProductApp';

// Usage - complete application section
<ProductsPage />
```

**Use when:**
- Creating portal-style applications
- Need complete functionality with minimal integration work
- Building application shells that host multiple services

### Business Logic Level

Shared models and stores for consistent behavior:

```typescript
// Models and business logic
import { Product, Category } from 'productService/Product';
import { ProductStoreClass } from 'productService/ProductStore';

// Usage - shared business logic
const productStore = new ProductStoreClass();
await productStore.loadProducts();
```

**Use when:**
- Need consistent business logic across applications
- Building applications that extend service functionality
- Ensuring data models stay in sync

## Configuration

### Expose Configuration

Edit `src/federation/expose.config.ts` to control what's available:

```typescript
export const exposeConfig: ExposeConfig = {
  // Add new components
  components: {
    './ProductCard': './src/lib/components/ProductCard.svelte',
    './CustomButton': './src/lib/components/CustomButton.svelte' // New
  },
  
  // Add new features  
  features: {
    './ProductCatalog': './src/lib/features/ProductCatalog.svelte',
    './InventoryManager': './src/lib/features/InventoryManager.svelte' // New
  },
  
  // Control what gets exposed
  applications: {
    // Remove this line to stop exposing the full page
    // './ProductsPage': './src/app/pages/ProductsPage.svelte'
  }
};
```

### Consume Configuration

Edit `src/federation/consume.config.ts` to use external services:

```typescript
export const consumeConfig: ConsumeConfig = {
  remotes: {
    // Add external services
    authService: 'http://localhost:3003/assets/remoteEntry.js',
    notificationService: 'http://localhost:3004/assets/remoteEntry.js'
  }
};
```

### Shared Dependencies

Edit `src/federation/shared.config.ts` to prevent duplication:

```typescript
export const sharedDependencies = {
  'svelte': {
    singleton: true,
    requiredVersion: '^5.0.0'
  },
  // Add shared libraries
  'date-fns': {
    singleton: true,
    requiredVersion: '^2.29.0'
  }
};
```

## Usage Patterns

### 1. Micro-Frontend Architecture

Build a main application shell that loads different services:

```typescript
// Main application
const routes = [
  {
    path: '/products',
    component: () => import('productService/ProductsPage')
  },
  {
    path: '/users', 
    component: () => import('userService/UsersPage')
  },
  {
    path: '/orders',
    component: () => import('orderService/OrdersPage')
  }
];
```

### 2. Component Library Pattern

Use services as distributed component libraries:

```typescript
// Design system from multiple services  
import { Button, Input } from 'designService/components';
import { ProductCard } from 'productService/components';
import { UserProfile } from 'userService/components';

// Build custom applications with shared components
<div>
  <Button>Create Product</Button>
  <ProductCard {product} />
  <UserProfile {user} />
</div>
```

### 3. Progressive Enhancement

Start with basic functionality and enhance with remote features:

```typescript
// Base application with optional enhancements
<script>
  let ProductCatalog = null;
  
  // Progressively load remote features
  onMount(async () => {
    try {
      ProductCatalog = await import('productService/ProductCatalog');
    } catch (e) {
      // Fall back to basic functionality
      console.log('Advanced catalog not available');
    }
  });
</script>

{#if ProductCatalog}
  <svelte:component this={ProductCatalog} />
{:else}
  <BasicProductList />
{/if}
```

### 4. Cross-Service Communication

Share state and events between federated modules:

```typescript
// Event bus for cross-service communication
import { createEventBus } from 'shared/eventBus';

const eventBus = createEventBus();

// Product service publishes events
productStore.on('productCreated', (product) => {
  eventBus.emit('product:created', product);
});

// Order service listens for events
eventBus.on('product:created', (product) => {
  // Update order calculations
});
```

## Development and Debugging

### Local Development Setup

1. **Start all services**:
```bash
# Terminal 1 - Product Service
cd product-service && npm run dev:federation

# Terminal 2 - User Service  
cd user-service && npm run dev:federation

# Terminal 3 - Main Application
cd main-app && npm run dev
```

2. **Configure service discovery**:
```typescript
// Use environment variables for dynamic URLs
const remotes = {
  productService: process.env.VITE_PRODUCT_SERVICE_URL || 'http://localhost:3002/assets/remoteEntry.js'
};
```

### Debugging Federation Issues

#### Module Not Found
```
Error: Cannot find module 'productService/ProductCard'
```

**Solutions:**
1. Verify federation server is running at correct URL
2. Check expose configuration includes the component
3. Ensure component file exists at specified path
4. Check network tab for failed remoteEntry.js requests

#### Version Conflicts
```
Error: Shared module version mismatch
```

**Solutions:**
1. Check shared dependencies configuration
2. Ensure compatible versions across services
3. Use `singleton: true` for critical dependencies
4. Consider upgrading/downgrading conflicting packages

#### Type Safety Issues

Federation components won't have TypeScript support by default.

**Solutions:**
1. Create type declaration files:
```typescript
// types/federation.d.ts
declare module 'productService/ProductCard' {
  import type { SvelteComponent } from 'svelte';
  import type { ProductData } from './product-types';
  
  interface Props {
    product: ProductData;
    onEdit?: (product: ProductData) => void;
  }
  
  export default class ProductCard extends SvelteComponent<Props> {}
}
```

2. Use the NPM package for development, federation for production
3. Generate types automatically via CI/CD

### Performance Considerations

#### Bundle Size
- Federation adds runtime overhead for module loading
- Shared dependencies reduce duplication but add complexity
- Monitor bundle analyzer for size impact

#### Network Latency  
- Each federated module requires a network request
- Consider bundling related components together
- Implement loading states for federated components

#### Caching Strategy
- Use appropriate cache headers for remoteEntry.js
- Consider CDN distribution for federated modules
- Implement service worker caching for offline support

## Production Deployment

### Container Strategy
```dockerfile
# Multi-stage build for federation
FROM node:22-alpine as builder
COPY . .
RUN npm run build:federation

FROM nginx:alpine
COPY --from=builder dist/federation /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
```

### Service Discovery
```typescript
// Dynamic service discovery
const serviceRegistry = await fetch('/api/services');
const remotes = serviceRegistry.reduce((acc, service) => {
  acc[service.name] = `${service.url}/assets/remoteEntry.js`;
  return acc;
}, {});
```

### Monitoring and Health Checks
```typescript
// Health check for federation endpoints
export async function checkFederationHealth() {
  const services = ['productService', 'userService'];
  
  for (const service of services) {
    try {
      const response = await fetch(`${service}/assets/remoteEntry.js`);
      if (!response.ok) {
        console.warn(`Federation service ${service} unhealthy`);
      }
    } catch (error) {
      console.error(`Federation service ${service} unreachable:`, error);
    }
  }
}
```

Module federation transforms how we think about microservices by extending the concept to include sophisticated, runtime-shareable frontend components and applications.