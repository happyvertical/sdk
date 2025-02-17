import type { Preview } from '@storybook/svelte';
import '../src/lib/styles/index.css'; // This should be your main CSS file that includes Tailwind

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
