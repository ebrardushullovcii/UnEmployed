# macOS Native

Reserve native code for native helpers only when Electron APIs are insufficient.

## Rules

- Keep native code behind `packages/os-integration`
- Document every native addition in `docs/ARCHITECTURE.md` and the relevant module or platform doc
