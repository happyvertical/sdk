# Creating SMRT Objects - Step by Step

## Example: Building a Product Management Object

This example walks through creating a complete SMRT object for e-commerce product management.

### Step 1: Define the Object Structure

```typescript
import { BaseObject, smrt, text, decimal, integer, boolean, datetime, json, foreignKey } from '@have/smrt';

@smrt({
  api: {
    exclude: ['delete'], // Soft delete only
    middleware: ['auth', 'validation']
  },
  cli: true,
  mcp: {
    include: ['list', 'get', 'create', 'update', 'search'],
    exclude: ['delete']
  }
})
export class Product extends BaseObject {
  // Basic product information
  name = text({ required: true, maxLength: 100 });
  description = text({ maxLength: 1000 });
  shortDescription = text({ maxLength: 200 });

  // Pricing and inventory
  price = decimal({ min: 0, required: true });
  compareAtPrice = decimal({ min: 0 }); // Original price for sales
  cost = decimal({ min: 0 }); // Cost basis for profit calculation

  // Inventory management
  sku = text({ unique: true, required: true, index: true });
  quantity = integer({ min: 0, default: 0 });
  trackInventory = boolean({ default: true });
  inStock = boolean({ default: true });

  // Organization and discovery
  category = text({ index: true });
  tags = json({ default: [] });
  barcode = text({ unique: true });

  // SEO and web presence
  slug = text({ unique: true, index: true });
  metaTitle = text({ maxLength: 60 });
  metaDescription = text({ maxLength: 160 });

  // Status and publishing
  status = text({ default: 'draft' }); // draft, active, archived
  isPublished = boolean({ default: false });
  publishedAt = datetime();

  // Relationships
  vendorId = foreignKey('Vendor');
  brandId = foreignKey('Brand');

  // Analytics and performance
  viewCount = integer({ default: 0 });
  salesCount = integer({ default: 0 });
  rating = decimal({ min: 0, max: 5, default: 0 });
  reviewCount = integer({ default: 0 });

  constructor(options: any) {
    super(options);
    Object.assign(this, options);
  }

  // Lifecycle hooks
  async beforeSave() {
    // Generate slug if not provided
    if (!this.slug && this.name) {
      this.slug = await this.generateSlug(this.name);
    }

    // Auto-generate SKU if not provided
    if (!this.sku) {
      this.sku = await this.generateSKU();
    }

    // Update stock status
    this.inStock = this.trackInventory ? this.quantity > 0 : true;

    // Update timestamps
    this.updated_at = new Date();
  }

  async afterCreate() {
    console.log(`Created product: ${this.name} (${this.sku})`);
  }

  // Business logic methods
  async publish() {
    this.status = 'active';
    this.isPublished = true;
    this.publishedAt = new Date();
    await this.save();
  }

  async unpublish() {
    this.isPublished = false;
    await this.save();
  }

  async adjustInventory(change: number, reason?: string) {
    if (!this.trackInventory) {
      throw new Error('Inventory tracking is disabled for this product');
    }

    this.quantity = Math.max(0, this.quantity + change);
    this.inStock = this.quantity > 0;

    // Log inventory change
    console.log(`Inventory adjusted for ${this.name}: ${change} (${reason || 'No reason provided'})`);

    await this.save();
  }

  async updatePrice(newPrice: number) {
    this.compareAtPrice = this.price; // Store old price
    this.price = newPrice;
    await this.save();
  }

  // AI-powered methods
  async optimizeTitle(): Promise<string> {
    const optimized = await this.do(`
      Optimize this product title for search and conversion:
      Current title: "${this.name}"
      Description: "${this.description}"
      Category: "${this.category}"

      Create a compelling, SEO-friendly title that:
      - Is under 100 characters
      - Includes key features/benefits
      - Appeals to target customers
      - Follows e-commerce best practices

      Return only the optimized title.
    `);

    return optimized.trim();
  }

  async generateDescription(): Promise<string> {
    return await this.do(`
      Create a compelling product description for:
      Product: ${this.name}
      Category: ${this.category}
      Price: $${this.price}
      Current description: ${this.description || 'None provided'}

      Write a description that:
      - Highlights key features and benefits
      - Addresses customer pain points
      - Includes relevant keywords
      - Is engaging and persuasive
      - Is 100-300 words long

      Return only the description text.
    `);
  }

  async suggestTags(): Promise<string[]> {
    const tags = await this.do(`
      Suggest relevant tags for this product:
      Name: ${this.name}
      Description: ${this.description}
      Category: ${this.category}

      Provide 5-10 tags that would help customers find this product.
      Include brand, features, use cases, and style attributes.
      Return as a JSON array of strings.
    `);

    try {
      return JSON.parse(tags);
    } catch {
      return tags.split(',').map(t => t.trim());
    }
  }

  async analyzeCompetitiveness(): Promise<string> {
    return await this.describe(`
      Analyze the competitiveness of this product:
      Name: ${this.name}
      Price: $${this.price}
      Category: ${this.category}
      Features: ${this.description}

      Consider pricing, features, market position, and value proposition.
      Provide insights on strengths, weaknesses, and opportunities.
    `);
  }

  async isPriceOptimal(): Promise<boolean> {
    return await this.is(`
      This product's price is optimal for its category and features:
      Product: ${this.name}
      Price: $${this.price}
      Category: ${this.category}
      Features: ${this.description}

      Consider market rates, value proposition, and competitive landscape.
    `);
  }

  async isReadyToPublish(): Promise<boolean> {
    return await this.is(`
      This product is ready to be published and sold:
      - Has a compelling name and description
      - Price is set appropriately
      - All required fields are filled
      - Images would be available (assume yes)
      - Inventory is properly configured
      - SEO fields are optimized
    `);
  }

  // Utility methods
  private async generateSlug(name: string): Promise<string> {
    const base = name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check for uniqueness
    let slug = base;
    let counter = 1;

    while (await this.constructor.findBySlug?.(slug)) {
      slug = `${base}-${counter}`;
      counter++;
    }

    return slug;
  }

  private async generateSKU(): Promise<string> {
    const category = this.category?.substring(0, 3).toUpperCase() || 'PRD';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();

    return `${category}-${timestamp}-${random}`;
  }

  // Analytics methods
  async incrementViewCount() {
    this.viewCount++;
    await this.save();
  }

  async recordSale() {
    this.salesCount++;
    if (this.trackInventory) {
      await this.adjustInventory(-1, 'Sale');
    }
  }

  getMargin(): number {
    return this.cost ? ((this.price - this.cost) / this.price) * 100 : 0;
  }

  getDiscountPercentage(): number {
    return this.compareAtPrice ?
      ((this.compareAtPrice - this.price) / this.compareAtPrice) * 100 : 0;
  }
}
```

