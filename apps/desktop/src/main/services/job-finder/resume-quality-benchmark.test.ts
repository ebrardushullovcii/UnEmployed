import { describe, expect, test } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import type { ResumeQualityBenchmarkMetrics, ResumeTemplateDefinition } from '@unemployed/contracts'
import { deriveResumeCoveragePlan } from '@unemployed/ai-providers'

import {
  calculateFragmentFreeExperienceBulletRate,
  calculateProfessionalExperienceSummaryRate,
  calculateVisibleWorkHistoryCoverageRate,
  calculateWorkHistoryRepresentationRate,
  defaultResumeQualityBenchmarkCases,
  isProfessionalExperienceSummary,
  isSuspiciousExperienceBulletFragment,
  passesResumeQualityAcceptance,
  runDesktopResumeQualityBenchmark,
  selectBenchmarkTemplateIds,
} from './resume-quality-benchmark'

describe('desktop resume quality benchmark', () => {
  test('requires complete visible work history and an issue-free result for acceptance', () => {
    const metrics: ResumeQualityBenchmarkMetrics = {
      groundedVisibleSkillRate: 1,
      workHistoryRepresentationRate: 1,
      visibleWorkHistoryCoverageRate: 1,
      fragmentFreeExperienceBulletRate: 1,
      professionalExperienceSummaryRate: 1,
      bleedFreeCaseRate: 1,
      keywordCoverageRate: 1,
      duplicateIssueFreeRate: 1,
      thinOutputFreeRate: 1,
      pageTargetPassRate: 1,
      atsRenderPassRate: 1,
      issueFreeCaseRate: 1,
    }

    expect(passesResumeQualityAcceptance(metrics)).toBe(true)

    for (const metric of [
      'workHistoryRepresentationRate',
      'visibleWorkHistoryCoverageRate',
      'fragmentFreeExperienceBulletRate',
      'professionalExperienceSummaryRate',
      'issueFreeCaseRate',
    ] as const) {
      expect(
        passesResumeQualityAcceptance({
          ...metrics,
          [metric]: 0,
        }),
      ).toBe(false)
    }
  })

  test('requires visible canonical work history outside conservative tailoring mode', () => {
    expect(
      calculateWorkHistoryRepresentationRate({
        profileExperienceIds: ['experience_current', 'experience_hidden'],
        draftExperienceEntries: [
          { included: true, profileRecordId: 'experience_current' },
          { included: true, profileRecordId: 'experience_hidden' },
        ],
        tailoringMode: 'balanced',
      }),
    ).toBe(1)
    expect(
      calculateWorkHistoryRepresentationRate({
        profileExperienceIds: ['experience_current', 'experience_missing'],
        draftExperienceEntries: [{ included: true, profileRecordId: 'experience_current' }],
        tailoringMode: 'balanced',
      }),
    ).toBe(0.5)
    expect(
      calculateWorkHistoryRepresentationRate({
        profileExperienceIds: ['experience_current', 'experience_hidden'],
        draftExperienceEntries: [
          { included: true, profileRecordId: 'experience_current' },
          { included: false, profileRecordId: 'experience_hidden' },
        ],
        tailoringMode: 'balanced',
      }),
    ).toBe(0.5)
  })

  test('allows conservative visibility choices only when every canonical role remains represented for review', () => {
    expect(
      calculateWorkHistoryRepresentationRate({
        profileExperienceIds: ['experience_current', 'experience_hidden'],
        draftExperienceEntries: [
          { included: true, profileRecordId: 'experience_current' },
          { included: false, profileRecordId: 'experience_hidden' },
        ],
        tailoringMode: 'conservative',
      }),
    ).toBe(1)
    expect(
      calculateWorkHistoryRepresentationRate({
        profileExperienceIds: ['experience_current', 'experience_missing'],
        draftExperienceEntries: [{ included: true, profileRecordId: 'experience_current' }],
        tailoringMode: 'conservative',
      }),
    ).toBe(0.5)
  })

  test('reports visible work-history coverage separately from draft representation', () => {
    const draftExperienceEntries = [
      { included: true, profileRecordId: 'experience_current' },
      { included: false, profileRecordId: 'experience_hidden' },
      { included: true, profileRecordId: 'experience_unmatched' },
      { included: true, profileRecordId: null },
    ]

    expect(
      calculateWorkHistoryRepresentationRate({
        profileExperienceIds: ['experience_current', 'experience_hidden'],
        draftExperienceEntries,
        tailoringMode: 'conservative',
      }),
    ).toBe(1)
    expect(
      calculateVisibleWorkHistoryCoverageRate({
        profileExperienceIds: ['experience_current', 'experience_hidden'],
        draftExperienceEntries,
      }),
    ).toBe(0.5)
    expect(
      calculateVisibleWorkHistoryCoverageRate({
        profileExperienceIds: [],
        draftExperienceEntries: [],
      }),
    ).toBe(1)
  })

  test('flags short comma-split fragments without rejecting concise achievements', () => {
    expect(isSuspiciousExperienceBulletFragment('Next.js')).toBe(true)
    expect(isSuspiciousExperienceBulletFragment('TailwindCSS & WebSockets.')).toBe(true)
    expect(isSuspiciousExperienceBulletFragment('synchronizing UI state.')).toBe(true)
    expect(isSuspiciousExperienceBulletFragment('Built release tools. Built release tools.')).toBe(true)
    expect(isSuspiciousExperienceBulletFragment('Led QA.')).toBe(false)
    expect(isSuspiciousExperienceBulletFragment('Basic collaboration support.')).toBe(false)
    expect(calculateFragmentFreeExperienceBulletRate(['Led QA.', 'TailwindCSS & WebSockets.'])).toBe(0.5)
    expect(
      calculateFragmentFreeExperienceBulletRate([
        'Led design-system rollout across core surfaces.',
        'Led the design system rollout across core product surfaces.',
      ]),
    ).toBe(0.5)
  })

  test('rejects first-person career-change and location-only experience summaries', () => {
    expect(
      isProfessionalExperienceSummary('Built resilient workflow tools for release teams.', {
        location: 'Remote',
      }),
    ).toBe(true)
    expect(
      isProfessionalExperienceSummary('After deciding to return to my passion, I moved back into engineering.', {
        location: 'Remote',
      }),
    ).toBe(false)
    expect(
      isProfessionalExperienceSummary('Worked on various things and helped with lots of stuff.', {
        location: 'Remote',
      }),
    ).toBe(false)
    expect(
      isProfessionalExperienceSummary('Built resilient tools. Built resilient tools.', { location: 'Remote' }),
    ).toBe(false)
    expect(isProfessionalExperienceSummary('REMOTE, KOSOVO', { location: 'Kosovo' })).toBe(false)
    expect(
      calculateProfessionalExperienceSummaryRate([
        {
          summary: 'Built resilient workflow tools for release teams.',
          location: 'Remote',
        },
        { summary: 'Pristina, Kosovo', location: null },
      ]),
    ).toBe(0.5)
  })

  test('selects only benchmark-eligible templates for benchmark runs', () => {
    const templates: ResumeTemplateDefinition[] = [
      {
        id: 'classic_ats',
        label: 'Chronology Classic',
        description: 'Apply-safe baseline.',
        bestFor: ['General applications'],
        density: 'balanced',
        deliveryLane: 'apply_safe',
        benchmarkEligible: true,
      },
      {
        id: 'modern_split',
        label: 'Modern Editorial',
        description: 'Polished variant.',
        bestFor: ['Product roles'],
        density: 'balanced',
        deliveryLane: 'share_ready',
        benchmarkEligible: false,
      },
      {
        id: 'compact_exec',
        label: 'Senior Brief',
        description: 'Dense ATS-safe variant.',
        bestFor: ['Leadership screens'],
        density: 'compact',
        deliveryLane: 'apply_safe',
      },
    ]

    expect(selectBenchmarkTemplateIds(templates)).toEqual(['classic_ats', 'compact_exec'])
  })

  test('runs canary corpus cases across shipped ATS templates', async () => {
    const report = await runDesktopResumeQualityBenchmark({
      benchmarkVersion: '023-test-benchmark-v1',
      canaryOnly: true,
    })

    expect(report.templates).toEqual([
      'classic_ats',
      'compact_exec',
      'modern_split',
      'technical_matrix',
      'project_showcase',
      'credentials_focus',
      'timeline_longform',
      'career_pivot',
    ])
    expect(report.cases.length).toBe(
      defaultResumeQualityBenchmarkCases.filter((entry) => entry.definition.canary).length * 8,
    )
    expect(report.aggregate.groundedVisibleSkillRate).toBe(1)
    expect(report.aggregate.workHistoryRepresentationRate).toBe(1)
    expect(report.aggregate.visibleWorkHistoryCoverageRate).toBe(1)
    expect(report.aggregate.fragmentFreeExperienceBulletRate).toBe(1)
    expect(report.aggregate.professionalExperienceSummaryRate).toBe(1)
    expect(report.aggregate.atsRenderPassRate).toBe(1)
    expect(report.providerMode).toBe('deterministic')
    expect(
      report.cases.every((entry) => entry.generationDurationMs >= 0),
    ).toBe(true)
    expect(
      report.cases.every((entry) => entry.generationDiagnostics === null),
    ).toBe(true)
    expect(report.notes).toEqual([])
  }, 10_000)

  test('keeps contamination guard cases free of visible skill bleed after sanitation', async () => {
    const report = await runDesktopResumeQualityBenchmark({
      benchmarkVersion: '023-test-benchmark-v1',
      caseIds: ['contamination_guard'],
    })

    expect(report.cases).toHaveLength(8)
    for (const result of report.cases) {
      expect(result.visibleSkills).toEqual(expect.arrayContaining(['Figma']))
      expect(result.visibleSkills).not.toContain('Signal Systems')
      expect(result.visibleSkills).not.toContain('Greenhouse')
      expect(result.visibleSkills).not.toContain('Remote-first collaboration')
      expect(result.metrics.groundedVisibleSkillRate).toBe(1)
      expect(result.metrics.bleedFreeCaseRate).toBe(1)
    }
  }, 10_000)

  test('keeps thin profile cases ATS-safe while clearing the thin-output failure class', async () => {
    const report = await runDesktopResumeQualityBenchmark({
      benchmarkVersion: '023-test-benchmark-v1',
      caseIds: ['thin_profile'],
    })

    expect(report.cases).toHaveLength(8)
    for (const result of report.cases) {
      expect(result.passed).toBe(true)
      expect(result.issueCategories).not.toContain('thin_output')
      expect(result.metrics.thinOutputFreeRate).toBe(1)
      expect(result.metrics.atsRenderPassRate).toBe(1)
    }
  }, 10_000)

  test('persists HTML artifacts when a target directory is provided', async () => {
    const persistArtifactsDirectory = await mkdtemp(path.join(os.tmpdir(), 'resume-quality-report-artifacts-'))

    try {
      const report = await runDesktopResumeQualityBenchmark({
        benchmarkVersion: '023-test-benchmark-v1',
        caseIds: ['grounded_baseline'],
        persistArtifactsDirectory,
      })

      expect(report.persistedArtifactsDirectory).toBe(persistArtifactsDirectory)
      expect(report.cases).toHaveLength(8)

      for (const result of report.cases) {
        expect(result.htmlArtifactRelativePath).toBeTruthy()
        const htmlPath = path.join(persistArtifactsDirectory, result.htmlArtifactRelativePath ?? '')
        const html = await readFile(htmlPath, 'utf8')

        expect(html).toContain('<!doctype html>')
        expect(html).toContain('Alex Vanguard Resume')
      }
    } finally {
      await rm(persistArtifactsDirectory, { recursive: true, force: true })
    }
  }, 15_000)

  test('renders broader archetype cases with grounded ATS-safe output', async () => {
    const report = await runDesktopResumeQualityBenchmark({
      benchmarkVersion: '023-test-benchmark-v1',
      caseIds: ['frontend_platform', 'analytics_lead'],
    })

    expect(report.cases).toHaveLength(16)

    for (const result of report.cases) {
      expect(result.passed).toBe(true)
      expect(result.metrics.issueFreeCaseRate).toBe(1)
      expect(result.metrics.atsRenderPassRate).toBe(1)
      expect(result.visibleSkills.length).toBeGreaterThan(0)
    }
  }, 20_000)

  test('includes real imported resume fixtures in the full quality corpus', () => {
    const realCaseIds = defaultResumeQualityBenchmarkCases
      .map((entry) => entry.definition.id)
      .filter((id) => id.startsWith('real_'))

    expect(realCaseIds).toEqual([
      'real_resume_import_comprehensive_txt',
      'real_ebrar',
      'real_ebrar_new',
      'real_aaron_murphy',
      'real_paul_asselin',
      'real_ryan_holstien',
    ])
  })

  test('keeps every usable Ebrar work-history record visible in balanced tailoring', async () => {
    const report = await runDesktopResumeQualityBenchmark({
      benchmarkVersion: '030-test-real-fixture-v1',
      caseIds: ['real_ebrar_new'],
      templateIds: ['classic_ats'],
    })

    expect(report.cases).toHaveLength(1)
    for (const result of report.cases) {
      expect(result.metrics.workHistoryRepresentationRate).toBe(1)
      expect(result.metrics.visibleWorkHistoryCoverageRate).toBe(1)
      expect(result.passed).toBe(result.metrics.issueFreeCaseRate === 1)
      expect(result.metrics.fragmentFreeExperienceBulletRate).toBe(1)
      expect(result.metrics.professionalExperienceSummaryRate).toBe(1)
      expect(result.metrics.atsRenderPassRate).toBe(1)
      expect(result.metrics.bleedFreeCaseRate).toBe(1)
      expect(result.issueCategories).not.toContain('thin_output')
    }

    const fixture = defaultResumeQualityBenchmarkCases.find(
      (entry) => entry.definition.id === 'real_ebrar_new',
    )
    expect(fixture).toBeDefined()
    const state = await fixture!.buildState('classic_ats')
    const technicalSupportRole = state.profile.experiences.find(
      (experience) =>
        experience.title === 'Technical Support Agent' && experience.companyName === 'BIT BY BIT',
    )
    expect(technicalSupportRole).toBeDefined()
    const coverage = deriveResumeCoveragePlan({
      profile: state.profile,
      searchPreferences: state.searchPreferences,
      job: state.savedJobs[0]!,
    })

    expect(coverage.find((entry) => entry.profileRecordId === technicalSupportRole!.id)).toMatchObject({
      classification: 'compact',
      careerFamilyFit: 'weak',
    })
  }, 20_000)
})
