const sidebars = {
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
    // API Reference - will be re-enabled after fixing typedoc-docusaurus integration
    // {
    //   type: 'category',
    //   label: 'API Reference',
    //   collapsed: true,
    //   link: {
    //     type: 'generated-index',
    //     title: 'API Reference',
    //     description: 'Complete API documentation for all SDK packages',
    //   },
    //   items: require('./api/typedoc-sidebar.cjs'),
    // },
  ],
};
export default sidebars;
//# sourceMappingURL=sidebars.js.map
