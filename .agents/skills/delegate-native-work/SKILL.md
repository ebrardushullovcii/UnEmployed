---
name: delegate-native-work
description: Delegate substantive implementation, debugging, architecture, product, UX, QA, code-review, research, and other multi-step work to native OpenCode subagents with Muse Spark 1.2 contributor xhigh routing, focused context, clear ownership, escalation, and verification. Use when work can be split into useful independent assignments, when parallel scouting or implementation would improve speed or coverage, or when the user asks for subagents, delegation, or parallel agents.
---

# Delegate Native Work (OpenCode 2)

Keep the primary agent in the coordinator role. Decompose the request, give workers narrow ownership, remain available to the user, combine the results, and verify the important work.

Make delegation precise, not necessarily simple. Before spawning a worker, turn the broader request into a clear outcome with a set scope, relevant context, an initial plan for achieving it, dependencies, and success criteria. Hard work can be delegated when the goal and ownership are clear. Treat the initial plan as a strong starting direction, not a prohibition on adapting when evidence supports a better approach.

This is the OpenCode 2 port of the Codex `delegate-native-work` skill. All workers use `muse-spark-1.2` contributor `xhigh` unless the user explicitly overrides.

## Decide what to delegate

- Delegate independent exploration, implementation, debugging, research, QA, review, and competing hypotheses when doing so materially improves speed, coverage, or context quality.
- Keep tightly coupled decisions and final integration with the primary agent.
- Do not delegate vague goals. Give each worker a precise result to achieve, a defined boundary, and a credible initial approach so it does not need to reconstruct the coordinator's overall plan.
- Avoid duplicate assignments unless independent comparison is intentional.
- Do not impose a fixed numeric agent limit. Scale to the useful independent work, the user's direction, and available runtime capacity. Use additional waves as slots become available.
- Account for coordination cost, shared-file conflicts, machine load, and token use. More agents are useful only when their assignments are distinct and checkable.

## Route models and reasoning (OpenCode 2)

Set both `model` and `reasoning_effort` explicitly for every spawn. Never rely on the parent model or reasoning level being inherited.

1. **Default for every worker: `muse-spark-1.2` contributor `xhigh`.** Use this for scouts, scoped implementation workers, test discovery, routine fixes, research, summaries, and high-volume parallel work. In OpenCode this is `model: "muse-spark-1.2"` (or your configured `muse-spark` provider id) with `reasoning_effort: "xhigh"` / `thinking: xhigh`.
2. Keep `xhigh` even for simple tasks - the user requested consistent peak reasoning so workers do not under-think. Do not downgrade to `high`/`medium`/`low` unless the user explicitly asks to save cost/latency for a trivial mechanical task.
3. Do not route to `gpt-5.6-luna`, `gpt-5.6-sol`, or any other model without explicit user approval. Luna/Sol routing from the Codex version does not apply here.
4. If a worker fails/stalls, do not change the model - improve the assignment: clarify objective/scope/context/initial approach/success criteria, split more precisely, or try a different hypothesis at the same `muse-spark-1.2 xhigh` level. Only switch models after explaining why and receiving user approval.
5. Honor a user's explicit model override when it is available and compatible with higher-priority constraints, but default back to `muse-spark-1.2 xhigh` for the next spawn if no override is given.

Example spawn (OpenCode `subagent` tool):

```ts
// coordinator
await tools.subagent({
  agent: "general", // or "explore" for read-only scouting
  description: "freeze_regression_fix",
  prompt: `Objective: ...\nScope: ...\nContext: ...\nInitial approach: ...\nSuccess criteria: ...\nConstraints: ...\nEvidence: ...\nOutput: ...\nRole boundary: You are a task worker, not the coordinator...`,
  // OpenCode model routing is via prompt + agent config - state explicitly:
  // model=muse-spark-1.2 contributor, reasoning=xhigh
})
```

If your OpenCode config defines named agents, prefer:

```jsonc
// .opencode/opencode.json or opencode.json
{
  "$schema": "https://opencode.ai/config.json",
  "agents": {
    "delegate-worker": { "model": "muse-spark-1.2", "thinking": "xhigh" }
  }
}
```

