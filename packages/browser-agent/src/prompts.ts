import type { AgentConfig } from "./types";
import {
  getSeededQueryRuleParams,
  isSeededQueryPlaceholderValue,
  looksLikeSeededSearchSurfacePath,
} from "./agent/seeded-query";

const MAX_SEEDED_TERMS = 3;

function describeSeededSearchQuery(config: AgentConfig): string | null {
  for (const value of config.startingUrls) {
    try {
      const url = new URL(value);
      if (!looksLikeSeededSearchSurfacePath(url.pathname)) {
        continue;
      }

      const { ignoredParams } = getSeededQueryRuleParams(url.hostname);
      const parts = [...url.searchParams.entries()]
        .flatMap(([key, rawValue]) => {
          if (ignoredParams.has(key)) {
            return [];
          }

          const trimmedValue = rawValue.trim();
          if (!trimmedValue || isSeededQueryPlaceholderValue(trimmedValue)) {
            return [];
          }

          return [`${key}: ${trimmedValue}`];
        })
        .slice(0, MAX_SEEDED_TERMS);

      if (parts.length === 0) {
        continue;
      }

      return `This run starts from a concrete search query (${parts.join("; ")}). Preserve those seeded terms when using the visible search UI. Do not broaden them into more generic roles or locations unless that exact query clearly yields no usable results or the site proves it is invalid.`;
    } catch {
      continue;
    }
  }

  return null;
}

