---
id: module-federation-guide
title: "Module Federation with SMRT: Micro-Frontend Architecture"
sidebar_label: Module Federation Guide
sidebar_position: 3
---

# Module Federation with SMRT: Micro-Frontend Architecture

Master micro-frontend architecture using Module Federation with SMRT services. Learn how to build scalable, team-autonomous applications that share components at runtime.

## What is Module Federation?

Module Federation enables **runtime composition** of applications from independently deployable micro-frontends:

- **Independent deployments** - Teams can deploy services independently
- **Runtime sharing** - Components are loaded dynamically at runtime
- **Version independence** - Different services can use different dependency versions
- **Team autonomy** - Each team owns their service completely

### Traditional vs Federation Architecture

**Traditional Monolith**:
```
┌─────────────────────────────────────┐
│           Single Application        │
│  ┌─────────┐ ┌─────────┐ ┌────────┐ │
│  │Products │ │ Users   │ │Orders  │ │
│  │         │ │         │ │        │ │
│  └─────────┘ └─────────┘ └────────┘ │
└─────────────────────────────────────┘
```

**Module Federation**:
```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│Product Service│    │ User Service │    │Order Service │
│   Port 3002   │    │   Port 3003  │    │   Port 3004  │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                ┌──────────▼───────────┐
                │   Shell Application  │
                │      Port 3000       │
                └──────────────────────┘
```

## Real Implementation: SMRT Products Service

Let's examine the complete module federation setup from `smrt/products`:

### Federation Directory Structure

```
smrt/products/src/federation/
├── expose.config.js          # What this service exposes
├── consume.config.js         # What this service consumes
├── shared.config.js          # Shared dependencies
└── types.d.ts               # TypeScript definitions
```

### Expose Configuration

The expose configuration defines what components other services can import:

```javascript
// src/federation/expose.config.js
export const exposeConfig = {
  // Granular component exposure
  components: {
    './ProductCard': './src/lib/components/ProductCard.svelte',
    './ProductForm': './src/lib/components/ProductForm.svelte',
    './ProductSearch': './src/lib/components/ProductSearch.svelte'
  },

  // Feature-level exposure
  features: {
    './ProductCatalog': './src/lib/features/ProductCatalog.svelte',
    './CategoryManager': './src/lib/features/CategoryManager.svelte'
  },

  // Page-level exposure
  applications: {
    './ProductsPage': './src/app/pages/ProductsPage.svelte',
    './ProductsAdmin': './src/app/pages/ProductsAdmin.svelte'
  },

  // Business logic exposure
  logic: {
    './Product': './src/lib/models/Product.ts',
    './ProductStore': './src/lib/stores/product-store.svelte.ts',
    './ProductAPI': './src/lib/api/product-client.ts'
  }
};

// Flatten for Vite federation plugin
export const flattenedExposes = Object.values(exposeConfig)
  .reduce((acc, category) => ({ ...acc, ...category }), {});
```

### Consume Configuration

Define what remote services this service consumes:

```javascript
// src/federation/consume.config.js
export const consumeConfig = {
  remotes: {
    // User service for authentication and profiles
    userService: {
      url: 'userService@http://localhost:3003/remoteEntry.js',
      scope: 'userService',
      components: {
        UserProfile: './UserProfile',
        LoginForm: './LoginForm',
        UserPreferences: './UserPreferences'
      }
    },

    // Order service for purchase flow
    orderService: {
      url: 'orderService@http://localhost:3004/remoteEntry.js',
      scope: 'orderService',
      components: {
        OrderSummary: './OrderSummary',
        PaymentForm: './PaymentForm',
        OrderHistory: './OrderHistory'
      }
    },

    // Analytics service for tracking
    analyticsService: {
      url: 'analyticsService@http://localhost:3005/remoteEntry.js',
      scope: 'analyticsService',
      components: {
        AnalyticsDashboard: './AnalyticsDashboard',
        EventTracker: './EventTracker'
      }
    }
  }
};
```

### Shared Dependencies Configuration

Critical for avoiding version conflicts and bundle duplication:

```javascript
// src/federation/shared.config.js
export default {
  // Core framework - must be singleton
  svelte: {
    singleton: true,
    strictVersion: true,
    requiredVersion: '^5.0.0'
  },

  // SMRT framework - shared across all services
  '@have/smrt': {
    singleton: true,
    strictVersion: false, // Allow minor version differences
    requiredVersion: '^0.0.50'
  },

  // AI client - expensive to duplicate
  '@have/ai': {
    singleton: true,
    strictVersion: false,
    requiredVersion: '^0.0.50'
  },

  // Utility libraries - safe to share
  '@have/utils': {
    singleton: false, // Allow multiple versions
    strictVersion: false
  },

  // External dependencies
  lodash: {
    singleton: false,
    strictVersion: false
  }
};
```

