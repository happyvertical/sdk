/**
 * SMRT Template Client
 * 
 * Demonstrates auto-generated TypeScript client from SMRT objects.
 * No manual client code needed - everything is generated from @smrt() decorated classes.
 */

import createClient from '@smrt/client'; // Virtual module from Vite plugin
import type { ProductData, CategoryData } from '@smrt/types'; // Virtual module from Vite plugin

async function demonstrateClient() {
  console.log('🔌 Creating auto-generated API client...');
  
  // Create client pointing to local server
  const api = createClient('http://localhost:3000/api/v1');
  
  try {
    console.log('\n📦 Testing Product operations:');
    
    // Create a product
    const newProduct: Partial<ProductData> = {
      name: 'Demo Product',
      description: 'A product created by the auto-generated client',
      price: 29.99,
      inStock: true,
      tags: ['demo', 'auto-generated']
    };
    
    console.log('Creating product:', newProduct);
    const createdProduct = await api.product.create(newProduct);
    console.log('✅ Created:', createdProduct);
    
    // List products
    console.log('\n📋 Listing all products:');
    const products = await api.product.list();
    console.log('Products:', products);
    
    // Get specific product
    if (createdProduct?.id) {
      console.log(`\n🔍 Getting product ${createdProduct.id}:`);
      const product = await api.product.get(createdProduct.id);
      console.log('Product:', product);
      
      // Update product
      console.log('\n✏️ Updating product:');
      const updatedProduct = await api.product.update(createdProduct.id, {
        price: 39.99,
        description: 'Updated description'
      });
      console.log('Updated:', updatedProduct);
    }
    
    console.log('\n🏷️ Testing Category operations:');
    
    // Create a category
    const newCategory: Partial<CategoryData> = {
      name: 'Demo Category',
      description: 'A category created by the auto-generated client',
      active: true
    };
    
    console.log('Creating category:', newCategory);
    const createdCategory = await api.category.create(newCategory);
    console.log('✅ Created:', createdCategory);
    
    // List categories
    console.log('\n📋 Listing all categories:');
    const categories = await api.category.list();
    console.log('Categories:', categories);
    
  } catch (error) {
    console.error('❌ Client error:', error);
  }
}

// Run demonstration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateClient().catch(console.error);
}

export { demonstrateClient };