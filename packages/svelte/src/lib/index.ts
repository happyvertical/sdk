import CardRoot from './components/cards/Card.svelte';
import Content from './components/cards/CardContent.svelte';
import Header from './components/cards/CardHeader.svelte';
import Description from './components/cards/CardDescription.svelte';
import Footer from './components/cards/CardFooter.svelte';
import Title from './components/cards/CardTitle.svelte';

import ArticleRoot from './components/articles/Article.svelte';
import ArticleListRoot from './components/articles/ArticleList.svelte';
import ArticleListItem from './components/articles/ArticleListItem.svelte';
export const Card: {
	Root: typeof CardRoot;
	Content: typeof Content;
	Header: typeof Header;
	Description: typeof Description;
	Footer: typeof Footer;
	Title: typeof Title;
} = {
	Root: CardRoot,
	Content,
	Header,
	Description,
	Footer,
	Title
};

export const Article: {
	Root: typeof CardRoot;
} = {
	Root: CardRoot
};

export const ArticleList: {
	Root: typeof ArticleListRoot;
	Item: typeof ArticleListItem;
} = {
	Root: ArticleListRoot,
	Item: ArticleListItem
};
