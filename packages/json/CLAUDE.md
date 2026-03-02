# @happyvertical/json

High-performance JSON with Rust SIMD acceleration. Factory: `JSONFactory.create({ adapter?, fallback? })`.

## Adapters

SonicAdapter (Rust SIMD via napi-rs), NativeAdapter (JS fallback). Auto-selects based on platform availability.

## Gotchas

- Sonic requires platform-specific binary packages (darwin-arm64, linux-x64, etc.)
- Reviver/replacer manually reimplemented in JS on top of Rust layer (not natively supported)
- `stringify()` throws TypeError for functions/symbols instead of returning `undefined`
- Falls back gracefully to NativeAdapter if .node binding fails to load