## Building Federation-Ready Components

### Component Design Principles

**1. Self-Contained Components**
```svelte
<!-- src/lib/features/ProductCatalog.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { productStore } from '../stores/product-store.svelte.js';
  import ProductCard from '../components/ProductCard.svelte';

  // Props interface for external consumption
  interface Props {
    // Configuration props
    readonly?: boolean;
    maxItems?: number;
    categories?: string[];

    // Integration props
    onProductSelect?: (product: Product) => void;
    onError?: (error: Error) => void;

    // Styling props
    theme?: 'light' | 'dark';
    compact?: boolean;
  }

  let {
    readonly = false,
    maxItems = 50,
    categories = [],
    onProductSelect,
    onError,
    theme = 'light',
    compact = false
  }: Props = $props();

  // Internal state
  let mounted = $state(false);

  // Reactive computed values
  const filteredProducts = $derived(() => {
    let products = productStore.items;

    if (categories.length > 0) {
      products = products.filter(p => categories.includes(p.category));
    }

    return products.slice(0, maxItems);
  });

  // Event handlers
  function handleProductClick(product: Product) {
    onProductSelect?.(product);
  }

  function handleError(error: Error) {
    onError?.(error);
    console.error('ProductCatalog error:', error);
  }

  onMount(async () => {
    try {
      await productStore.loadProducts();
      mounted = true;
    } catch (error) {
      handleError(error as Error);
    }
  });
</script>

<div class="product-catalog" data-theme={theme} class:compact>
  <header class="catalog-header">
    <h2>Product Catalog</h2>
    {#if productStore.loading}
      <div class="loading" role="status" aria-label="Loading products">
        Loading products...
      </div>
    {/if}
  </header>

  {#if productStore.error}
    <div class="error" role="alert">
      Error loading products: {productStore.error}
    </div>
  {/if}

  <div class="product-grid">
    {#each filteredProducts as product (product.id)}
      <ProductCard
        {product}
        editable={!readonly}
        {theme}
        on:click={() => handleProductClick(product)}
        on:update={() => productStore.loadProducts()}
        on:error={handleError}
      />
    {/each}
  </div>
</div>

<style>
  .product-catalog {
    container-type: inline-size;
    --catalog-gap: 1rem;
    --catalog-padding: 1rem;
  }

  .product-catalog.compact {
    --catalog-gap: 0.5rem;
    --catalog-padding: 0.5rem;
  }

  .product-catalog[data-theme="dark"] {
    --catalog-bg: #1a1a1a;
    --catalog-text: #ffffff;
  }

  .product-catalog[data-theme="light"] {
    --catalog-bg: #ffffff;
    --catalog-text: #000000;
  }

  .product-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--catalog-gap);
    padding: var(--catalog-padding);
  }

  @container (max-width: 768px) {
    .product-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
```

**2. Error Boundaries and Fallbacks**
```svelte
<!-- src/lib/components/FederationWrapper.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    componentName: string;
    fallback?: string;
    timeout?: number;
  }

  let { componentName, fallback = 'Loading...', timeout = 5000 }: Props = $props();

  let component = $state(null);
  let loading = $state(true);
  let error = $state(null);

  onMount(async () => {
    try {
      // Dynamic import with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Component load timeout')), timeout);
      });

      const loadPromise = import(componentName);

      const result = await Promise.race([loadPromise, timeoutPromise]);
      component = result.default;

    } catch (err) {
      error = err.message;
      console.error(`Failed to load federated component ${componentName}:`, err);
    } finally {
      loading = false;
    }
  });
</script>

{#if loading}
  <div class="federation-loading">
    {fallback}
  </div>
{:else if error}
  <div class="federation-error" role="alert">
    <h3>Component Load Error</h3>
    <p>Failed to load {componentName}: {error}</p>
    <button on:click={() => window.location.reload()}>
      Retry
    </button>
  </div>
{:else if component}
  <svelte:component this={component} {...$$props} />
{:else}
  <div class="federation-fallback">
    Component not available
  </div>
{/if}
```

## Consumer Application Patterns

### Shell Application Architecture

