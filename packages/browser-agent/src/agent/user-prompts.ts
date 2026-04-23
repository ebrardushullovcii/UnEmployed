import type { AgentConfig, AgentState } from '../types'

const SEEDED_QUERY_IGNORED_PARAMS = new Set(['page', 'currentJobId', 'selectedJobId', 'trk', 'trackingId'])

function describeSeededSearchQuery(config: AgentConfig): string | null {
  for (const value of config.startingUrls) {
    try {
      const url = new URL(value)
      const parts = [...url.searchParams.entries()]
        .flatMap(([key, rawValue]) => {
          if (SEEDED_QUERY_IGNORED_PARAMS.has(key)) {
            return []
          }

          const value = rawValue.trim()
          if (!value) {
            return []
          }

          return [`${key}: ${value}`]
        })
        .slice(0, 3)

      if (parts.length === 0) {
        continue
      }

      return `Seeded search query: ${parts.join(' | ')}. Preserve these exact terms when using the visible search UI. Only broaden them if the seeded query clearly yields no usable results or the site proves it is invalid.`
    } catch {
      continue
    }
  }

  return null
}

export function buildForcedFinishPrompt(state: AgentState, config: AgentConfig): string {
  const taskPacket = config.promptContext.taskPacket
  const visibleControls = state.phaseEvidence.visibleControls.slice(0, 6)
  const routeSignals = state.phaseEvidence.routeSignals.slice(0, 6)
  const attemptedControls = state.phaseEvidence.attemptedControls.slice(0, 6)
  const warnings = state.phaseEvidence.warnings.slice(0, 4)

  return [
    'Final phase-closeout turn.',
    taskPacket?.phaseGoal ? `Phase goal: ${taskPacket.phaseGoal}` : null,
    'Your next response must call finish.',
    'Use the evidence you already observed. If no reusable control or route was proven, still call finish and say that explicitly.',
    state.currentUrl ? `Current URL: ${state.currentUrl}` : null,
    `Visited pages: ${state.visitedUrls.size}. Sampled jobs: ${state.collectedJobs.length}.`,
    visibleControls.length > 0 ? `Visible controls seen:\n${visibleControls.map((value) => `- ${value}`).join('\n')}` : null,
    routeSignals.length > 0 ? `Route signals seen:\n${routeSignals.map((value) => `- ${value}`).join('\n')}` : null,
    attemptedControls.length > 0 ? `Controls attempted:\n${attemptedControls.map((value) => `- ${value}`).join('\n')}` : null,
    warnings.length > 0 ? `Warnings:\n${warnings.map((value) => `- ${value}`).join('\n')}` : null
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n\n')
}

export function createUserPrompt(config: AgentConfig): string {
  const targetRoles = config.searchPreferences.targetRoles.length > 0
    ? config.searchPreferences.targetRoles.join(', ')
    : 'Not specified'
  const preferredLocations = config.searchPreferences.locations.length > 0
    ? config.searchPreferences.locations.join(', ')
    : 'Not specified'
  const taskPacket = config.promptContext.taskPacket
  const isPhaseDrivenDebugRun = Boolean(taskPacket)
  const seededSearchQuery = describeSeededSearchQuery(config)

  return `Please find job postings that match my profile and preferences.

Target Roles: ${targetRoles}
Preferred Locations: ${preferredLocations}
Experience Level: ${config.userProfile.yearsExperience != null ? `${config.userProfile.yearsExperience} years` : 'Not specified'}

Starting URLs to explore:
${config.startingUrls.map(url => `- ${url}`).join('\n')}

${seededSearchQuery ? `${seededSearchQuery}
` : ''}

${isPhaseDrivenDebugRun
    ? `Phase Evidence Budget: sample up to ${config.targetJobCount} relevant job postings only when they help prove the phase goal. Reaching the sampling budget is not completion by itself.`
    : `Goal: Find ${config.targetJobCount} relevant job postings.`}

${taskPacket ? `Phase Goal: ${taskPacket.phaseGoal}
Known facts:
${taskPacket.knownFacts.length > 0 ? taskPacket.knownFacts.map((fact) => `- ${fact}`).join('\n') : '- None yet'}
Success criteria:
${taskPacket.successCriteria.length > 0 ? taskPacket.successCriteria.map((criterion) => `- ${criterion}`).join('\n') : '- Find credible evidence on the site'}
Stop conditions:
${taskPacket.stopConditions.length > 0 ? taskPacket.stopConditions.map((condition) => `- ${condition}`).join('\n') : '- Stop when progress stalls'}
` : ''}

The site may present listings in any language. Treat multilingual and non-English jobs as valid candidates when they match the target roles and locations.

Instructions:
${isPhaseDrivenDebugRun
    ? `1. Navigate to the starting URLs
2. On landing pages or jobs hubs, inspect visible controls and reusable entry paths before you start extracting jobs
3. Use search boxes, chips, dropdowns, filters, recommendation rows, and show-all routes when they are visible
4. Use select_option for visible dropdowns or combobox filters such as city, industry, category, or work mode
5. Extract structured job data only when it helps prove the current route, control, detail, or apply behavior
6. Click into job details to confirm stable identity or apply-entry behavior when needed
7. Call finish only after the phase goal is satisfied or you can clearly explain why progress is blocked`
    : `1. Navigate to the starting URLs
2. Use search functionality if available, or scroll through listings
3. Click into job details to get full descriptions when needed
4. Extract structured job data using the extract_jobs tool
5. Navigate back to continue searching
6. Continue until you've found ${config.targetJobCount} relevant jobs or exhausted options`}

Focus on recent postings that match the target roles and locations.`
}
