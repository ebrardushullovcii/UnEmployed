# ADR 0010: OpenCode Go mixed text and vision routing

## Status

Accepted; supersedes the provider-selection part of ADR 0009. ADR 0009's
contract-first agent and safety boundaries remain accepted.

## Context

The product owner subscribed to OpenCode Go and selected DeepSeek V4 Flash for
normal agent work because its included usage is substantially larger. DeepSeek
V4 Flash is text-only. OpenCode Go also exposes GPT-5.6 Luna for image input.

The app already supports OpenAI-compatible Chat Completions and Responses APIs,
but the shared vision routes previously inherited the text route's API mode and
reasoning effort unless every capability had a local override.

## Decision

- Use OpenCode Go's `deepseek-v4-flash` through Chat Completions for normal
  text and tool-based agent work, with `max` reasoning requested.
- Use OpenCode Go's `gpt-5.6-luna` through Responses for image-only work, with
  `high` reasoning requested.
- Allow the same Go API key to serve both routes while keeping independent base
  URL, API mode, model, and reasoning settings.
- Keep local Whisper or an explicit audio model for transcription.
- Preserve all typed tools, temporary-draft validation, user review, and
  no-submit authority boundaries from ADR 0009.

## Consequences

- Normal agent calls use the lower-cost, higher-included-usage text model.
- Vision remains available without sending image payloads to a text-only model.
- Provider configuration is more explicit because text and vision cannot safely
  share one inherited API mode.
- `max` is forwarded as a provider option; OpenCode Go may normalize the exact
  internal reasoning budget for DeepSeek V4 Flash.

## References

- OpenCode Go endpoints: <https://opencode.ai/docs/go/>
- Provider setup: `docs/AI_PROVIDER_SETUP.md`
- Superseded selection: `docs/adr/0009-luna-high-default-and-capability-contracts.md`
