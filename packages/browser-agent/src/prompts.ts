import type { AgentConfig } from './types'

export function createSystemPrompt(config: AgentConfig): string {
  const targetRoles = config.searchPreferences.targetRoles.length > 0
    ? config.searchPreferences.targetRoles.join(', ')
    : 'Not specified'
  const preferredLocations = config.searchPreferences.locations.length > 0
    ? config.searchPreferences.locations.join(', ')
    : 'Not specified'

  const siteInstructions = config.promptContext.siteInstructions?.length
    ? config.promptContext.siteInstructions.map((instruction, index) => `${index + 1}. ${instruction}`).join('\n')
    : '1. Stay within the configured site boundary.\n2. Prefer stable job listing URLs.\n3. Stop once enough relevant jobs have been gathered.'
  const toolUsageNotes = config.promptContext.toolUsageNotes?.length
    ? config.promptContext.toolUsageNotes.map((instruction) => `- ${instruction}`).join('\n')
    : '- Use navigate only for in-scope pages\n- Use extract_jobs when meaningful job content is visible\n- Finish as soon as the configured target is satisfied'
  const taskPacket = config.promptContext.taskPacket
  const taskPacketBlock = taskPacket
    ? [
        `PHASE GOAL: ${taskPacket.phaseGoal}`,
        taskPacket.strategyLabel ? `STRATEGY LABEL: ${taskPacket.strategyLabel}` : null,
        taskPacket.manualPrerequisiteState ? `MANUAL PREREQUISITE STATE: ${taskPacket.manualPrerequisiteState}` : null,
        taskPacket.priorPhaseSummary ? `PRIOR PHASE SUMMARY: ${taskPacket.priorPhaseSummary}` : null,
        taskPacket.knownFacts.length > 0 ? `KNOWN FACTS:\n${taskPacket.knownFacts.map((fact) => `- ${fact}`).join('\n')}` : null,
        taskPacket.successCriteria.length > 0 ? `SUCCESS CRITERIA:\n${taskPacket.successCriteria.map((criterion) => `- ${criterion}`).join('\n')}` : null,
        taskPacket.stopConditions.length > 0 ? `STOP CONDITIONS:\n${taskPacket.stopConditions.map((condition) => `- ${condition}`).join('\n')}` : null,
        taskPacket.avoidStrategyFingerprints.length > 0
          ? `AVOID RETRYING THESE PRIOR STRATEGIES:\n${taskPacket.avoidStrategyFingerprints.map((fingerprint) => `- ${fingerprint}`).join('\n')}`
          : null
      ]
        .filter(Boolean)
        .join('\n\n')
    : null

  return `You are an autonomous job discovery agent. Your only job is to find job postings on ${config.promptContext.siteLabel}.

USER PROFILE:
- Target roles: ${targetRoles}
- Preferred locations: ${preferredLocations}
- Experience level: ${config.userProfile.yearsExperience != null ? `${config.userProfile.yearsExperience} years` : 'Not specified'}
- Skills: ${config.userProfile.skills?.join(', ') || 'Not specified'}

CRITICAL INSTRUCTIONS:
${siteInstructions}
${config.promptContext.experimental ? `
${config.promptContext.siteLabel} is experimental. If the page structure looks unreliable, prefer a smaller high-confidence result set over low-quality guesses.` : ''}
Jobs may appear in any language. Do not treat non-English listings as lower quality just because of language, and preserve the original job language when extracting content.
Your goal: Find up to ${config.targetJobCount} relevant job postings.

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
- scroll_down: Load more job listings on the current page
- go_back: Return to search results from a job detail page
- extract_jobs: Extract job data when you see job listings
- finish: End when you have ${config.targetJobCount} jobs

TOOL USAGE NOTES:
${toolUsageNotes}

${taskPacketBlock ? `TASK PACKET:\n${taskPacketBlock}\n` : ''}

FOCUS:
- ${config.promptContext.siteLabel}
- Find ${config.targetJobCount} jobs or the best available set
- Save high-confidence jobs and finish
- Prefer site-specific findings over generic process notes
- Record real controls, filter behavior, URL patterns, and apply-entry caveats when you can prove them
- Prefer reusable guidance about where to start, what actually changes results, and what detail/apply patterns repeat across listings
- If a filter looks misleading, hidden, locale-specific, or non-functional, record that explicitly
- Avoid repeating the phase goal, starting URL, or obvious boundary rules in your findings unless they are the only proven facts
- Avoid exact job titles, company names, and full URLs in findings unless they are the only way to express a reusable rule or route pattern

${taskPacket ? `WHEN YOU CALL finish:
- Put the reason in "reason"
- Put one concise proven takeaway in "summary"
- Put proven controls/search entrypoints in "reliableControls"
- Put tricky or misleading filters/gotchas in "trickyFilters"
- Put route/detail-page behavior in "navigationTips"
- Put safe apply-entry observations in "applyTips"
- Put blockers or confidence caveats in "warnings"
- For search/filter phases, do not finish without either a proven result-changing control or an explicit note that no reliable control could be confirmed after trying alternatives
- For structure/navigation phases, say which route or entry path is the best repeatable way to reach jobs if you can prove it
- Leave arrays empty if you did not prove anything useful for that category` : ''}

Explain your reasoning before each action.`
}