### Step 2: Create the Collection Class

```typescript
import { BaseCollection } from '@have/smrt';
import { Product } from './product';

export class ProductCollection extends BaseCollection<Product> {
  static readonly _itemClass = Product;

  constructor(options: any) {
    super(options);
  }

  // Inventory management
  async findLowStock(threshold: number = 10) {
    return this.list({
      where: {
        trackInventory: true,
        'quantity <=': threshold,
        quantity: { $gt: 0 }
      },
      orderBy: 'quantity ASC'
    });
  }

  async findOutOfStock() {
    return this.list({
      where: {
        trackInventory: true,
        quantity: 0
      },
      orderBy: 'updated_at DESC'
    });
  }

  // Product discovery
  async findByCategory(category: string) {
    return this.list({
      where: { category },
      orderBy: 'name ASC'
    });
  }

  async findByPriceRange(min: number, max: number) {
    return this.list({
      where: {
        'price >=': min,
        'price <=': max,
        isPublished: true
      },
      orderBy: 'price ASC'
    });
  }

  async findPublished() {
    return this.list({
      where: { isPublished: true },
      orderBy: 'publishedAt DESC'
    });
  }

  async findFeatured() {
    return this.list({
      where: {
        isPublished: true,
        'rating >=': 4.0
      },
      orderBy: 'rating DESC',
      limit: 10
    });
  }

  // Bulk operations
  async bulkUpdatePrices(categoryFilter: string, adjustment: number) {
    const products = await this.list({
      where: { category: categoryFilter }
    });

    for (const product of products) {
      const newPrice = product.price * (1 + adjustment / 100);
      await product.updatePrice(Math.round(newPrice * 100) / 100);
    }

    return products;
  }

  async bulkPublish(productIds: string[]) {
    const products = await Promise.all(
      productIds.map(id => this.get(id))
    );

    for (const product of products.filter(Boolean)) {
      await product.publish();
    }

    return products;
  }

  // Analytics
  async getTopSellers(limit: number = 10) {
    return this.list({
      where: { isPublished: true },
      orderBy: 'salesCount DESC',
      limit
    });
  }

  async getMostViewed(limit: number = 10) {
    return this.list({
      where: { isPublished: true },
      orderBy: 'viewCount DESC',
      limit
    });
  }

  // AI-enhanced methods
  async searchSemantic(query: string, threshold: number = 7) {
    const products = await this.list({
      where: { isPublished: true }
    });

    const results = [];

    for (const product of products) {
      const relevance = await product.do(`
        Rate the relevance of this product to the search query "${query}"
        on a scale of 1-10. Consider the name, description, category, and tags.

        Product: ${product.name}
        Category: ${product.category}
        Description: ${product.description}
        Tags: ${product.tags}

        Respond with only the number.
      `);

      const score = parseInt(relevance);
      if (score >= threshold) {
        results.push({ product, relevance: score });
      }
    }

    return results
      .sort((a, b) => b.relevance - a.relevance)
      .map(r => r.product);
  }

  async analyzeInventory(): Promise<string> {
    const products = await this.list({});

    if (products.length === 0) {
      return 'No products in inventory';
    }

    const sample = products.slice(0, 5);
    const analysis = await products[0].do(`
      Analyze this product inventory and provide insights:

      Total products: ${products.length}
      Sample products:
      ${sample.map((p, i) => `${i + 1}. ${p.name} - $${p.price} - Qty: ${p.quantity} - Status: ${p.status}`).join('\n')}

      Provide insights on:
      - Inventory health and stock levels
      - Pricing patterns and opportunities
      - Product mix and categorization
      - Recommendations for optimization

      Format as a structured analysis.
    `);

    return analysis;
  }
}
```

