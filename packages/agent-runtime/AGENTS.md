# Agent Runtime

Owns the product-neutral typed task loop, progress, retries, result handles,
checkpoints, permissions, and execution receipts used by AI capabilities.

## Rules

- Keep domain schemas and canonical state ownership outside this package
- Writes target reversible task drafts unless the caller explicitly supplies a wider permission
- Never execute external actions
- Persist typed state; do not treat model conversation as canonical memory
- Keep retry and stop decisions observable and deterministic
