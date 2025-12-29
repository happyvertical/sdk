---
"@happyvertical/auth": minor
---

Add Kanidm authentication provider with OIDC/OAuth2 support

- Authorization code flow with PKCE (required by Kanidm)
- Token validation via JWKS (ES256 signing)
- User management via Kanidm's native /v1/person API
- Multi-step admin authentication for API access
- Integration tests against live Kanidm instance
