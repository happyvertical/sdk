# @happyvertical/secrets

Envelope encryption for per-tenant secrets. Factory: `getSecretStore({ type, ...config })`.

## Adapters

database (full — AES-256-GCM with DEK/KEK separation, per-tenant key isolation). AWS KMS, HashiCorp Vault, Azure Key Vault are stubs (throw "not yet implemented").

## Gotchas

- Master key must be exactly 32 bytes (256-bit)
- IV (nonce) is unique per encryption, stored in envelope
- Key rotation re-encrypts all tenant keys — async operation
- Cloud adapters throw immediately; no graceful fallback
