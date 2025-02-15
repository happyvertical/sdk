<script lang="ts">
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

<div class="article-list">
	<!-- <div>Debug output:</div>
	<pre>slots: {JSON.stringify($$slots, null, 2)}</pre>
	<pre>props: {JSON.stringify($$props, null, 2)}</pre>
	<pre>restProps: {JSON.stringify($$restProps, null, 2)}</pre>
	<hr /> -->
	<slot />
</div>

<style>
	.article-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}
</style>
