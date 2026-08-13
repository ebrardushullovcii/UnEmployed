# AI provider setup

UnEmployed uses a mixed OpenCode Go route:

- DeepSeek V4 Flash with `max` reasoning handles normal text and tool-based
  agent work through Chat Completions.
- GPT-5.6 Luna with `high` reasoning handles image-only résumé, browser, and
  Interview Helper analysis through the Responses API.
- Audio transcription remains local Whisper or an explicit audio-model concern.

This supersedes the earlier Luna-for-everything provider selection while
preserving the contract-first agent boundaries from ADR 0009. See ADR 0010.

## Recommended production setup

Create an OpenCode Go key, then use the same key for both text and vision:

```dotenv
UNEMPLOYED_AI_API_KEY=your-opencode-go-key
UNEMPLOYED_AI_BASE_URL=https://opencode.ai/zen/go/v1
UNEMPLOYED_AI_MODEL=deepseek-v4-flash
UNEMPLOYED_AI_API_MODE=chat_completions
UNEMPLOYED_AI_REASONING_EFFORT=max

UNEMPLOYED_AI_VISION_BASE_URL=https://opencode.ai/zen/go/v1
UNEMPLOYED_AI_VISION_MODEL=gpt-5.6-luna
UNEMPLOYED_AI_VISION_API_MODE=responses
UNEMPLOYED_AI_VISION_REASONING_EFFORT=high
UNEMPLOYED_RESUME_VISION_MODEL=gpt-5.6-luna
UNEMPLOYED_RESUME_VISION_REASONING_EFFORT=high
UNEMPLOYED_BROWSER_VISION_MODEL=gpt-5.6-luna
UNEMPLOYED_BROWSER_VISION_REASONING_EFFORT=high
UNEMPLOYED_INTERVIEW_AI_MODEL=deepseek-v4-flash
UNEMPLOYED_INTERVIEW_AI_API_MODE=chat_completions
UNEMPLOYED_INTERVIEW_REASONING_EFFORT=max
UNEMPLOYED_INTERVIEW_VISION_MODEL=gpt-5.6-luna
UNEMPLOYED_INTERVIEW_VISION_API_MODE=responses
UNEMPLOYED_INTERVIEW_VISION_REASONING_EFFORT=high
```

Use the raw API model IDs shown above. The `opencode-go/...` prefix is only for
OpenCode's own configuration file, not direct HTTP API requests. Provider
output remains locally parsed and schema-validated before it can modify Job
Finder state.

Audio configuration is intentionally not included in this mixed provider routing.
Keep local Whisper or an explicit audio-capable transcription model configured
for Interview Helper audio.

## Local Codex subscription proxy

For local evaluation without a separate OpenAI Platform key, use the pinned
[openai-oauth](https://github.com/EvanZhouDev/openai-oauth) npm proxy. It is
an unofficial community integration, so keep it loopback-only and do not
deploy it as a shared service. Version 2.0.0 exposes both /v1/responses and
/v1/chat/completions, discovers the models available to the current Codex
account, and reads the same local Codex OAuth file.

Start and verify the proxy:

    npx --yes openai-oauth@2.0.0 login
    npx --yes openai-oauth@2.0.0 --host 127.0.0.1 --port 10531 --detach
    npx --yes openai-oauth@2.0.0 status
    Invoke-RestMethod http://127.0.0.1:10531/v1/models

If Codex is already signed in locally, the explicit login step may not be
needed. The client key is a non-secret placeholder because the proxy is bound
to loopback:

    UNEMPLOYED_AI_API_KEY=unused
    UNEMPLOYED_AI_BASE_URL=http://127.0.0.1:10531/v1
    UNEMPLOYED_AI_MODEL=gpt-5.6-luna
    UNEMPLOYED_AI_API_MODE=responses
    UNEMPLOYED_AI_REASONING_EFFORT=high
    UNEMPLOYED_RESUME_VISION_MODEL=gpt-5.6-luna

Before using it with candidate data:

- keep the host fixed to 127.0.0.1, never a LAN or public interface;
- pin and review the package version instead of executing an unbounded latest
  version in repeatable workflows;
- verify gpt-5.6-luna appears in /v1/models;
- verify text, image input, structured output, tools, and high reasoning using
  synthetic data;
- do not use this bridge for the normal OpenCode Go production route;
- stop the local proxy when it is no longer needed:

  npx --yes openai-oauth@2.0.0 stop

## Compatibility fallback

A legacy provider can still be used explicitly:

```dotenv
UNEMPLOYED_AI_API_MODE=chat_completions
```

That mode is now the intended DeepSeek text route. Keep Luna image work on the
separate Responses route.

## Verification

With a configured OpenCode Go key:

1. confirm `GET https://opencode.ai/zen/go/v1/models` is reachable;
2. run `pnpm validate:package ai-providers`;
3. open Settings and confirm the normal provider reports
   `deepseek-v4-flash`;
4. use synthetic candidate data for the first resume, vision, and tool-loop
   smoke checks;
5. preserve the application safety boundary: final submission authorization
   stays false regardless of provider.
