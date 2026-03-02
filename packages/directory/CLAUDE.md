# @happyvertical/directory

Directory services. Factory: `getDirectoryAdapter(options)` plus typed helpers `getKanidmAdapter()`, `getStalwartAdapter()`, `getPostgresAdapter()`, `getAwsAdapter()`.

## Adapters (all fully implemented)

- **Kanidm** — Identity (users, groups, OAuth2 clients, credential resets). Supports username/password or apiToken auth.
- **Stalwart** — Mail (domains, DKIM, DNS records, mailboxes). Uses unified "principals" API where users/groups/domains are all principal types.
- **PostgreSQL** — Database roles. Maps users to LOGIN roles, groups to NOLOGIN roles. Filters `pg_*` and `postgres` from lists.
- **AWS** — Organizations/IAM (OUs, accounts, IAM users, policies, access keys).

## Gotchas

- AWS account creation is async — returns status ID, must poll `getAccountCreationStatus()`
- AWS accounts can't be deleted, only closed/suspended
- Kanidm OAuth2 uses specific attribute names (`oauth2_rs_origin`, `oauth2_rs_scope_map`)
- All adapters use native `fetch` with `AbortSignal.timeout()` — no external HTTP lib