Then spawn with `agent: "delegate-worker"` and still state `model=muse-spark-1.2 xhigh` in the prompt for verifiability.

## Give focused context

- Give each worker only the context it needs. Do not copy the entire parent history by default. Choose what to include per assignment.
- Use fresh context (`fork_turns: "none"` equivalent) when the assignment is self-contained, the parent conversation is mostly unrelated noise, or a clean-room perspective is useful. Supply all essential context in the assignment.
- Include recent user wording, decisions, evidence, or constraints only when they will help the worker. Include enough to preserve what matters without automatically copying the whole chat.
- State the exact objective, scope, relevant files or workspace, constraints, evidence required, and output contract.
- Repeat essential safety and authority boundaries when they might be missing, buried, or ambiguous in the inherited context.
- Give every task worker an explicit role boundary, especially when it receives parent history: `You are a task worker, not the coordinator. Complete only the assignment below. Use your judgment within this scope, but do not take over the user's full request, answer the user directly, delegate, or spawn other agents. Return your result to the parent agent.`
- For an implementation worker, explicitly state whether it may edit and name its file or behavior ownership. For a scout or reviewer, explicitly keep it read-only.
- Assign a worker permission to coordinate or spawn children only when it has an explicit coordinator role. Keep ordinary scouts and workers as task workers.

Use this compact assignment structure:

```text
Objective: one bounded result.
Scope: exact area, files, behavior, or question owned by this worker.
Context: only the facts and prior decisions needed for this assignment.
Initial approach: the coordinator's proposed steps or starting hypothesis, including known dependencies.
Success criteria: observable conditions that make the assignment complete and useful to the parent.
Constraints: safety, authority, dirty-worktree, and no-go boundaries.
Evidence: files, lines, commands, tests, screenshots, or sources to return.
Output: concise findings, changed files, checks run, and unresolved gaps.
Role boundary: You are a task worker, not the coordinator. Complete only this assignment. Use your judgment within this scope, but do not take over the full request, answer the user directly, delegate, or spawn agents. Return your result to the parent.
Model: muse-spark-1.2 contributor xhigh
```

## Coordinate shared work

- Treat all workers as sharing the same filesystem. Give concurrent writers non-overlapping file or behavior ownership.
- Run read-only scouts freely in parallel. Serialize overlapping writers or keep implementation with one owner.
- Preserve user-owned dirty and untracked work. Do not let workers clean, reset, commit, push, deploy, access secrets, or perform external side effects unless the user explicitly authorized that exact action and it remains within the parent's approval boundary.
- Send discoveries directly to the worker that needs them when agent messaging is available. Keep the primary agent aware of dependencies and conflicts.
- Stop or redirect agents that duplicate solved work, drift outside scope, or become blocked without useful progress.
- In OpenCode, use `subagent` with `background:true` for parallel waves, then `wait`/`followup_task`/`send_message` patterns (or sequential `await` for small waves). Poll `list_agents` only when you need to orchestrate across waves.

## Verify and escalate

1. Inspect cited files, findings, and diffs instead of accepting worker claims at face value.
2. Run the smallest relevant checks under the primary agent's control (`pnpm validate:package <alias>`, `pnpm validate:docs-only`, focused `vitest`).
3. If a worker failed because the goal, scope, context, or initial approach was unclear, improve the assignment or split it more precisely before retrying - keep `muse-spark-1.2 xhigh`.
4. Move to a different hypothesis or narrower ownership instead of repeatedly launching identical attempts.
5. Report which model and reasoning level a worker used only when the spawn settings or metadata verify it (should always be `muse-spark-1.2 xhigh` unless overridden).
6. Do not silently downgrade reasoning or switch models to save latency. If you must, explain and get approval.

## How to spawn many at same time in parallel (CRITICAL - OpenCode 2)

Do NOT spawn 1 by 1 sequentially and wait. Emit all `subagent` calls IN THE SAME ASSISTANT TURN as separate tool calls (one per message) so they start in parallel. This is how you get 6-10-20 agents running at once with different prompts/personalities/focuses.

