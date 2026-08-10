# AI provider setup

UnEmployed uses GPT-5.6 Luna at `high` reasoning for generative text and
vision work. The adapter uses the Responses API because Job Finder combines
reasoning, structured output, image input, and function tools. Audio
transcription remains a separate local Whisper or audio-model concern because
Luna does not accept audio input.

## Recommended production setup

Use the official OpenAI API:

```dotenv
UNEMPLOYED_AI_API_KEY=your-project-api-key
UNEMPLOYED_AI_BASE_URL=https://api.openai.com/v1
UNEMPLOYED_AI_MODEL=gpt-5.6-luna
UNEMPLOYED_AI_API_MODE=responses
UNEMPLOYED_AI_REASONING_EFFORT=high
```

The request adapter sends `store: false`. Provider output is still parsed and
schema-validated locally before it can modify Job Finder state. The app keeps
its existing conservative prompt budgets instead of filling Luna's full
context window, which protects latency and cost.

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
- keep the official OpenAI API as the production deployment path;
- stop the local proxy when it is no longer needed:

    npx --yes openai-oauth@2.0.0 stop
## Compatibility fallback

A legacy provider can still be used explicitly:

```dotenv
UNEMPLOYED_AI_API_MODE=chat_completions
```

That mode exists for compatibility, not for the Luna `high` default. Do not
combine Chat Completions function tools with Luna `high`; use Responses for
the Job Finder agent loop.

## Verification

With a configured key or local bridge:

1. start the provider and confirm `POST /v1/responses` is reachable;
2. run `pnpm validate:package ai-providers`;
3. open Settings and confirm the provider reports `gpt-5.6-luna`;
4. use synthetic candidate data for the first resume, vision, and tool-loop
   smoke checks;
5. preserve the application safety boundary: final submission authorization
   stays false regardless of provider.
