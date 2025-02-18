<script lang="ts">
	import Card from '../cards/Card.svelte';
	import CardTitle from '../cards/CardTitle.svelte';
	import CardContent from '../cards/CardContent.svelte';
	import CardFooter from '../cards/CardFooter.svelte';
	import CardHeader from '../cards/CardHeader.svelte';
	import CardDescription from '../cards/CardDescription.svelte';

	export let title: string = ''; // Initialize as an empty array
	export let url: string = ''; // Initialize as an empty array
	export let description: string = ''; // Initialize as an empty array
	export let date: string = ''; // Initialize as an empty array
	export let category: string = ''; // Initialize as an empty array
	export let categoryUrl: string = ''; // Initialize as an empty array
	export let author: string = ''; // Initialize as an empty array
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
</script>

<Card class="article-list-item">
	<CardTitle><a href={url}>{title}</a></CardTitle>
	<CardDescription>{description}</CardDescription>
	<CardFooter>
		{date}
		<a href={categoryUrl}>{category}</a>
		{author}
	</CardFooter>

	<!-- <CardHeader>This is a card header</CardHeader>
	<CardContent>
		<p>This is a card content</p>
	</CardContent>
	<CardDescription>This is a card description</CardDescription> -->
</Card>
