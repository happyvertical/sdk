# SvelteKit Migration Plan for SMRT Template

## Overview
Transform the current smrt-template from a basic Node.js/Vite setup to a full SvelteKit application that leverages the SMRT framework's auto-generation capabilities with Svelte 5 runes for reactive state management.

## Phase 1: SvelteKit Project Setup
1. **Initialize SvelteKit project structure**:
   - Add SvelteKit dependencies (@sveltejs/kit, @sveltejs/adapter-node, @sveltejs/vite-plugin-svelte)
   - Create svelte.config.js with vitePreprocess and adapter configuration
   - Update vite.config.ts to use both sveltekit() and smrtPlugin()
   - Create src/app.html template
   - Add src/app.d.ts for TypeScript globals

2. **Directory restructuring**:
   ```
   src/
   ├── lib/
   │   ├── models/         # Move existing SMRT models here
   │   ├── stores/         # New: Svelte 5 rune-based stores
   │   ├── components/     # New: Reusable UI components
   │   └── types/          # Auto-generated types location
   ├── routes/
   │   ├── +layout.svelte  # Root layout
   │   ├── +page.svelte    # Home page
   │   ├── api/
   │   │   └── v1/
   │   │       └── [...path]/
   │   │           └── +server.ts  # Dynamic API route handler
   │   ├── products/
   │   │   ├── +page.svelte        # Products list
   │   │   ├── +page.server.ts     # SSR data loading
   │   │   └── [id]/
   │   │       └── +page.svelte    # Product detail
   │   └── categories/
   │       └── +page.svelte        # Categories management
   └── app.html
   ```

## Phase 2: SMRT Integration with SvelteKit
1. **API Route Adapter**:
   - Create a SvelteKit adapter for SMRT's auto-generated routes
   - Map Express-like handlers to SvelteKit's RequestHandler format
   - Implement proper request/response transformation

2. **Virtual Module Integration**:
   - Configure smrtPlugin to generate types in src/lib/types
   - Ensure virtual modules (@smrt/client, @smrt/routes, etc.) work with SvelteKit's SSR
   - Add proper TypeScript declarations for enhanced IDE support

## Phase 3: Svelte 5 Rune-Based State Management
1. **Create reactive stores** (src/lib/stores/smrt-store.svelte.ts):
   - Generic SmrtStore class using $state runes
   - Product-specific and Category-specific stores
   - Implement CRUD operations with optimistic updates
   - Add loading and error states

2. **Component architecture**:
   - ProductList.svelte - Display products with filtering
   - ProductForm.svelte - Create/edit products with validation
   - CategoryManager.svelte - Manage categories
   - Use $derived for computed values (e.g., filtered lists)

## Phase 4: UI Components with shadcn-svelte
1. **Install and configure shadcn-svelte**:
   - Add tailwindcss, bits-ui, and clsx dependencies
   - Configure components.json for shadcn-svelte
   - Set up lib/components/ui directory

2. **Create data-driven components**:
   - DataTable for displaying SMRT objects
   - FormGenerator for automatic form creation from manifest
   - ActionButtons for CRUD operations
   - Toast notifications for user feedback

## Phase 5: Enhanced Developer Experience
1. **Hot Module Replacement**:
   - Ensure HMR works for both SMRT model changes and Svelte components
   - Auto-refresh stores when manifest changes

2. **Type Safety**:
   - Full end-to-end type safety from models to UI
   - Auto-generated types for all virtual modules
   - Proper TypeScript support for Svelte 5 runes

3. **Development tools**:
   - Add npm scripts for common tasks
   - Create example .env file for configuration
   - Add README with getting started guide

## Phase 6: Production Features
1. **SSR/CSR Strategy**:
   - Implement proper data loading with +page.server.ts
   - Configure prerendering where appropriate
   - Add loading states and error boundaries

2. **Authentication (optional)**:
   - Prepare hooks for Keycloak integration
   - Add auth guards for protected routes

3. **Deployment**:
   - Configure adapter-node for production deployment
   - Add Docker support
   - Environment variable management

## Files to Create/Modify
- package.json - Add SvelteKit dependencies
- svelte.config.js - New SvelteKit configuration
- vite.config.ts - Update with SvelteKit plugin
- src/app.html - SvelteKit HTML template
- src/app.d.ts - TypeScript ambient declarations
- src/routes/+layout.svelte - Root layout
- src/routes/+page.svelte - Home page
- src/routes/api/v1/[...path]/+server.ts - API route adapter
- src/lib/stores/smrt-store.svelte.ts - Reactive store implementation
- src/lib/components/*.svelte - UI components
- Move existing models to src/lib/models/

## Benefits of This Approach
1. **Maintains SMRT auto-generation** - All virtual modules continue to work
2. **Modern reactive UI** - Svelte 5 runes provide excellent DX
3. **Full-stack type safety** - End-to-end TypeScript from DB to UI
4. **SSR/CSR flexibility** - SvelteKit's routing provides both options
5. **Production ready** - Built on battle-tested SvelteKit framework
6. **Incremental adoption** - Can be done in phases without breaking existing functionality

## Current Status
- ✅ SMRT auto-generation working with virtual modules
- ✅ Automatic TypeScript declaration generation
- ⏳ UI component library development in progress
- ⏳ SvelteKit migration pending