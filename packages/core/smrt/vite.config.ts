import { resolve } from 'node:path';
import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import pkg from './package.json' assert { type: 'json' };

// Dynamically generate entry points from package.json exports
// This ensures build output always matches the public API surface
const entryPoints = Object.fromEntries(
	Object.entries(pkg.exports as Record<string, string>).map(([key, value]) => {
		// Convert export key to entry name: '.' → 'index', './foo' → 'foo'
		const entryKey = key === '.' ? 'index' : key.replace(/^\.\//, '');

		// Convert dist path to source path: './dist/foo.js' → 'src/foo.ts'
		const sourcePath = value
			.replace(/^\.\/dist\//, 'src/')
			.replace(/\.js$/, '.ts');

		return [entryKey, resolve(__dirname, sourcePath)];
	}),
);

// External packages: deps, peer deps, and Node.js builtins
const externalPackages = [
	...builtinModules,
	...builtinModules.map((m) => `node:${m}`),
	...Object.keys(pkg.dependencies || {}),
	...Object.keys(pkg.peerDependencies || {}),
];

export default defineConfig({
	build: {
		lib: {
			entry: entryPoints,
			formats: ['es'],
		},
		rollupOptions: {
			external: (id) => {
				// Externalize Node.js builtins and all dependencies
				return externalPackages.some(
					(pkgName) => id === pkgName || id.startsWith(`${pkgName}/`),
				);
			},
			output: {
				dir: 'dist',
				format: 'es',
				// Create bundled entry points without preserving every module
				preserveModules: false,
				// Entry points use their defined names from package.json
				entryFileNames: '[name].js',
				// Shared code goes into chunks directory
				chunkFileNames: 'chunks/[name]-[hash].js',
			},
		},
		emptyOutDir: true, // Clean dist before build
		minify: false, // Keep code readable for library usage
		sourcemap: true,
		target: 'es2022',
		reportCompressedSize: false,
	},
	plugins: [
		dts({
			outDir: 'dist',
			include: ['src/**/*.ts'],
			exclude: [
				// Test files
				'src/**/*.test.ts',
				'src/**/*.spec.ts',
				'src/**/*.test.*.ts',
				// Exclude config files
				'**/*.config.ts',
				'**/*.config.js',
				// Don't process existing declaration files
				'src/**/*.d.ts',
				// Exclude compiled .js files in source directory
				'src/**/*.js',
			],
			insertTypesEntry: false, // We handle this in package.json
			rollupTypes: false, // Disable API Extractor to handle virtual modules
			tsconfigPath: resolve(__dirname, 'tsconfig.build.json'),
		}),
	],
	resolve: {
		alias: {
			'@have/utils': resolve(__dirname, '../utils/src'),
			'@have/files': resolve(__dirname, '../files/src'),
			'@have/sql': resolve(__dirname, '../sql/src'),
			'@have/ai': resolve(__dirname, '../ai/src'),
		},
	},
});
