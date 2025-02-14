/** @type {import('@sveltejs/package').Config} */
export default {
	excludeFiles: (filepath) => {
		return filepath.endsWith('.test.ts') || filepath.endsWith('.spec.ts');
	}
};
