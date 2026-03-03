# @happyvertical/projects

Standardized project management interface for GitHub Projects, Jira, ZenHub, and Linear.

## Installation

```bash
pnpm add @happyvertical/projects @happyvertical/repos
```

## Claude Code Context

Install Claude Code context files for AI-assisted development:

```bash
npx have-projects-context
```

This copies the package's `CLAUDE.md` documentation and `.claude-meta.json` metadata to your project's `.claude/` directory, enabling Claude to provide better assistance when working with this package.

## Usage

### Basic Example

```typescript
import { getProject } from '@happyvertical/projects';
import { getRepository } from '@happyvertical/repos';

// Get repository to retrieve issue node IDs
const repo = await getRepository({
  type: 'github',
  owner: 'happyvertical',
  repo: 'sdk',
  token: process.env.GITHUB_TOKEN
});

// Get project with status field configuration
const project = await getProject({
  type: 'github',
  projectId: 'PVT_kwDOB9Y8ns4A8-TY',
  token: process.env.GITHUB_TOKEN,
  statusFieldId: 'PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY',
  statusOptions: {
    'New': 'option-id-1',
    'Backlog': 'option-id-2',
    'In Progress': 'option-id-3',
    'Done': 'option-id-4'
  }
});

// Add issue to project
const issue = await repo.getIssue(352);
const item = await project.addItem(issue.id);

// Update status
await project.updateItemStatus(item.id, 'In Progress');
```

### Kanban Workflow

```typescript
// List all items
const items = await project.listItems();

// Get available statuses
const statuses = await project.listStatuses();

// Move item through workflow
await project.updateItemStatus(itemId, 'Ready');
await project.updateItemStatus(itemId, 'In Progress');
await project.updateItemStatus(itemId, 'Review');
await project.updateItemStatus(itemId, 'Done');
```

### Custom Field Management

```typescript
// List all project fields
const fields = await project.listFields();

// Update custom field
const priorityField = fields.find(f => f.name === 'Priority');
if (priorityField) {
  await project.updateItemField(itemId, priorityField.id, 'high-priority-option-id');
}
```

## API Reference

### Factory Function

#### `getProject(options)`

Creates a project management client instance.

**Parameters:**
- `options: ProjectConfig | IProject` - Project configuration or existing instance

**Returns:** `Promise<IProject>`

**Example:**
```typescript
const project = await getProject({
  type: 'github',
  projectId: 'PVT_kwDOB9Y8ns4A8-TY',
  token: process.env.GITHUB_TOKEN,
  statusFieldId: 'PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY',
  statusOptions: {
    'New': 'option-id-1',
    'Backlog': 'option-id-2',
    'In Progress': 'option-id-3',
    'Done': 'option-id-4'
  }
});
```

### IProject Interface

#### Project Information

##### `getProject(): Promise<Project>`

Get project details including fields and statuses.

**Returns:** Project metadata with all fields and status options

#### Item Management

##### `addItem(contentId: string): Promise<ProjectItem>`

Add an issue or pull request to the project.

**Parameters:**
- `contentId: string` - Node ID of the issue or PR (from @happyvertical/repos)

**Returns:** Created project item

##### `removeItem(itemId: string): Promise<void>`

Remove an item from the project.

**Parameters:**
- `itemId: string` - Project item ID

##### `getItem(itemId: string): Promise<ProjectItem | null>`

Get a specific project item.

**Parameters:**
- `itemId: string` - Project item ID

**Returns:** Project item or null if not found

##### `listItems(filters?: ItemFilters): Promise<ProjectItem[]>`

List all items in the project.

**Parameters:**
- `filters?: ItemFilters` - Optional filters (limit, cursor, status)

**Returns:** Array of project items

#### Status Management

##### `updateItemStatus(itemId: string, status: string): Promise<void>`

Update the status of a project item.

**Parameters:**
- `itemId: string` - Project item ID
- `status: string` - Status name (must match statusOptions in config)

**Example:**
```typescript
await project.updateItemStatus(itemId, 'In Progress');
```

##### `listStatuses(): Promise<Status[]>`

Get all available status options.

**Returns:** Array of status definitions with IDs, names, colors

