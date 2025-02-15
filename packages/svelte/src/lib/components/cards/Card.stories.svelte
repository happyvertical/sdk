<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Card from './Card.svelte';
	import CardTitle from './CardTitle.svelte';
	import CardContent from './CardContent.svelte';
	import CardFooter from './CardFooter.svelte';
	import CardHeader from './CardHeader.svelte';
	import CardDescription from './CardDescription.svelte';

	// More on how to set up stories at: https://storybook.js.org/docs/writing-stories
	const { Story } = defineMeta({
		title: 'Card',
		component: Card,
		// This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
		tags: ['autodocs']
		// parameters: {
		// 	// More on how to position stories at: https://storybook.js.org/docs/configure/story-layout
		// 	layout: 'fullscreen'
		// },
		// args: {
		// 	onLogin: fn(),
		// 	onLogout: fn(),
		// 	onCreateAccount: fn()
		// },
		// argTypes: {
		// 	tag: {
		// 		control: 'select',
		// 		options: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
		// 	},
		// 	class: {
		// 		control: 'text'
		// 	}
		// }
	});
</script>

<Story name="Card Title Default">
	<Card>
		<CardTitle>Default h3 Title</CardTitle>
		<CardHeader>This is a card header</CardHeader>
		<CardContent>
			<p>This is a card content</p>
		</CardContent>
		<CardFooter>
			<p>This is a card footer</p>
		</CardFooter>
		<CardDescription>This is a card description</CardDescription>
	</Card>
</Story>
