<script lang="ts">
	export let content: {
		title: string;
		body: string;
		author: string;
		date: string;
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

<div class="article">
	<h1>{content.title}</h1>
	<p>{content.author}</p>
	<p>{content.date}</p>
	<p>{content.body}</p>
</div>

<style>
	.article {
		list-style: none;
		padding: 0;
		margin: 0;
	}
</style>
