import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    {
      type: 'doc',
      id: 'index',
      label: 'Introduction',
    },
    {
      type: 'category',
      label: 'Getting Started',
      collapsed: false,
      items: [
        'getting-started/installation',
        'getting-started/your-first-agent',
        'getting-started/quick-wins',
      ],
    },
    {
      type: 'category',
      label: 'The SMRT Framework',
      collapsed: false,
      items: [
        'smrt-framework/overview',
        // Additional framework docs to be added
      ],
    },
    {
      type: 'category',
      label: 'Tutorials',
      collapsed: true,
      items: [
        'tutorials/build-research-agent',
        'tutorials/triple-purpose-architecture',
        'tutorials/module-federation-guide',
      ],
    },
    {
      type: 'category',
      label: 'Supporting Libraries',
      collapsed: true,
      items: [
        'supporting-libraries/content',
        'supporting-libraries/ai',
        'supporting-libraries/files',
        'supporting-libraries/spider',
        'supporting-libraries/pdf',
        'supporting-libraries/sql',
        'supporting-libraries/utils',
      ],
    },
    // API Reference temporarily disabled due to MDX compatibility issues with TypeDoc output
    // Will be re-enabled with proper TypeDoc-to-Docusaurus formatting
  ],
};

export default sidebars;