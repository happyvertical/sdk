import { getPackageDocs } from '../registry.js';

/**
 * Get full AGENT.md documentation for a specific package
 *
 * @param packageName - Name of the package (e.g., 'ai', 'sql', 'spider')
 * @returns Package documentation content
 */
export async function getDocs(packageName: string) {
  const docs = await getPackageDocs(packageName);

  if (!docs) {
    return {
      content: [
        {
          type: 'text',
          text: `Package "${packageName}" not found. Use list-packages to see available packages.`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: docs,
      },
    ],
  };
}