#### Field Management

##### `updateItemField(itemId: string, fieldId: string, value: unknown): Promise<void>`

Update a custom field value.

**Parameters:**
- `itemId: string` - Project item ID
- `fieldId: string` - Field ID
- `value: unknown` - Field value (type depends on field type)

##### `listFields(): Promise<Field[]>`

Get all project fields.

**Returns:** Array of field definitions

## GitHub Projects V2 Setup

### Finding Your Project ID

1. Navigate to your GitHub Project
2. In the URL, find the project number: `https://github.com/orgs/ORG/projects/123`
3. Use GitHub CLI to get the node ID:
   ```bash
   gh api graphql -f query='
     query {
       organization(login: "ORG") {
         projectV2(number: 123) {
           id
         }
       }
     }
   '
   ```

### Finding Status Field ID and Options

```bash
gh api graphql -f query='
  query {
    node(id: "PVT_kwDOB9Y8ns4A8-TY") {
      ... on ProjectV2 {
        fields(first: 20) {
          nodes {
            ... on ProjectV2SingleSelectField {
              id
              name
              options {
                id
                name
              }
            }
          }
        }
      }
    }
  }
'
```

Look for the "Status" field and note:
- Field ID (`PVTSSF_...`)
- Option IDs for each status

### Configuration Example

```typescript
const project = await getProject({
  type: 'github',
  projectId: 'PVT_kwDOB9Y8ns4A8-TY',      // From step 1
  token: process.env.GITHUB_TOKEN,
  statusFieldId: 'PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY',  // From step 2
  statusOptions: {
    'New': '47fc9ee4',           // Option IDs from step 2
    'Backlog': '4c6e9e0c',
    'Planning': 'f75ad846',
    'Ready': '98236657',
    'In Progress': 'b5f9e3e1',
    'Review': '5e1b3e8f',
    'Done': '3f4e5d6c'
  }
});
```

## Standard Kanban Statuses

The package exports standard kanban status names:

```typescript
import { KANBAN_STATUSES } from '@happyvertical/projects';

// ['New', 'Backlog', 'Planning', 'Ready', 'In Progress', 'Review', 'Done']
```

## Error Handling

```typescript
import { ProjectError, ProjectErrorCode } from '@happyvertical/projects';

try {
  await project.updateItemStatus(itemId, 'Invalid Status');
} catch (error) {
  if (error instanceof ProjectError) {
    switch (error.code) {
      case ProjectErrorCode.INVALID_STATUS:
        console.error('Status not found:', error.message);
        break;
      case ProjectErrorCode.UNAUTHORIZED:
        console.error('Token lacks permissions');
        break;
      case ProjectErrorCode.RATE_LIMITED:
        console.error('Rate limited, retry after delay');
        break;
    }
  }
}
```

## Integration with @happyvertical/repos

Projects work seamlessly with repositories:

```typescript
import { getRepository } from '@happyvertical/repos';
import { getProject } from '@happyvertical/projects';

const repo = await getRepository({
  type: 'github',
  owner: 'happyvertical',
  repo: 'sdk',
  token: process.env.GITHUB_TOKEN
});

const project = await getProject({
  type: 'github',
  projectId: 'PVT_kwDOB9Y8ns4A8-TY',
  token: process.env.GITHUB_TOKEN,
  statusFieldId: 'PVTSSF_lADOB9Y8ns4A8-TYzgw0GaY',
  statusOptions: {
    'New': 'option-id-1',
    'In Progress': 'option-id-2',
    'Done': 'option-id-3'
  }
});

// Create issue and add to project
const issue = await repo.createIssue({
  title: 'New feature',
  body: 'Description',
  labels: ['type: feature']
});

const item = await project.addItem(issue.id);
await project.updateItemStatus(item.id, 'In Progress');
```

## Supported Platforms

| Platform | Status | Notes |
|----------|--------|-------|
| GitHub Projects V2 | ✅ Complete | Full GraphQL implementation |
| Jira | 🚧 Planned | Coming soon |
| ZenHub | 🚧 Planned | Coming soon |
| Linear | 🚧 Planned | Coming soon |

## License

MIT
