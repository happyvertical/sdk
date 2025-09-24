import { themes as prismThemes } from 'prism-react-renderer';
const config = {
  title: 'Happy Vertical SDK',
  tagline: 'Build powerful, vertical AI agents in TypeScript',
  favicon: 'img/favicon.ico',
  // Production URL - GitHub Pages
  url: 'https://happyvertical.github.io',
  baseUrl: '/sdk/',
  // GitHub pages deployment config
  organizationName: 'happyvertical',
  projectName: 'sdk',
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
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
      },
    ],
  ],
  plugins: [
    './plugins/esm-resolver',
    [
      'docusaurus-plugin-typedoc',
      {
        entryPoints: [
          '../packages/ai/src/index.ts',
          '../packages/files/src/index.ts',
          '../packages/pdf/src/index.ts',
          '../packages/spider/src/index.ts',
          '../packages/sql/src/index.ts',
          '../packages/utils/src/index.ts',
          '../packages/ocr/src/index.ts',
          '../packages/smrt/src/index.ts',
        ],
        tsconfig: './typedoc.tsconfig.json',
        out: 'api',
        readme: 'none',
        sidebar: {
          autoConfiguration: true,
          pretty: true,
        },
        watch: process.env.TYPEDOC_WATCH === 'true',
        excludePrivate: true,
        excludeProtected: true,
        excludeExternals: true,
        excludeInternal: true,
        disableSources: false,
        plugin: ['typedoc-plugin-markdown'],
      },
    ],
  ],
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
        { to: '/blog', label: 'Blog', position: 'left' },
        {
          type: 'docsVersionDropdown',
          position: 'right',
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
              to: '/docs',
            },
            {
              label: 'Getting Started',
              to: '/docs/getting-started/installation',
            },
            {
              label: 'Tutorials',
              to: '/docs/tutorials/build-research-agent',
            },
          ],
        },
        {
          title: 'Framework',
          items: [
            {
              label: 'SMRT Core',
              to: '/docs/smrt-framework/overview',
            },
            {
              label: 'Code Generators',
              to: '/docs/smrt-framework/code-generators',
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
            {
              label: 'Discord',
              href: 'https://discord.gg/smrt-agents',
            },
            {
              label: 'Twitter',
              href: 'https://twitter.com/smrtframework',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Blog',
              to: '/blog',
            },
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
  },
};
export default config;
//# sourceMappingURL=docusaurus.config.js.map
