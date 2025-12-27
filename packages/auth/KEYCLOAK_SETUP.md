# Keycloak Setup for Integration Tests

This guide explains how to configure Keycloak to run the integration tests.

## Quick Setup (Docker)

The fastest way to get Keycloak running for testing:

```bash
docker run -d --name keycloak-test \
  -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:latest \
  start-dev
```

Wait ~30 seconds for startup, then access the admin console at `http://localhost:8080`.

## Step-by-Step Configuration

### 1. Create a Test Realm

1. Log in to Keycloak Admin Console (`http://localhost:8080/admin`)
2. Click the realm dropdown (top-left, shows "master")
3. Click "Create realm"
4. Name: `test-realm`
5. Click "Create"

### 2. Create a Public Client (for Authorization Code Flow)

1. In `test-realm`, go to **Clients** → **Create client**
2. Configure:
   - **Client ID**: `test-app`
   - **Client type**: OpenID Connect
   - Click **Next**
3. Capability config:
   - **Client authentication**: OFF (public client)
   - **Authorization**: OFF
   - **Standard flow**: ON
   - **Direct access grants**: ON (for password grant testing)
   - Click **Next**
4. Login settings:
   - **Root URL**: `http://localhost:3000`
   - **Valid redirect URIs**: `http://localhost:3000/*`
   - **Web origins**: `http://localhost:3000`
   - Click **Save**

### 3. Create a Confidential Client (for Client Credentials)

1. Go to **Clients** → **Create client**
2. Configure:
   - **Client ID**: `test-app-confidential`
   - **Client type**: OpenID Connect
   - Click **Next**
3. Capability config:
   - **Client authentication**: ON (confidential client)
   - **Service accounts roles**: ON (for client credentials grant)
   - Click **Next**
4. Login settings:
   - **Valid redirect URIs**: `http://localhost:3000/*`
   - Click **Save**
5. Go to **Credentials** tab:
   - Copy the **Client secret** (you'll need this)

### 4. Create an Admin Service Account

For tests that require admin operations (user management, session management):

1. Go to **Clients** → **Create client**
2. Configure:
   - **Client ID**: `admin-cli-test`
   - **Client type**: OpenID Connect
   - Click **Next**
3. Capability config:
   - **Client authentication**: ON
   - **Service accounts roles**: ON
   - Click **Next**
4. Click **Save**
5. Go to **Credentials** tab:
   - Copy the **Client secret**
6. Go to **Service account roles** tab:
   - Click **Assign role**
   - Filter by "realm-management" client
   - Assign these roles:
     - `realm-admin` (full admin access for testing)
     - OR individually: `manage-users`, `view-users`, `manage-realm`, `view-realm`

### 5. Create a Test User

1. Go to **Users** → **Add user**
2. Configure:
   - **Username**: `testuser`
   - **Email**: `testuser@example.com`
   - **Email verified**: ON
   - **First name**: `Test`
   - **Last name**: `User`
   - Click **Create**
3. Go to **Credentials** tab:
   - Click **Set password**
   - **Password**: `testpassword`
   - **Temporary**: OFF
   - Click **Save** and confirm

### 6. (Optional) Create Test Roles

For RBAC testing:

1. Go to **Realm roles** → **Create role**
2. Create roles:
   - `test-role`
   - `admin`
   - `editor`
   - `viewer`

## Environment Variables

Create a `.env.test` file or set these environment variables:

```bash
# Required
KEYCLOAK_SERVER_URL=http://localhost:8080
KEYCLOAK_REALM=test-realm
KEYCLOAK_CLIENT_ID=test-app

# For confidential client tests
KEYCLOAK_CLIENT_SECRET=<from step 3>

# For admin operations (user/session management)
KEYCLOAK_ADMIN_CLIENT_ID=admin-cli-test
KEYCLOAK_ADMIN_CLIENT_SECRET=<from step 4>

# Test user credentials
KEYCLOAK_TEST_USERNAME=testuser
KEYCLOAK_TEST_PASSWORD=testpassword
```

## Running Integration Tests

```bash
# With environment variables
npm test -- keycloak.integration.spec.ts

# Or with dotenv
dotenv -e .env.test npm test -- keycloak.integration.spec.ts
```

## Verification Checklist

Before running tests, verify:

- [ ] Keycloak is running and accessible at `KEYCLOAK_SERVER_URL`
- [ ] `test-realm` exists
- [ ] `test-app` client exists with direct access grants enabled
- [ ] `admin-cli-test` client exists with service account roles
- [ ] `testuser` exists with password set
- [ ] Admin client has `realm-admin` or required roles

## Troubleshooting

### "401 Unauthorized" on password grant

- Verify `testuser` exists and password is correct
- Check that `test-app` client has "Direct access grants" enabled
- Ensure password is not marked as "Temporary"

### "403 Forbidden" on admin operations

- Verify admin client has service account roles configured
- Check that `realm-admin` or appropriate roles are assigned
- Confirm using correct `KEYCLOAK_ADMIN_CLIENT_SECRET`

### "invalid_client" error

- Verify client ID and secret are correct
- For confidential clients, ensure "Client authentication" is ON
- Check that you're using the right client (public vs confidential)

### Token validation fails

- Keycloak's JWKS endpoint must be accessible
- Check realm name matches exactly
- Verify token hasn't expired

### "User not found" during admin operations

- Admin operations use user UUID, not username
- Use `listUsers()` first to get user IDs

## Docker Compose (Alternative)

For a persistent test environment:

```yaml
# docker-compose.yml
version: '3.8'
services:
  keycloak:
    image: quay.io/keycloak/keycloak:latest
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
    ports:
      - "8080:8080"
    command: start-dev
    volumes:
      - keycloak_data:/opt/keycloak/data

volumes:
  keycloak_data:
```

```bash
docker-compose up -d
```

## Realm Export/Import

To automate test realm setup, you can export and import realm configuration:

### Export
```bash
docker exec keycloak-test /opt/keycloak/bin/kc.sh export \
  --dir /tmp/export \
  --realm test-realm
docker cp keycloak-test:/tmp/export/test-realm.json ./test-realm.json
```

### Import
```bash
docker cp ./test-realm.json keycloak-test:/tmp/test-realm.json
docker exec keycloak-test /opt/keycloak/bin/kc.sh import \
  --file /tmp/test-realm.json
```

## Summary

After setup, you should have:

| Component | Value |
|-----------|-------|
| Server URL | `http://localhost:8080` |
| Realm | `test-realm` |
| Public Client | `test-app` |
| Confidential Client | `test-app-confidential` |
| Admin Client | `admin-cli-test` |
| Test User | `testuser` / `testpassword` |

The integration tests will skip automatically if environment variables are not set, so you can run the full test suite without Keycloak configured.