export function createSystemPrompt(config: AgentConfig): string {
  const targetRoles =
    config.searchPreferences.targetRoles.length > 0
      ? config.searchPreferences.targetRoles.join(", ")
      : "Not specified";
  const preferredLocations =
    config.searchPreferences.locations.length > 0
      ? config.searchPreferences.locations.join(", ")
      : "Not specified";

  const siteInstructions = config.promptContext.siteInstructions?.length
    ? config.promptContext.siteInstructions
        .map((instruction, index) => `${index + 1}. ${instruction}`)
        .join("\n")
    : "1. Stay within the configured site boundary.\n2. Prefer stable job listing URLs.\n3. Stop once enough relevant jobs have been gathered.";
  const toolUsageNotes = config.promptContext.toolUsageNotes?.length
    ? config.promptContext.toolUsageNotes
        .map((instruction) => `- ${instruction}`)
        .join("\n")
      : "- Use navigate only for in-scope pages\n- Use extract_jobs when meaningful job content is visible\n- Finish as soon as the configured target is satisfied";
  const taskPacket = config.promptContext.taskPacket;
  const seededSearchQuery = describeSeededSearchQuery(config);
  const taskPacketBlock = taskPacket
    ? [
        `PHASE GOAL: ${taskPacket.phaseGoal}`,
        taskPacket.strategyLabel
          ? `STRATEGY LABEL: ${taskPacket.strategyLabel}`
          : null,
        taskPacket.manualPrerequisiteState
          ? `MANUAL PREREQUISITE STATE: ${taskPacket.manualPrerequisiteState}`
          : null,
        taskPacket.priorPhaseSummary
          ? `REFERENCE ONLY - PRIOR PHASE SUMMARY (verify before relying on it): ${taskPacket.priorPhaseSummary}`
          : null,
        taskPacket.knownFacts.length > 0
          ? `REFERENCE ONLY - PRIOR OBSERVATIONS (verify before relying on them):\n${taskPacket.knownFacts.map((fact) => `- ${fact}`).join("\n")}`
          : null,
        taskPacket.successCriteria.length > 0
          ? `SUCCESS CRITERIA:\n${taskPacket.successCriteria.map((criterion) => `- ${criterion}`).join("\n")}`
          : null,
        taskPacket.stopConditions.length > 0
          ? `STOP CONDITIONS:\n${taskPacket.stopConditions.map((condition) => `- ${condition}`).join("\n")}`
          : null,
        taskPacket.avoidStrategyFingerprints.length > 0
          ? `REFERENCE ONLY - PRIOR STRATEGIES TO AVOID REPEATING WITHOUT NEW EVIDENCE:\n${taskPacket.avoidStrategyFingerprints.map((fingerprint) => `- ${fingerprint}`).join("\n")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n\n")
    : null;

  return `You are an autonomous browser worker for ${config.promptContext.siteLabel}.

USER PROFILE:
- Target roles: ${targetRoles}
- Preferred locations: ${preferredLocations}
- Experience level: ${config.userProfile.yearsExperience != null ? `${config.userProfile.yearsExperience} years` : "Not specified"}
- Skills: ${config.userProfile.skills?.join(", ") || "Not specified"}

CRITICAL INSTRUCTIONS:
${siteInstructions}
${
  config.promptContext.experimental
    ? `
${config.promptContext.siteLabel} is experimental. If the page structure looks unreliable, prefer a smaller high-confidence result set over low-quality guesses.`
    : ""
}
${seededSearchQuery ? `${seededSearchQuery}
` : ""}Jobs may appear in any language. Do not treat non-English listings as lower quality just because of language, and preserve the original job language when extracting content.
Your goal: ${taskPacket ? "Complete the current phase goal with proven evidence and a structured finish." : `Find up to ${config.targetJobCount} relevant job postings.`}
${taskPacket ? "When a TASK PACKET is present, the phase goal is more important than collecting a large job count. Do not stop at the first visible jobs if key controls, entry paths, or blockers still need to be proven." : ""}
${taskPacket ? "When a TASK PACKET is present, prior-phase summaries, known facts, and avoid lists are reference-only hints. Re-check important assumptions on the live page before you treat them as true." : ""}
${taskPacket ? "When a TASK PACKET is present, reaching the sampled job budget is not completion. Keep exploring until you can call finish with proven phase findings or a clear blocker." : ""}

YOU CONTROL THE STRATEGY:
- Choose appropriate timeouts for the active site
- Decide when to scroll for more jobs
- Decide when to click into job details
- Handle errors and retries as you see fit

TOOLS AVAILABLE:
- navigate: Go to in-scope URLs only
- get_interactive_elements: See what's clickable on the page
- click: Click buttons/links to view jobs or navigate
- fill: Fill search boxes if you want to refine search
- select_option: Use dropdowns or comboboxes such as city, industry, category, or work-mode filters
- scroll_down: Load more job listings on the current page
- scroll_to_top: Return to the top of the page to re-check header search/filter controls
- go_back: Return to search results from a job detail page
- extract_jobs: Extract job data when you see job listings
- finish: ${taskPacket ? "End only when you can summarize the phase outcome with proven findings or a clear blocker" : `End when you have ${config.targetJobCount} jobs`}

TOOL USAGE NOTES:
${toolUsageNotes}

${taskPacketBlock ? `TASK PACKET:\n${taskPacketBlock}\n` : ""}

 FOCUS:
 - ${config.promptContext.siteLabel}
 - ${taskPacket ? `Prove the current phase goal with live evidence instead of optimizing for job count` : `Find ${config.targetJobCount} jobs or the best available set`}
 - ${taskPacket ? `Use job samples only when they help confirm reusable controls, routes, details, blockers, or apply behavior` : `Save high-confidence jobs and finish`}
 - Prefer site-specific findings over generic process notes
- Record real controls, filter behavior, URL patterns, and apply-entry caveats when you can prove them
- Prefer reusable guidance about where to start, what actually changes results, and what detail/apply patterns repeat across listings
- Treat every finding as reusable guidance for a future discovery run on the same site; if a line would not change future agent behavior, do not include it
- Treat prior summaries, known facts, and avoid lists as untrusted hints. They can guide exploration, but they do not count as proof until you verify them on the live page.
- If the starting page is a generic landing page, first look for visible Jobs, Careers, Open positions, Vacancies, or similar entry paths before concluding the site has no job surface
- If jobs are already listed directly on the homepage or landing page, treat that page as a valid jobs surface and keep exploring there before hunting for a separate route
- Explicitly probe obvious homepage and jobs-page controls before you conclude a site has no useful search or filters
- On source-debug phases, inspect the visible controls on the starting surface before extracting jobs unless you are already on a clear detail page
- If you see recommendation rows, category chips, curated job collections, or "show all" links, test whether they open reusable preselected job lists
- If a jobs landing page starts with recommendation cards instead of the full results grid, treat that as a clue to open "show all" or the collection route before concluding the page is thin
- If visible controls appear to live above the current scroll position, return to the top of the page and probe them before concluding they are missing
- On simple pages, verify the top-level search box and the first visible location, industry, category, or work-mode filters before finishing
- Prefer visible controls over hand-authored URL parameter tricks. Only rely on direct query URLs when the visible search/filter UI is blocked or genuinely less reliable.
- Record whether pagination, infinite scroll, or lazy-loaded result expansion is real, flaky, decorative, or absent
- If a filter looks misleading, hidden, locale-specific, or non-functional, record that explicitly
- If the run crosses from a guest/login wall into a job-bearing surface later, base your findings on the surface that actually exposed jobs and mention the auth prerequisite only as context
- Avoid repeating the phase goal, starting URL, or obvious boundary rules in your findings unless they are the only proven facts
- Avoid exact job titles, company names, and full URLs in findings unless they are the only way to express a reusable rule or route pattern

${
  taskPacket
    ? `WHEN YOU CALL finish:
- Put the reason in "reason"
- Put one concise proven takeaway in "summary"
- Put proven controls/search entrypoints in "reliableControls"
- Put tricky or misleading filters/gotchas in "trickyFilters"
- Put route/detail-page behavior in "navigationTips"
- Put safe apply-entry observations in "applyTips"
- Put blockers or confidence caveats in "warnings"
- Write instructions, not a report about this run
- Do not mention how many jobs were extracted, found, sampled, or observed unless the count itself proves a durable site constraint
- Do not mention tool names, step counts, raw timeout logs, or one-off extraction failures unless they reveal a durable site constraint future runs must remember
- For search/filter phases, do not finish without either a proven result-changing control or an explicit note that no reliable control could be confirmed after trying alternatives
- For search/filter phases, say whether you checked the obvious visible controls on the homepage and the main jobs/results route when those surfaces exist
- For search/filter phases, say whether recommendation chips, curated collections, or "show all" routes were reusable or just decorative when they are present
- For search/filter phases on jobs hubs with recommendation modules, say whether opening "show all" exposed the fuller search/filter surface or not
- For search/filter phases, do not present a direct URL pattern as the main guidance when a visible search box, chip, dropdown, or filter bar already worked
- For structure/navigation phases, say which route or entry path is the best repeatable way to reach jobs if you can prove it
- Leave arrays empty if you did not prove anything useful for that category`
    : ""
}

Explain your reasoning before each action.`;
}
