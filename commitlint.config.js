/**
 * Commitlint configuration for conventional commits
 * https://commitlint.js.org/
 * https://www.conventionalcommits.org/
 */

export default {
  extends: ['@commitlint/config-conventional'],

  rules: {
    // Type enum - allowed commit types
    'type-enum': [
      2,
      'always',
      [
        'feat',      // New feature
        'fix',       // Bug fix
        'docs',      // Documentation changes
        'style',     // Code style changes (formatting, missing semicolons, etc.)
        'refactor',  // Code refactoring (neither fixes a bug nor adds a feature)
        'perf',      // Performance improvements
        'test',      // Adding or updating tests
        'build',     // Changes to build system or dependencies
        'ci',        // Changes to CI configuration files and scripts
        'chore',     // Other changes that don't modify src or test files
        'revert',    // Reverts a previous commit
      ],
    ],

    // Scope enum - optional scopes (package names)
    'scope-enum': [
      2,
      'always',
      [
        'accounting',
        'ai',
        'auth',
        'cache',
        'config',
        'content',
        'documents',
        'encryption',
        'files',
        'geo',
        'gnode',
        'images',
        'logger',
        'messages',
        'ocr',
        'pdf',
        'products',
        'smrt',
        'spider',
        'sql',
        'translator',
        'utils',
        'deps',      // Dependency updates
        'release',   // Release-related changes
      ],
    ],

    // Subject case - allow sentence-case, lowercase, kebab-case, etc.
    'subject-case': [
      2,
      'never',
      ['upper-case', 'pascal-case', 'start-case'],
    ],

    // Subject full stop - no period at the end
    'subject-full-stop': [2, 'never', '.'],

    // Subject empty - must have a subject
    'subject-empty': [2, 'never'],

    // Type case - must be lowercase
    'type-case': [2, 'always', 'lowercase'],

    // Type empty - must have a type
    'type-empty': [2, 'never'],

    // Header max length - limit to 100 characters
    'header-max-length': [2, 'always', 100],

    // Body leading blank - require blank line before body
    'body-leading-blank': [2, 'always'],

    // Footer leading blank - disabled to allow flexible commit message formatting
    'footer-leading-blank': [0, 'always'],

    // Body max length - disable for semantic-release commits with long changelogs
    'body-max-length': [0],

    // Body max line length - disable for semantic-release commits
    'body-max-line-length': [0],
  },
};
