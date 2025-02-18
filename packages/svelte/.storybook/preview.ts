import type { Preview } from '@storybook/svelte';
import '../src/app.css';
import '../src/lib/styles/index.css';

const preview: Preview = {
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i
			}
		}
	}
};

export default preview;
