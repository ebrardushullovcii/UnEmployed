# OS Integration

Owns tray, hotkeys, window policy, and capture-policy adapters.

## Rules

- Keep platform-specific logic out of product modules.
- Add adapter contracts before adding native helper code.
- Maintain feature parity notes in docs when platform behavior differs.