```svelte
<!-- apps/shell/src/App.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import FederationWrapper from './lib/FederationWrapper.svelte';

  // Federated component imports
  import UserProfile from 'userService/UserProfile';
  import ProductCatalog from 'productService/ProductCatalog';
  import OrderHistory from 'orderService/OrderHistory';
  import AnalyticsDashboard from 'analyticsService/AnalyticsDashboard';

  // Shell state
  let currentUser = $state(null);
  let selectedProduct = $state(null);
  let currentView = $state('catalog');

  // Cross-service communication
  function handleProductSelect(product) {
    selectedProduct = product;
    currentView = 'details';

    // Track analytics across services
    analyticsService.trackEvent('product_viewed', {
      productId: product.id,
      userId: currentUser?.id
    });
  }

  function handleUserLogin(user) {
    currentUser = user;
    // Notify all services of user change
    productService.setUser(user);
    orderService.setUser(user);
  }

  onMount(() => {
    // Initialize federated services
    productService.initialize();
    userService.initialize();
    orderService.initialize();
  });
</script>

<div class="shell-app">
  <header class="app-header">
    <nav>
      <button
        class:active={currentView === 'catalog'}
        on:click={() => currentView = 'catalog'}
      >
        Products
      </button>
      <button
        class:active={currentView === 'orders'}
        on:click={() => currentView = 'orders'}
      >
        Orders
      </button>
      <button
        class:active={currentView === 'analytics'}
        on:click={() => currentView = 'analytics'}
      >
        Analytics
      </button>
    </nav>

    <div class="user-section">
      <FederationWrapper componentName="userService/UserProfile">
        <UserProfile
          user={currentUser}
          on:login={handleUserLogin}
          on:logout={() => currentUser = null}
        />
      </FederationWrapper>
    </div>
  </header>

  <main class="app-main">
    {#if currentView === 'catalog'}
      <FederationWrapper componentName="productService/ProductCatalog">
        <ProductCatalog
          readonly={false}
          onProductSelect={handleProductSelect}
          theme="light"
        />
      </FederationWrapper>

    {:else if currentView === 'orders'}
      <FederationWrapper componentName="orderService/OrderHistory">
        <OrderHistory
          userId={currentUser?.id}
          onOrderSelect={handleOrderSelect}
        />
      </FederationWrapper>

    {:else if currentView === 'analytics'}
      <FederationWrapper componentName="analyticsService/AnalyticsDashboard">
        <AnalyticsDashboard
          userId={currentUser?.id}
          timeRange="30d"
        />
      </FederationWrapper>
    {/if}
  </main>
</div>
```

### Cross-Service Communication

**Event Bus Pattern**:
```typescript
// src/lib/federation/event-bus.ts
class FederationEventBus {
  private listeners = new Map<string, Set<Function>>();

  emit(event: string, data: any) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  on(event: string, listener: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  off(event: string, listener: Function) {
    this.listeners.get(event)?.delete(listener);
  }
}

// Global event bus for federation
export const federationBus = new FederationEventBus();

// Service-specific APIs
export const productEvents = {
  productSelected: (product: Product) =>
    federationBus.emit('product:selected', product),

  productUpdated: (product: Product) =>
    federationBus.emit('product:updated', product),

  onProductSelected: (callback: (product: Product) => void) =>
    federationBus.on('product:selected', callback)
};

export const userEvents = {
  userLoggedIn: (user: User) =>
    federationBus.emit('user:logged-in', user),

  userLoggedOut: () =>
    federationBus.emit('user:logged-out', null),

  onUserChanged: (callback: (user: User | null) => void) =>
    federationBus.on('user:changed', callback)
};
```

**Shared State Pattern**:
```typescript
// src/lib/federation/shared-state.ts
import { writable } from 'svelte/store';

// Global shared state accessible across all federated services
export const sharedState = {
  // User context
  currentUser: writable(null),
  userPreferences: writable({}),

  // Application context
  theme: writable('light'),
  locale: writable('en'),

  // Business context
  selectedProducts: writable([]),
  shoppingCart: writable([]),

  // Navigation context
  currentRoute: writable('/'),
  breadcrumbs: writable([])
};

// Helper functions for cross-service coordination
export const federationHelpers = {
  // Update user across all services
  setUser(user: User | null) {
    sharedState.currentUser.set(user);
    federationBus.emit('user:changed', user);
  },

  // Add product to shared cart
  addToCart(product: Product) {
    sharedState.shoppingCart.update(cart => [...cart, product]);
    federationBus.emit('cart:item-added', product);
  },

  // Update theme across all services
  setTheme(theme: 'light' | 'dark') {
    sharedState.theme.set(theme);
    federationBus.emit('theme:changed', theme);
  }
};
```

## Development and Testing

### Local Development Setup

```bash
# Terminal 1: Start product service
cd smrt/products
npm run dev:federation
# Running on http://localhost:3002

# Terminal 2: Start user service
cd services/user
npm run dev:federation
# Running on http://localhost:3003

# Terminal 3: Start order service
cd services/order
npm run dev:federation
# Running on http://localhost:3004

# Terminal 4: Start shell application
cd apps/shell
npm run dev
# Running on http://localhost:3000
```

### Testing Federation Components

