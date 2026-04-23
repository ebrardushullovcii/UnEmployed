# OS Integration

Owns tray, hotkeys, window policy, and capture-policy adapters.

## Rules

- Keep platform-specific code out of product modules
- Add adapter contracts before native helper code
- Document platform differences when behavior diverges
