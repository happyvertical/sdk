# @happyvertical/encryption

Unified encryption and cryptography operations. Factory: `getEncryption(options): Promise<Encryption>`.

## Adapters

pgp (OpenPGP.js), nacl (TweetNaCl), node (Node.js crypto). All in `src/adapters/`.

## Key patterns

- Unified interface for text, file, buffer, and stream encrypt/decrypt
- PGP adapter supports email encryption/decryption/signing/verification
- NaCl supports both symmetric (secretbox) and asymmetric (box) encryption
- Node adapter supports AES-256-GCM, AES-256-CBC, RSA, ECDH, ECDSA
- Adapters are lazy-loaded to reduce bundle size
- Key management: `generateKeyPair()`, `importKey()`, `exportKey()`
- `getCapabilities()` reports what each adapter supports

## Gotchas

- PGP adapter requires `openpgp` package (bundled dependency)
- NaCl keys can be `Uint8Array`, `Buffer`, or encoded string (base64/hex)
- Node crypto `keyDerivation.iterations` must be >= 1000
- Node crypto `keyDerivation.keyLength` must be >= 16 bytes
- No `HAVE_ENCRYPTION_*` env vars — all config is passed via options
