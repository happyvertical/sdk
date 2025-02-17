<script lang="ts">


	import Card from '../cards/Card.svelte';
	import CardTitle from '../cards/CardTitle.svelte';
	import CardContent from '../cards/CardContent.svelte';
	import CardFooter from '../cards/CardFooter.svelte';
	import CardHeader from '../cards/CardHeader.svelte';
	import CardDescription from '../cards/CardDescription.svelte';

	export let title: string = ''; // Initialize as an empty array
	export let url: string = ''; // Initialize as an empty array
	export let publishDate: string | Date = new Date();
	export let category: string = '';
	export let categoryUrl: string = '';
	// Example news data structure (adapt as needed)
	// newsItems = [
	//   { id: 1, title: 'Headline 1', url: '/article/1', description: 'Short summary...', date: '2024-10-27' },
	//   { id: 2, title: 'Headline 2', url: '/article/2', description: 'Another summary...', date: '2024-10-26' },
	// ];

	// If fetching data:
	// onMount(async () => {
	//   const response = await fetch('/api/news');
	//   newsItems = await response.json();
	// });

	// Format the date nicely, handling both string and Date types
	$: formattedDate = (typeof publishDate === 'string' ? new Date(publishDate) : publishDate).toLocaleDateString(
		'en-US',
		{
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		}
	);
</script>

<Card class="article-list-item">
	<CardContent>
		<div class="flex flex-col gap-2">
			<CardTitle><a href={url} class="hover:underline">{title}</a></CardTitle>
			<div class="flex justify-between items-center text-xs text-muted-foreground">
				<time>{formattedDate}</time>
				<a href={categoryUrl} class="hover:underline">{category}</a>
			</div>
		</div>
	</CardContent>
</Card>

<style>

</style>
