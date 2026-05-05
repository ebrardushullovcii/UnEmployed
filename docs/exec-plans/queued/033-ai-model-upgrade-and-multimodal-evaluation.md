# 033 AI Model Upgrade And Multimodal Evaluation

Status: ready

## Note

- switch the default chat model from `FelidaeAI-Pro-2.5` to `FelidaeAI-Pro-2.7`
- explore adding `Omni-3.6` as a separate vision-capable model path
- audit where multimodal support could help: resume import recovery, browser/source-debug screenshot review, QA screenshot triage, and future Interview Helper capture flows
- keep chat and vision roles explicit, typed, and fallback-safe
- expand this note into a real implementation plan only when the work is ready to start

## References

- `packages/ai-providers/src/openai-compatible.ts`
