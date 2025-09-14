<script lang="ts">
  import type { ProductData } from '../types.js';
  
  interface Props {
    product: ProductData;
    onEdit?: (product: ProductData) => void;
    onDelete?: (id: string) => void;
  }
  
  let { product, onEdit, onDelete }: Props = $props();
</script>

<div class="product-card">
  <div class="product-header">
    <h3 class="product-name">{product.name}</h3>
    <div class="product-price">${product.price?.toFixed(2)}</div>
  </div>
  
  {#if product.description}
    <p class="product-description">{product.description}</p>
  {/if}
  
  <div class="product-meta">
    <div class="stock-status" class:in-stock={product.inStock} class:out-of-stock={!product.inStock}>
      {product.inStock ? 'In Stock' : 'Out of Stock'}
    </div>
    
    {#if product.tags && product.tags.length > 0}
      <div class="product-tags">
        {#each product.tags as tag}
          <span class="tag">{tag}</span>
        {/each}
      </div>
    {/if}
  </div>
  
  <div class="product-actions">
    {#if onEdit}
      <button type="button" onclick={() => onEdit?.(product)} class="edit-btn">
        Edit
      </button>
    {/if}
    
    {#if onDelete}
      <button type="button" onclick={() => onDelete?.(product.id)} class="delete-btn">
        Delete
      </button>
    {/if}
  </div>
</div>

<style>
  .product-card {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 1rem;
    background: white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: box-shadow 0.2s;
  }
  
  .product-card:hover {
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }
  
  .product-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.5rem;
  }
  
  .product-name {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: #1f2937;
  }
  
  .product-price {
    font-size: 1.25rem;
    font-weight: 700;
    color: #059669;
  }
  
  .product-description {
    margin: 0.5rem 0;
    color: #6b7280;
    font-size: 0.875rem;
    line-height: 1.4;
  }
  
  .product-meta {
    margin: 0.75rem 0;
  }
  
  .stock-status {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }
  
  .in-stock {
    background: #d1fae5;
    color: #065f46;
  }
  
  .out-of-stock {
    background: #fee2e2;
    color: #991b1b;
  }
  
  .product-tags {
    margin-top: 0.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  
  .tag {
    background: #f3f4f6;
    color: #374151;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
  }
  
  .product-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid #f3f4f6;
  }
  
  .edit-btn, .delete-btn {
    padding: 0.375rem 0.75rem;
    border-radius: 4px;
    font-size: 0.875rem;
    font-weight: 500;
    border: 1px solid;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .edit-btn {
    background: #f9fafb;
    border-color: #d1d5db;
    color: #374151;
  }
  
  .edit-btn:hover {
    background: #f3f4f6;
  }
  
  .delete-btn {
    background: #fef2f2;
    border-color: #fecaca;
    color: #dc2626;
  }
  
  .delete-btn:hover {
    background: #fee2e2;
  }
</style>