OpenCode executes parallel tool calls when you send multiple `default.subagent` messages consecutively without waiting for results between them. Each call must be its own message with `agent`, `description`, `prompt`. Do NOT use a loop inside `execute` - use native parallel tool calls.

Correct - 6 auditors at same time, different personalities:
```ts
// SAME TURN - 6 separate tool calls in parallel (not sequential await loop)
tools.subagent({ agent: "general", description: "audit-shell-pixel", prompt: "You are a task worker... Personality: Ruthless pixel-perfectionist - 1px overflow=P1... Scope: job-finder-shell.tsx:540-900... Model: muse-spark-1.2 xhigh" })
tools.subagent({ agent: "general", description: "audit-discovery", prompt: "You are a task worker... Personality: Data-dense pragmatist... Scope: discovery-results-panel.tsx... Model: muse-spark-1.2 xhigh" })
tools.subagent({ agent: "general", description: "audit-crm", prompt: "You are a task worker... Personality: Power-user CRM operator... Scope: applications-crm-views.tsx... Model: muse-spark-1.2 xhigh" })
tools.subagent({ agent: "general", description: "audit-rapid-resume", prompt: "You are a task worker... Personality: Meticulous editor - drag/maximize... Scope: rapid-review-screen.tsx... Model: muse-spark-1.2 xhigh" })
tools.subagent({ agent: "general", description: "audit-home-profile", prompt: "You are a task worker... Personality: First-time user - onboarding clarity... Scope: job-search-home-screen.tsx... Model: muse-spark-1.2 xhigh" })
tools.subagent({ agent: "general", description: "audit-campaign", prompt: "You are a task worker... Personality: Dashboard skeptic... Scope: campaigns-screen.tsx... Model: muse-spark-1.2 xhigh" })
// Result: UI shows 6 General Subagent running simultaneously, then 6 results
```

Wrong - 1 by 1 (never do this):
```ts
// WRONG - sequential
await tools.subagent({ description: "audit-shell-pixel", ... }); // wait for finish
await tools.subagent({ description: "audit-discovery", ... }); // only now start 2nd
```

Rules for parallel:
- Different `description` and different `prompt` personality/focus/role per agent - subagents are heavily prompt-affected, so vary wording, focus area, and persona.
- Keep file ownership non-overlapping for writers; read-only scouts can overlap freely.
- Workers share filesystem - do not give concurrent writers overlapping files.
- Use `background:true` only if you want fire-and-forget; for most audits use foreground parallel as above.
- After launching, coordinator verifies results, then launches next wave (compare wave, fix wave) with same parallel pattern. Keep chaining waves until excellence.

## OpenCode 2 orchestration cheat-sheet

```ts
// 1. Parallel scout wave - 10 auditors at once, different personalities, same turn
// Send these 3-10 calls as separate messages in SAME turn:
tools.subagent({ agent: "explore", description: "arch_review", prompt: archPrompt /* + Model: muse-spark-1.2 xhigh */ })
tools.subagent({ agent: "explore", description: "ux_review", prompt: uxPrompt })
tools.subagent({ agent: "explore", description: "safety_review", prompt: safetyPrompt })
// ... 7 more in same turn

// 2. Verify yourself, then fix wave with non-overlapping ownership - again parallel
tools.subagent({ agent: "general", description: "fix_env_precedence", prompt: fixPrompt })
tools.subagent({ agent: "general", description: "fix_shell_overflow", prompt: fixShellPrompt })
tools.subagent({ agent: "general", description: "fix_pagination", prompt: fixPaginationPrompt })

// 3. Go back and forth: followup or message a running worker
// await tools.followup_task({ agentId, message: "Narrow scope to ..." })
// await tools.send_message({ agentId, message: "New evidence: ..." })
// await tools.interrupt_agent({ agentId })

// 4. Integration is coordinator-owned: combine, run pnpm verify, present unified result
```

Return a unified result to the user. Distinguish verified work, worker-reported evidence, unresolved gaps, and any escalation that still needs approval. Keep package boundaries typed and schema-validated, do not introduce `any`, deep cross-package imports, or untyped IPC.
