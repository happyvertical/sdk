<script lang="ts">
	export let content: {
		title: string;
		body: string;
		author: string;
		date: string;
		categoryUrl?: string;
		category?: string;
	};
	// import { onMount } from 'svelte';

	// onMount(() => {
	// 	console.log('Component mounted');
	// 	console.log('Slots:', $$slots);
	// 	// @ts-ignore - accessing internal properties for debugging
	// 	console.log('Component internals:', {
	// 		slots: $$slots,
	// 		props: $$props,
	// 		restProps: $$restProps
	// 	});
	// });
</script>

<article class="max-w-5xl mx-auto px-4 py-8">
		
		<!-- Article Header -->
		<header class="border-b border-gray-200 pb-6 w-full">
			<h1 class="text-4xl font-bold text-gray-900 mb-6">{content.title}</h1>
			
			<div class="meta-container text-sm text-gray-600">
				
				<div class="meta-item">
					<time datetime={content.date}>{content.date}</time>
				</div>

				{#if content.category}
					<div class="meta-item">
						<a href={content.categoryUrl} class="text-blue-600 hover:text-blue-800">
							{content.category}
						</a>
					</div>
				{/if}
<!-- 
				{#if content.author}
					<div class="meta-item">
						<span>{content.author}</span>
					</div>
				{/if} -->

			</div>
		</header>

		<!-- Article Body -->
		<div class="prose prose-lg max-w-none mt-6">
			{@html content.body}
		</div>
</article>
<style>
	.header {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
	}

	.article {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	/* Add new styles */
	.meta-container {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		align-items: center;
	}

	.meta-item {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		white-space: nowrap;
	}
</style>

