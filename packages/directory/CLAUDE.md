# @happyvertical/directory

Unified directory services with adapter-based architecture. Provides programmatic provisioning for identity (Kanidm), mail (Stalwart), database (PostgreSQL), and cloud (AWS) via a standardized adapter interface.

## Architecture

```
getDirectoryAdapter({ type: 'kanidm', baseUrl: '...', adminUsername: '...', adminPassword: '...' })
  -> KanidmAdapter (Kanidm REST API)

getDirectoryAdapter({ type: 'stalwart', baseUrl: '...', username: '...', password: '...' })
  -> StalwartAdapter (Stalwart REST API)

getDirectoryAdapter({ type: 'postgres', host: '...', adminUser: '...', adminPassword: '...' })
  -> PostgresAdapter (pg client)

getDirectoryAdapter({ type: 'aws', region: '...', credentials: { ... } })
  -> AwsAdapter (AWS SDK)
```

## Quick Start

```typescript
import { getDirectoryAdapter, getKanidmAdapter } from '@happyvertical/directory';

// Generic factory (returns DirectoryAdapter)
const dir = await getDirectoryAdapter({
  type: 'kanidm',
  baseUrl: 'https://idm.example.com',
  adminUsername: 'admin',
  adminPassword: 'secret',
});
await dir.testConnection();
await dir.createUser({ username: 'alice', displayName: 'Alice' });

// Typed convenience (returns KanidmDirectoryAdapter with OAuth2 methods)
const kanidm = await getKanidmAdapter({ ... });
await kanidm.createOAuth2Client({ name: 'myapp', redirectUris: ['https://app/callback'] });
```

## Interfaces

| Interface | Service | Extends | Service-Specific |
|-----------|---------|---------|------------------|
| `DirectoryAdapter` | (base) | - | User/Group CRUD, membership, testConnection |
| `KanidmDirectoryAdapter` | Kanidm | DirectoryAdapter | OAuth2 client CRUD, secret management |
| `StalwartDirectoryAdapter` | Stalwart | DirectoryAdapter | Domain CRUD, DKIM, DNS records, mailbox CRUD |
| `PostgresDirectoryAdapter` | PostgreSQL | DirectoryAdapter | Database/role provisioning, GRANT/REVOKE |
| `AwsDirectoryAdapter` | AWS | DirectoryAdapter | OUs, accounts, IAM users, policies, access keys |

## Error Hierarchy

```
DirectoryError (base, code + provider)
  ConnectionError
  AuthenticationError
  NotFoundError
  ConflictError
  ValidationError
  RateLimitError
```

## Adapters

| Adapter | Protocol | External Dep |
|---------|----------|-------------|
| `KanidmAdapter` | Kanidm REST API v1 | None (native fetch) |
| `StalwartAdapter` | Stalwart REST API | None (native fetch) |
| `PostgresAdapter` | PostgreSQL wire protocol | `pg` |
| `AwsAdapter` | AWS SDK v3 | `@aws-sdk/client-organizations`, `@aws-sdk/client-iam` |

## Dependencies

- **Internal**: `@happyvertical/utils`
- **External**: `pg`, `@aws-sdk/client-organizations`, `@aws-sdk/client-iam`

## Development Guidelines

- All adapters implement the complete `DirectoryAdapter` base interface
- Service-specific adapters extend with additional operations
- Factory uses dynamic imports to avoid loading unused adapters
- Errors include `provider` field for multi-adapter debugging
- HTTP adapters use native `fetch` with `AbortSignal.timeout()`
