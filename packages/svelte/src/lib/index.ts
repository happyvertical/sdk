import Root from './components/card/card.svelte';
import Content from './components/card/card-content.svelte';
import Header from './components/card/card-header.svelte';
import Description from './components/card/card-description.svelte';
import Footer from './components/card/card-footer.svelte';
import Title from './components/card/card-title.svelte';

import './index.css';

export const Card: {
	Root: typeof Root;
	Content: typeof Content;
	Header: typeof Header;
	Description: typeof Description;
	Footer: typeof Footer;
	Title: typeof Title;
} = {
	Root,
	Content,
	Header,
	Description,
	Footer,
	Title
};
