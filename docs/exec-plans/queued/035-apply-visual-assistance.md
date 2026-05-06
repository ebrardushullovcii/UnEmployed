# 035 Apply Visual Assistance

Status: ready

## Goal

- Use omni vision to make the existing safe non-submitting apply flow better at understanding visible application forms, upload controls, validation errors, and blockers.

## Core Idea

- Capture screenshots at bounded apply checkpoints and ask omni to classify visible form state.
- Limit omni output to structured apply observations such as visible blockers, field/control classifications, button states, question context, and recovery summaries.
- Use conservative visual checkpoints during normal safe apply when DOM evidence is weak, and allow more aggressive visual diagnostics after apply pauses or fails.
- Convert the result into typed apply artifacts, question/context records, blocker summaries, and recovery guidance.
- Use Pro when needed to normalize messy omni observations, adjudicate visual/DOM conflicts, produce user-facing recovery summaries, or prepare custom-question context.
- Treat apply screenshots as temporary by default; persist selected checkpoint evidence only when needed to explain a paused/failed run, recovery path, or user review state.
- Use the visual layer to supplement DOM field snapshots when labels, required markers, disabled buttons, or custom upload widgets are visually clearer than structurally exposed.
- Do not silently override DOM-derived field snapshots with visual classifications; use vision to increase confidence, create reviewable context when DOM is weak, or flag conflicts/blockers when DOM and visual evidence disagree.

## Guardrails

- Live submit remains disabled unless explicitly re-authorized.
- Vision output must feed schema-validated apply records and checkpoints, not freeform browser actions.
- Do not fill a field solely because vision guessed a control unless typed apply workflow logic can validate the action safely.
- Do not let vision output click instructions, selectors, generated answers to submit, final-submit guidance, or site-specific apply rules.
- Keep user consent and review gates intact before any filled application state is considered ready.
- Pro does not own browser actions, field filling, or submit behavior.
- Avoid broad screenshot persistence on application pages because they may contain sensitive profile, account, resume, or employer-portal data.
- Do not capture continuously or at every apply step.

## Open Details

- Define bounded normal-apply checkpoints and stronger paused/failed recovery diagnostics without creating noisy artifacts.
- Define redaction rules for application pages that may include personal data.
- Define when paused/failed apply screenshots become retained evidence refs versus temporary visual analysis inputs.
- Define reconciliation between DOM-derived field snapshots and visual classifications, including agreement, DOM-weak, and conflict states.
- Define when Pro normalization/adjudication is required for recovery summaries and question/context records.
- Define validation that rejects direct action commands, selectors, generated answers, and final-submit guidance in visual output.
