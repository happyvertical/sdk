/**
 * Multi-mode Vite configuration for SMRT triple-purpose template
 *
 * Supports three build modes:
 * - library: NPM package build with multiple entry points
 * - federation: Module federation server for runtime component sharing
 * - standalone: Complete standalone application
 */
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { smrtPlugin } from '@have/smrt/vite-plugin';
import federation from '@originjs/vite-plugin-federation';
import federationConfig from './federation.config.js';
export default defineConfig(({ command, mode }) => {
    // Base configuration shared by all modes
    const baseConfig = {
        plugins: [
            svelte(),
            smrtPlugin({
                include: ['src/lib/models/**/*.ts'],
                exclude: ['**/*.test.ts', '**/*.spec.ts'],
                baseClasses: ['BaseObject'],
                generateTypes: true,
                watch: command === 'serve',
                hmr: command === 'serve',
                typeDeclarationsPath: 'src/lib/types'
            })
        ],
        resolve: {
            alias: {
                '$lib': '/src/lib'
            }
        }
    };
    // Mode-specific configurations
    switch (mode) {
        case 'library':
            return {
                ...baseConfig,
                build: {
                    target: 'esnext',
                    lib: {
                        entry: {
                            index: './src/lib/index.ts',
                            models: './src/lib/models/index.ts',
                            components: './src/lib/components/index.ts',
                            stores: './src/lib/stores/index.ts',
                            generated: './src/lib/generated/index.ts',
                            utils: './src/lib/utils/index.ts'
                        },
                        formats: ['es', 'cjs']
                    },
                    rollupOptions: {
                        external: [
                            'svelte',
                            'svelte/internal',
                            '@have/smrt',
                            '@smrt/client',
                            '@smrt/routes',
                            '@smrt/types',
                            '@smrt/manifest',
                            '@smrt/mcp'
                        ],
                        output: {
                            globals: {
                                svelte: 'Svelte'
                            }
                        }
                    },
                    outDir: 'dist/lib'
                }
            };
        case 'federation':
            return {
                plugins: [
                    svelte(),
                    // SMRT plugin disabled for federation builds to avoid Node.js dependencies
                    // UI components now use standalone types from src/lib/types.ts
                    federation(federationConfig)
                ],
                resolve: {
                    alias: {
                        '$lib': '/src/lib'
                    }
                },
                build: {
                    target: 'esnext',
                    rollupOptions: {
                        external: [
                            '@have/smrt',
                            '@have/files',
                            '@have/spider',
                            '@have/sql',
                            '@have/pdf',
                            '@have/ai',
                            '@have/utils',
                            // SMRT virtual modules - external for federation builds
                            '@smrt/client',
                            '@smrt/types',
                            '@smrt/routes',
                            '@smrt/manifest',
                            '@smrt/mcp'
                        ]
                    },
                    outDir: 'dist/federation'
                },
                server: {
                    port: 3002,
                    host: true
                },
                preview: {
                    port: 3002,
                    host: true
                }
            };
        case 'standalone':
            return {
                ...baseConfig,
                build: {
                    target: 'esnext',
                    rollupOptions: {
                        input: './src/app/main.ts',
                        external: [
                            '@have/smrt',
                            '@have/files',
                            '@have/spider',
                            '@have/sql',
                            '@have/pdf',
                            '@have/ai',
                            '@have/utils'
                        ]
                    },
                    outDir: 'dist/app'
                },
                server: {
                    port: 3001,
                    host: true
                },
                preview: {
                    port: 3001,
                    host: true
                }
            };
        default:
            // Development mode - support all features
            return {
                ...baseConfig,
                plugins: [
                    ...baseConfig.plugins,
                    // Add federation plugin in development for testing
                    federation(federationConfig)
                ],
                server: {
                    port: 3001,
                    host: true
                }
            };
    }
});
//# sourceMappingURL=vite.config.js.map