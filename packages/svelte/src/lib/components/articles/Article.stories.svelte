<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import Article from './Article.svelte';

	const fakeContent = {
		title: 'Fake Article',
		body: 'This is a fake article',
		author: 'John Doe',
		date: '2021-01-01'
	};

	// More on how to set up stories at: https://storybook.js.org/docs/writing-stories
	const { Story } = defineMeta({
		title: 'Article',
		component: Article,
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

<Story name="Article Default">
	<Article content={fakeContent} />
</Story>
