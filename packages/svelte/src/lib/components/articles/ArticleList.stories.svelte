<script module>
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import ArticleList from './ArticleList.svelte';
	import ArticleListItem from './ArticleListItem.svelte';

	// More on how to set up stories at: https://storybook.js.org/docs/writing-stories
	const { Story } = defineMeta({
		title: 'Article List',
		component: ArticleList,
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

<Story name="Article List Item Default">
	<ArticleListItem title="First Article" url="https://example.com/1" />
</Story>

<Story name="Article List Default">
	<ArticleList>
		<ArticleListItem title="First Article" url="https://example.com/1" />
		<ArticleListItem title="Second Article" url="https://example.com/2" />
	</ArticleList>
</Story>
