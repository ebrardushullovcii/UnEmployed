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

FOCUS:
- ${config.promptContext.siteLabel}
- Find ${config.targetJobCount} jobs or the best available set
- Save high-confidence jobs and finish

Explain your reasoning before each action.`
}
