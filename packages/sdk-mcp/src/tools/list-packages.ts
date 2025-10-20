import { getAllPackages } from '../registry.js';

/**
 * List all SDK packages with their descriptions
 *
 * @returns Object with packages array containing name and description
 */
export async function listPackages() {
  const packages = await getAllPackages();

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            packages: packages.map((pkg) => ({
              name: pkg.name,
              description: pkg.description,
              keywords: pkg.keywords,
            })),
            total: packages.length,
          },
          null,
          2,
        ),
      },
    ],
  };
}