```typescript
// tests/federation.test.ts
import { test, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ProductCatalog from '../src/lib/features/ProductCatalog.svelte';

test('ProductCatalog works as federated component', async () => {
  // Mock federation context
  const mockProps = {
    readonly: false,
    maxItems: 10,
    categories: ['electronics'],
    onProductSelect: vi.fn(),
    theme: 'light'
  };

  const { getByText, getByTestId } = render(ProductCatalog, mockProps);

  // Test component renders
  expect(getByText('Product Catalog')).toBeInTheDocument();

  // Test federation props work
  const productCard = getByTestId('product-card-1');
  await fireEvent.click(productCard);

  expect(mockProps.onProductSelect).toHaveBeenCalledWith(
    expect.objectContaining({ id: '1' })
  );
});

test('Component handles federation errors gracefully', async () => {
  // Mock network failure
  vi.mock('@smrt/client', () => ({
    createClient: () => ({
      products: {
        list: () => Promise.reject(new Error('Network error'))
      }
    })
  }));

  const mockOnError = vi.fn();
  render(ProductCatalog, { onError: mockOnError });

  // Wait for error handling
  await new Promise(resolve => setTimeout(resolve, 100));

  expect(mockOnError).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Network error' })
  );
});
```

## Production Deployment

### Docker Setup for Federation

```dockerfile
# Dockerfile.federation
FROM node:24-alpine as builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build:federation

FROM nginx:alpine
COPY --from=builder /app/dist/federation /usr/share/nginx/html
COPY nginx.federation.conf /etc/nginx/nginx.conf

EXPOSE 3002
CMD ["nginx", "-g", "daemon off;"]
```

```nginx
# nginx.federation.conf
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Enable CORS for federation
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
    add_header Access-Control-Allow-Headers "Content-Type";

    server {
        listen 3002;
        root /usr/share/nginx/html;
        index index.html;

        # Serve federation manifest
        location /remoteEntry.js {
            add_header Cache-Control "no-cache";
            try_files $uri =404;
        }

        # Serve federation assets
        location / {
            add_header Cache-Control "public, max-age=31536000";
            try_files $uri $uri/ =404;
        }
    }
}
```

### Kubernetes Deployment

```yaml
# k8s/product-service.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: product-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: product-service
  template:
    metadata:
      labels:
        app: product-service
    spec:
      containers:
      - name: product-service
        image: product-service:latest
        ports:
        - containerPort: 3002
        env:
        - name: FEDERATION_PORT
          value: "3002"
        - name: USER_SERVICE_URL
          value: "http://user-service:3003"
        - name: ORDER_SERVICE_URL
          value: "http://order-service:3004"

---
apiVersion: v1
kind: Service
metadata:
  name: product-service
spec:
  selector:
    app: product-service
  ports:
  - port: 3002
    targetPort: 3002
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: product-service-ingress
  annotations:
    nginx.ingress.kubernetes.io/cors-allow-origin: "*"
    nginx.ingress.kubernetes.io/cors-allow-methods: "GET, POST, OPTIONS"
spec:
  rules:
  - host: products.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: product-service
            port:
              number: 3002
```

## Best Practices and Patterns

### **Federation Design Principles**

1. **Component Independence** - Each component should work in isolation
2. **Props Interface Contracts** - Well-defined, stable interfaces
3. **Error Boundary Implementation** - Graceful degradation
4. **Performance Optimization** - Lazy loading and code splitting
5. **Version Compatibility** - Backward compatibility for shared dependencies

### **Common Pitfalls to Avoid**

1. **Shared State Coupling** - Avoid tight coupling through shared state
2. **Dependency Version Conflicts** - Use singleton: true carefully
3. **Network Failure Handling** - Always implement fallbacks
4. **Bundle Size Bloat** - Monitor shared dependency duplication
5. **Development Complexity** - Keep local development simple

### **Performance Optimization**

```typescript
// Lazy loading federation components
const LazyProductCatalog = lazy(() => import('productService/ProductCatalog'));

// Preload critical components
const preloadComponents = async () => {
  const criticalComponents = [
    () => import('userService/UserProfile'),
    () => import('productService/ProductCatalog')
  ];

  await Promise.all(criticalComponents.map(load => load()));
};

// Component caching
const federationCache = new Map();

export function getCachedComponent(name: string) {
  if (federationCache.has(name)) {
    return federationCache.get(name);
  }

  const component = import(name);
  federationCache.set(name, component);
  return component;
}
```

---

<div className="callout success">
  <strong>🎉 Federation Mastery!</strong> You now understand how to build scalable micro-frontend architectures using Module Federation with SMRT. This enables team autonomy, independent deployments, and runtime composition at enterprise scale.
</div>