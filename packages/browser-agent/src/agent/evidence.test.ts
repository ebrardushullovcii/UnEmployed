import { describe, expect, test, vi } from 'vitest'
import { addExtractedJobsToState, recordToolEvidence } from './evidence'
import type { AgentState } from '../types'

function createState(): AgentState {
  return {
    conversation: [],
    reviewTranscript: [],
    collectedJobs: [],
    deferredSearchExtractions: new Map(),
    visitedUrls: new Set(),
    stepCount: 0,
    currentUrl: 'https://jobs.example.com/search?debug=1',
    lastStableUrl: 'https://jobs.example.com/search',
    isRunning: true,
    phaseEvidence: {
      visibleControls: [],
      successfulInteractions: [],
      routeSignals: [],
      attemptedControls: [],
      warnings: []
    },
    compactionState: null,
    compactionStatus: {
      lastTriggerKind: null,
      usedMessageCountFallback: false,
      lastEstimatedTokensBefore: null,
      lastEstimatedTokensAfter: null,
    }
  }
}

describe('recordToolEvidence', () => {
  test('sanitizes user-facing warnings and logs raw tool errors', () => {
    const state = createState()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      recordToolEvidence(
        'fill',
        { role: 'searchbox', name: 'Keywords' },
        { success: false, error: 'Timeout 10000ms exceeded while querying internal selector stack' },
        state
      )

      expect(state.phaseEvidence.warnings).toEqual(['fill timed out.'])
      expect(errorSpy).toHaveBeenCalledWith(
        '[Agent] Tool failed during evidence recording:',
        expect.objectContaining({
          error: 'Timeout 10000ms exceeded while querying internal selector stack',
          toolName: 'fill'
        })
      )
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('addExtractedJobsToState', () => {
  test('keeps distinct LinkedIn seeded-search cards that share a search-route canonical url', () => {
    const state = createState()

    const addedCount = addExtractedJobsToState(
      [
        {
          sourceJobId: 'linkedin_seeded_card_frontend',
          canonicalUrl:
            'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
          title: 'Frontend Engineer',
          company: 'Odiin',
          location: 'Prishtina, Kosovo',
          description: 'Frontend role.',
          salaryText: null,
          summary: 'Frontend role.',
          postedAt: null,
          workMode: ['remote'],
          applyPath: 'unknown',
          easyApplyEligible: false,
          keySkills: [],
        },
        {
          sourceJobId: 'linkedin_seeded_card_fullcircle',
          canonicalUrl:
            'https://www.linkedin.com/jobs/search/?keywords=Senior+Full-Stack+Software+Engineer&location=Prishtina%2C+Kosovo',
          title: 'Full Stack Developer (AI-First)',
          company: 'Full Circle Agency',
          location: 'Prishtina (Remote)',
          description: 'Full-stack role.',
          salaryText: null,
          summary: 'Full-stack role.',
          postedAt: null,
          workMode: ['remote'],
          applyPath: 'unknown',
          easyApplyEligible: false,
          keySkills: [],
        },
      ],
      state,
      'target_site',
    )

    expect(addedCount).toBe(2)
    expect(state.collectedJobs).toHaveLength(2)
    expect(state.collectedJobs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceJobId: 'linkedin_seeded_card_frontend' }),
        expect.objectContaining({ sourceJobId: 'linkedin_seeded_card_fullcircle' }),
      ]),
    )
  })

  test('still deduplicates stable LinkedIn detail urls', () => {
    const state = createState()

    const addedCount = addExtractedJobsToState(
      [
        {
          sourceJobId: 'linkedin_detail_1',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4404542575/',
          title: 'Full Stack Developer (AI-First)',
          company: 'Full Circle Agency',
          location: 'Prishtina (Remote)',
          description: 'First copy.',
          salaryText: null,
          summary: 'First copy.',
          postedAt: null,
          workMode: ['remote'],
          applyPath: 'unknown',
          easyApplyEligible: false,
          keySkills: [],
        },
        {
          sourceJobId: 'linkedin_detail_2',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4404542575/',
          title: 'Full Stack Developer (AI-First)',
          company: 'Full Circle Agency',
          location: 'Prishtina (Remote)',
          description: 'Second copy.',
          salaryText: null,
          summary: 'Second copy.',
          postedAt: null,
          workMode: ['remote'],
          applyPath: 'unknown',
          easyApplyEligible: false,
          keySkills: [],
        },
      ],
      state,
      'target_site',
    )

    expect(addedCount).toBe(1)
    expect(state.collectedJobs).toHaveLength(1)
    expect(state.collectedJobs[0]).toEqual(
      expect.objectContaining({
        sourceJobId: 'linkedin_detail_2',
        description: 'Second copy.',
      }),
    )
  })

  test('upgrades an earlier weak duplicate when a later extraction finds a stronger version of the same LinkedIn job', () => {
    const state = createState()

    const initialAddedCount = addExtractedJobsToState(
      [
        {
          sourceJobId: 'linkedin_detail_weak',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4404542575/',
          title: 'Full Stack Engineer',
          company: 'Full Stack Engineer Confidential',
          location: 'Kosovo (Remote)',
          description: 'Weak first copy.',
          salaryText: null,
          summary: 'Weak first copy.',
          postedAt: null,
          workMode: ['remote'],
          applyPath: 'unknown',
          easyApplyEligible: false,
          keySkills: [],
        },
      ],
      state,
      'target_site',
    )

    const replacementAddedCount = addExtractedJobsToState(
      [
        {
          sourceJobId: 'linkedin_detail_better',
          canonicalUrl: 'https://www.linkedin.com/jobs/view/4404542575/',
          title: 'Full Stack Developer (AI-First)',
          company: 'Full Circle Agency',
          location: 'Prishtina (Remote)',
          description: 'Stronger later copy.',
          salaryText: null,
          summary: 'Stronger later copy.',
          postedAt: null,
          workMode: ['remote'],
          applyPath: 'unknown',
          easyApplyEligible: false,
          keySkills: ['TypeScript', 'React'],
          responsibilities: ['Build AI-first product features.'],
        },
      ],
      state,
      'target_site',
    )

    expect(initialAddedCount).toBe(1)
    expect(replacementAddedCount).toBe(0)
    expect(state.collectedJobs).toHaveLength(1)
    expect(state.collectedJobs[0]).toEqual(
      expect.objectContaining({
        canonicalUrl: 'https://www.linkedin.com/jobs/view/4404542575/',
        title: 'Full Stack Developer (AI-First)',
        company: 'Full Circle Agency',
        location: 'Prishtina (Remote)',
      }),
    )
  })
})