### Step 3: Usage Examples

```typescript
// Create and configure a product
const product = new Product({
  name: 'Premium Wireless Headphones',
  description: 'High-quality wireless headphones with noise cancellation',
  price: 299.99,
  category: 'Electronics',
  quantity: 50
});

// AI-enhanced product setup
product.description = await product.generateDescription();
product.tags = await product.suggestTags();

// Validate before publishing
const isReady = await product.isReadyToPublish();
if (isReady) {
  await product.publish();
  console.log('Product published successfully!');
}

// Collection operations
const products = new ProductCollection({});

// Find products needing attention
const lowStock = await products.findLowStock(5);
const outOfStock = await products.findOutOfStock();

// AI-powered search
const searchResults = await products.searchSemantic('bluetooth headphones');

// Bulk operations
await products.bulkUpdatePrices('Electronics', 10); // 10% price increase

// Analytics
const topSellers = await products.getTopSellers();
const inventoryAnalysis = await products.analyzeInventory();
```

### Step 4: Generate APIs and Tools

```typescript
// Generate REST API
import { APIGenerator } from '@have/smrt/generators';

const apiGen = new APIGenerator({
  collections: [ProductCollection],
  outputDir: './api',
  includeSwagger: true,
  middleware: ['cors', 'auth', 'validation']
});

await apiGen.generate();

// Generate CLI tools
import { CLIGenerator } from '@have/smrt/generators';

const cliGen = new CLIGenerator({
  collections: [ProductCollection],
  outputDir: './cli',
  includeAI: true
});

await cliGen.generate();

// Generate MCP server
import { MCPGenerator } from '@have/smrt/generators';

const mcpGen = new MCPGenerator({
  collections: [ProductCollection],
  outputDir: './mcp',
  tools: ['list', 'get', 'create', 'update', 'search', 'analyze']
});

await mcpGen.generate();
```

This complete example demonstrates the full SMRT object lifecycle from definition through deployment, showcasing AI integration, business logic, and code generation capabilities.