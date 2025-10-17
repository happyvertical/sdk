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
      label: '@have/ai',
      link: { type: 'doc', id: 'ai' },
      collapsed: true,
      items: [
        { type: 'link', label: 'Overview', href: '/ai#overview' },
        { type: 'link', label: 'Quick Start', href: '/ai#quick-start' },
        { type: 'link', label: 'Supported Providers', href: '/ai#supported-providers' },
        { type: 'link', label: 'Integration with SMRT', href: '/ai#integration-with-smrt' },
      ],
    },
    {
      type: 'category',
      label: '@have/cache',
      link: { type: 'doc', id: 'cache' },
      collapsed: true,
      items: [
        { type: 'link', label: 'Overview', href: '/cache#overview' },
        { type: 'link', label: 'Quick Start', href: '/cache#quick-start' },
        { type: 'link', label: 'Backend Comparison', href: '/cache#backend-comparison' },
      ],
    },
    {
      type: 'category',
      label: '@have/config',
      link: { type: 'doc', id: 'config' },
      collapsed: true,
      items: [
        { type: 'link', label: 'Overview', href: '/config#overview' },
        { type: 'link', label: 'Quick Start', href: '/config#quick-start' },
        { type: 'link', label: 'Configuration Examples', href: '/config#configuration-file-examples' },
      ],
    },
    {
      type: 'category',
      label: '@have/documents',
      link: { type: 'doc', id: 'documents' },
      collapsed: true,
      items: [
        { type: 'link', label: 'Overview', href: '/documents#overview' },
        { type: 'link', label: 'Quick Start', href: '/documents#quick-start' },
        { type: 'link', label: 'PDF Processing', href: '/documents#pdf-processing' },
        { type: 'link', label: 'HTML Processing', href: '/documents#html-processing' },
        { type: 'link', label: 'Markdown Processing', href: '/documents#markdown-processing' },
      ],
    },
    {
      type: 'category',
      label: '@have/files',
      link: { type: 'doc', id: 'files' },
      collapsed: true,
      items: [
        { type: 'link', label: 'Overview', href: '/files#overview' },
        { type: 'link', label: 'Quick Start', href: '/files#quick-start' },
        { type: 'link', label: 'File Operations', href: '/files#file-operations' },
        { type: 'link', label: 'Integration Examples', href: '/files#integration-examples' },
      ],
    },
    {
      type: 'category',
      label: '@have/geo',
      link: { type: 'doc', id: 'geo' },
      collapsed: true,
      items: [
        { type: 'link', label: 'Overview', href: '/geo#overview' },
        { type: 'link', label: 'Quick Start', href: '/geo#quick-start' },
        { type: 'link', label: 'Location Lookup', href: '/geo#location-lookup' },
        { type: 'link', label: 'Reverse Geocoding', href: '/geo#reverse-geocoding' },
        { type: 'link', label: 'Provider Comparison', href: '/geo#provider-comparison' },
      ],
    },
    {
      type: 'category',
      label: '@have/logger',
      link: { type: 'doc', id: 'logger' },
      collapsed: true,
      items: [
        { type: 'link', label: 'Overview', href: '/logger#overview' },
        { type: 'link', label: 'Quick Start', href: '/logger#quick-start' },
        { type: 'link', label: 'Log Levels', href: '/logger#log-levels' },
        { type: 'link', label: 'Context Tracking', href: '/logger#context-tracking' },
        { type: 'link', label: 'Signal Integration', href: '/logger#signal-integration' },
      ],
    },
    {
      type: 'category',
      label: '@have/ocr',
      link: { type: 'doc', id: 'ocr' },
      collapsed: true,
      items: [
        { type: 'link', label: 'Overview', href: '/ocr#overview' },
        { type: 'link', label: 'Quick Start', href: '/ocr#quick-start' },
        { type: 'link', label: 'Provider Selection', href: '/ocr#provider-selection' },
        { type: 'link', label: 'Language Support', href: '/ocr#language-support' },
        { type: 'link', label: 'Provider Comparison', href: '/ocr#provider-comparison' },
      ],
    },
    {
      type: 'category',
      label: '@have/pdf',
      link: { type: 'doc', id: 'pdf' },
      collapsed: true,
      items: [
        { type: 'link', label: 'Overview', href: '/pdf#overview' },
        { type: 'link', label: 'Quick Start', href: '/pdf#quick-start' },
        { type: 'link', label: 'File Operations', href: '/pdf#file-operations' },
        { type: 'link', label: 'Integration Examples', href: '/pdf#integration-examples' },
      ],
    },
    {
      type: 'category',
      label: '@have/spider',
      link: { type: 'doc', id: 'spider' },
      collapsed: true,
      items: [
        { type: 'link', label: 'Overview', href: '/spider#overview' },
        { type: 'link', label: 'Quick Start', href: '/spider#quick-start' },
        { type: 'link', label: 'File Operations', href: '/spider#file-operations' },
        { type: 'link', label: 'Integration Examples', href: '/spider#integration-examples' },
      ],
    },
    {
      type: 'category',
      label: '@have/sql',
      link: { type: 'doc', id: 'sql' },
      collapsed: true,
      items: [
        { type: 'link', label: 'Overview', href: '/sql#overview' },
        { type: 'link', label: 'Quick Start', href: '/sql#quick-start' },
        { type: 'link', label: 'File Operations', href: '/sql#file-operations' },
        { type: 'link', label: 'Integration Examples', href: '/sql#integration-examples' },
      ],
    },
    {
      type: 'category',
      label: '@have/translator',
      link: { type: 'doc', id: 'translator' },
      collapsed: true,
      items: [
        { type: 'link', label: 'Overview', href: '/translator#overview' },
        { type: 'link', label: 'Quick Start', href: '/translator#quick-start' },
        { type: 'link', label: 'Provider Configuration', href: '/translator#provider-configuration' },
        { type: 'link', label: 'Language Detection', href: '/translator#language-detection' },
        { type: 'link', label: 'Batch Translation', href: '/translator#batch-translation' },
        { type: 'link', label: 'Provider Comparison', href: '/translator#provider-comparison' },
      ],
    },
    {
      type: 'category',
      label: '@have/utils',
      link: { type: 'doc', id: 'utils' },
      collapsed: true,
      items: [
        { type: 'link', label: 'Overview', href: '/utils#overview' },
        { type: 'link', label: 'Quick Start', href: '/utils#quick-start' },
        { type: 'link', label: 'File Operations', href: '/utils#file-operations' },
        { type: 'link', label: 'Integration Examples', href: '/utils#integration-examples' },
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
