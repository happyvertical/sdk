import type * as Preset from '@docusaurus/preset-classic';
import type { Config } from '@docusaurus/types';
import { themes as prismThemes } from 'prism-react-renderer';

const config: Config = {
  title: 'Happy Vertical SDK',
  tagline: 'Build powerful, vertical AI agents in TypeScript',
  favicon: 'img/favicon.ico',

  // Production URL - GitHub Pages
  url: 'https://happyvertical.github.io',
  baseUrl: '/sdk/',

  // GitHub pages deployment config
  organizationName: 'happyvertical',
  projectName: 'sdk',

  onBrokenLinks: 'warn',

  // Markdown configuration
  // Use 'detect' to allow CommonMark for TypeDoc-generated API docs
  // while still supporting MDX for hand-written docs
  markdown: {
    format: 'detect',
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  // Internationalization
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          path: 'content',
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/happyvertical/sdk/tree/main/docs/',
          showLastUpdateTime: true,
          showLastUpdateAuthor: true,
          remarkPlugins: [],
          rehypePlugins: [],
        },
        blog: {
          showReadingTime: true,
          blogSidebarCount: 'ALL',
          blogSidebarTitle: 'All posts',
          feedOptions: {
            type: 'all',
            copyright: `Copyright © ${new Date().getFullYear()} HAppy VErtical`,
          },
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [],

  themes: ['@docusaurus/theme-mermaid'],

  themeConfig: {
    // Social card
    image: 'img/smrt-social-card.jpg',

    navbar: {
      title: 'Happy Vertical SDK',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/happyvertical/sdk/releases',
          label: 'Changelog',
          position: 'left',
        },
        {
          href: 'https://github.com/happyvertical/sdk',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },

    footer: {
      style: 'dark',
      links: [
        {
          title: 'Learn',
          items: [
            {
              label: 'Introduction',
              to: '/',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/happyvertical/sdk',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Changelog',
              href: 'https://github.com/happyvertical/sdk/releases',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} HAppy VErtical. Built with Docusaurus.`,
    },

    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'typescript', 'javascript'],
    },

    mermaid: {
      theme: { light: 'neutral', dark: 'dark' },
    },

    algolia: {
      appId: 'YOUR_APP_ID',
      apiKey: 'YOUR_API_KEY',
      indexName: 'smrt-docs',
      contextualSearch: true,
    },

    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },

    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: true,
      },
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
