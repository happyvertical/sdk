// Reexport your entry components here
import Root from './components/card/card.svelte';
import Content from './components/card/card-content.svelte';
import Header from './components/card/card-header.svelte';
import Description from './components/card/card-description.svelte';
import Footer from './components/card/card-footer.svelte';
import Title from './components/card/card-title.svelte';

export const Card = {
	Root,
	Content,
	Header,
	Description,
	Footer,
	Title
} as const;
