import { describe, expect, test } from 'vitest'

import type { ResumeDraft, ResumeDraftEntry } from '@unemployed/contracts'
import { sanitizeResumeDraft, validateResumeDraft } from './resume-workspace-helpers'
import { createEntry } from './resume-workspace-primitives'
import { createSeed } from '../workspace-service.test-support'

function createBullets(prefix: string, texts: string[]) {
  return texts.map((text, index) => ({
    id: `${prefix}_${index + 1}`,
    text,
    origin: 'ai_generated' as const,
    locked: false,
    included: true,
    sourceRefs: [],
    updatedAt: '2026-03-20T10:04:00.000Z',
  }))
}

function createBaseDraft(): ResumeDraft {
  return {
    id: 'resume_draft_job_ready',
    jobId: 'job_ready',
    status: 'draft',
    templateId: 'classic_ats',
    identity: null,
    sections: [
      {
        id: 'section_summary',
        kind: 'summary',
        label: 'Summary',
        text: 'Grounded summary.',
        bullets: [],
        entries: [],
        origin: 'ai_generated',
        locked: false,
        included: true,
        sortOrder: 0,
        profileRecordId: null,
        sourceRefs: [],
        updatedAt: '2026-03-20T10:04:00.000Z',
      },
      {
        id: 'section_skills',
        kind: 'skills',
        label: 'Core Skills',
        text: null,
        bullets: createBullets('skill_bullet', ['Figma']),
        entries: [],
        origin: 'ai_generated',
        locked: false,
        included: true,
        sortOrder: 1,
        profileRecordId: null,
        sourceRefs: [],
        updatedAt: '2026-03-20T10:04:00.000Z',
      },
      {
        id: 'section_experience',
        kind: 'experience',
        label: 'Experience',
        text: null,
        bullets: [],
        entries: [
          {
            id: 'experience_1',
            entryType: 'experience',
            title: 'Senior systems designer',
            subtitle: 'Orbit Commerce',
            location: 'London, UK',
            dateRange: '2020-01 – Present',
            summary: 'Builds resilient workflow tools.',
            bullets: createBullets('experience_bullet', [
              'Led design-system rollout across core surfaces.',
            ]),
            origin: 'ai_generated',
            locked: false,
            included: true,
            sortOrder: 0,
            profileRecordId: 'experience_1',
            sourceRefs: [],
            updatedAt: '2026-03-20T10:04:00.000Z',
          },
        ],
        origin: 'ai_generated',
        locked: false,
        included: true,
        sortOrder: 2,
        profileRecordId: null,
        sourceRefs: [],
        updatedAt: '2026-03-20T10:04:00.000Z',
      },
    ],
    targetPageCount: 2,
    generationMethod: 'ai',
    approvedAt: null,
    approvedExportId: null,
    staleReason: null,
    createdAt: '2026-03-20T10:04:00.000Z',
    updatedAt: '2026-03-20T10:04:00.000Z',
  }
}

function updateSection(
  draft: ResumeDraft,
  sectionId: string,
  updater: (section: ResumeDraft['sections'][number]) => ResumeDraft['sections'][number],
): ResumeDraft {
  return {
    ...draft,
    sections: draft.sections.map((section) =>
      section.id === sectionId ? updater(section) : section,
    ),
  }
}

function getSection(draft: ResumeDraft, sectionId: string) {
  const section = draft.sections.find((entry) => entry.id === sectionId)

  if (!section) {
    throw new Error(`Missing section '${sectionId}' in test draft.`)
  }

  return section
}

function getExperienceEntry(draft: ResumeDraft) {
  const experienceSection = getSection(draft, 'section_experience')
  const entry = experienceSection.entries[0]

  if (!entry) {
    throw new Error('Expected an experience entry in the test draft.')
  }

  return entry
}

function createDuplicateExperienceEntry(source: ResumeDraftEntry): ResumeDraftEntry {
  return {
    ...source,
    id: 'experience_2',
    title: 'Principal systems designer',
    bullets: createBullets('experience_duplicate', [
      'Led design-system rollout across core surfaces.',
    ]),
  }
}

function getSeedContext() {
  const seed = createSeed()
  const profile = seed.profile
  const job = seed.savedJobs.find((entry) => entry.id === 'job_ready')

  if (!job) {
    throw new Error('job not found: job_ready')
  }

  return { profile, job }
}

describe('resume workspace quality helpers', () => {
  test('sanitizeResumeDraft removes visible company and job-only skill bleed', () => {
    const { profile, job } = getSeedContext()
    const draft = updateSection(createBaseDraft(), 'section_skills', (section) => ({
      ...section,
      bullets: createBullets('skill_bullet', [
        'Figma',
        'Signal Systems',
        'Remote-first collaboration',
      ]),
    }))

    const sanitized = sanitizeResumeDraft({ draft, job, profile })
    const visibleSkills = getSection(sanitized, 'section_skills').bullets.map(
      (bullet) => bullet.text,
    )

    expect(visibleSkills).toEqual(['Figma'])
  })

  test('validateResumeDraft flags short job-only skill bleed that remains in a draft', () => {
    const { profile, job } = getSeedContext()
    const draft = updateSection(createBaseDraft(), 'section_skills', (section) => ({
      ...section,
      bullets: createBullets('skill_bullet', ['Remote-first collaboration']),
    }))

    const validation = validateResumeDraft({ draft, job, profile })

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'job_description_bleed',
          bulletId: 'skill_bullet_1',
        }),
      ]),
    )
  })

  test('sanitizeResumeDraft keeps grounded spoken languages visible', () => {
    const { job } = getSeedContext()
    const seed = createSeed()
    const profile = {
      ...seed.profile,
      spokenLanguages: [
        {
          id: 'language_1',
          language: 'English',
          proficiency: 'Native',
          interviewPreference: false,
          notes: null,
        },
      ],
    }
    const draft = {
      ...createBaseDraft(),
      sections: [
        ...createBaseDraft().sections,
        {
          id: 'section_languages',
          kind: 'skills' as const,
          label: 'Languages',
          text: null,
          bullets: createBullets('language_bullet', ['English — Native']),
          entries: [],
          origin: 'ai_generated' as const,
          locked: false,
          included: true,
          sortOrder: 3,
          profileRecordId: null,
          sourceRefs: [],
          updatedAt: '2026-03-20T10:04:00.000Z',
        },
      ],
    }

    const sanitized = sanitizeResumeDraft({ draft, job, profile })

    expect(getSection(sanitized, 'section_languages').bullets.map((bullet) => bullet.text)).toEqual([
      'English — Native',
    ])
  })

  test('sanitizeResumeDraft keeps grounded action bullets that include multiple commas', () => {
    const { profile, job } = getSeedContext()
    const actionBullet =
      'Partnered with product, design, and platform engineering to standardize components, testing, and performance budgets.'
    const draft = updateSection(createBaseDraft(), 'section_experience', (section) => ({
      ...section,
      entries: section.entries.map((entry) => ({
        ...entry,
        bullets: createBullets('experience_bullet', [
          'Led design-system rollout across core surfaces.',
          actionBullet,
        ]),
      })),
    }))

    const sanitized = sanitizeResumeDraft({ draft, job, profile })
    const visibleBullets = getExperienceEntry(sanitized).bullets.map((bullet) => bullet.text)

    expect(visibleBullets).toEqual([
      'Led design-system rollout across core surfaces.',
      actionBullet,
    ])
  })

  test('sanitizeResumeDraft removes copied job-description summary prose and copied section bullets', () => {
    const { profile, job } = getSeedContext()
    const copiedSummary = job.description
    const copiedResponsibility = job.responsibilities[0] ?? 'Own the design system roadmap.'
    const draftWithSummaryBleed = updateSection(
      updateSection(createBaseDraft(), 'section_summary', (section) => ({
        ...section,
        text: copiedSummary,
      })),
      'section_experience',
      (section) => ({
        ...section,
        bullets: createBullets('experience_section_bleed', [copiedResponsibility]),
        entries: section.entries.map((entry) => ({
          ...entry,
          bullets: createBullets('experience_quality', [
            copiedResponsibility,
            'React, TypeScript, Design Systems, Figma, Playwright, Accessibility, Testing',
            'Improved workflow QA handoff across release reviews.',
          ]),
        })),
      }),
    )

    const sanitized = sanitizeResumeDraft({
      draft: draftWithSummaryBleed,
      job,
      profile,
    })
    const summarySection = getSection(sanitized, 'section_summary')
    const experienceEntry = getExperienceEntry(sanitized)

    expect(summarySection.text).toBeNull()
    expect(summarySection.included).toBe(false)
    expect(getSection(sanitized, 'section_experience').bullets).toEqual([])
    expect(experienceEntry.bullets.map((bullet) => bullet.text)).toEqual([
      'Improved workflow QA handoff across release reviews.',
    ])
  })

  test('validateResumeDraft flags copied job-description section bullets without false grounding from short profile tokens', () => {
    const { profile, job } = getSeedContext()
    const copiedResponsibility = job.responsibilities[0] ?? 'Own the design system roadmap.'
    const draft = updateSection(createBaseDraft(), 'section_experience', (section) => ({
      ...section,
      bullets: createBullets('experience_section_validate', [copiedResponsibility]),
    }))

    const validation = validateResumeDraft({ draft, job, profile })

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'job_description_bleed',
          bulletId: 'experience_section_validate_1',
        }),
      ]),
    )
  })

  test('validateResumeDraft flags keyword stuffing and vague filler when they remain in bullets', () => {
    const { profile, job } = getSeedContext()
    const draft = updateSection(createBaseDraft(), 'section_experience', (section) => ({
      ...section,
      entries: section.entries.map((entry) => ({
        ...entry,
        bullets: createBullets('experience_validate', [
          'React, TypeScript, Design Systems, Figma, Playwright, Accessibility, Testing',
          'Results-driven team player who thrives in fast-paced environments.',
        ]),
      })),
    }))

    const validation = validateResumeDraft({ draft, job, profile })

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'keyword_stuffing',
          bulletId: 'experience_validate_1',
        }),
        expect.objectContaining({
          category: 'vague_filler',
          bulletId: 'experience_validate_2',
        }),
      ]),
    )
  })

  test('validateResumeDraft flags duplicate bullets and duplicate entry summaries', () => {
    const { profile, job } = getSeedContext()
    const duplicateEntry = createDuplicateExperienceEntry(getExperienceEntry(createBaseDraft()))
    const draft = updateSection(createBaseDraft(), 'section_experience', (section) => ({
      ...section,
      entries: [...section.entries, duplicateEntry],
    }))

    const validation = validateResumeDraft({ draft, job, profile })

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'duplicate_bullet',
          bulletId: 'experience_duplicate_1',
        }),
        expect.objectContaining({
          category: 'duplicate_section_content',
          entryId: 'experience_2',
        }),
      ]),
    )
  })

  test('validateResumeDraft flags thin output when only a fragment remains', () => {
    const { profile, job } = getSeedContext()
    const draft = {
      ...createBaseDraft(),
      sections: [
        {
          ...getSection(createBaseDraft(), 'section_summary'),
          text: 'Brief summary.',
          bullets: [],
          entries: [],
          included: true,
        },
        {
          ...getSection(createBaseDraft(), 'section_skills'),
          bullets: [],
          included: false,
        },
        {
          ...getSection(createBaseDraft(), 'section_experience'),
          bullets: [],
          entries: [],
          included: false,
        },
      ],
    }

    const validation = validateResumeDraft({ draft, job, profile })

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'thin_output',
        }),
      ]),
    )
  })

  test('validateResumeDraft flags page overflow at three pages as an error', () => {
    const { profile, job } = getSeedContext()
    const validation = validateResumeDraft({
      draft: createBaseDraft(),
      job,
      profile,
      pageCount: 3,
    })

    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'page_overflow',
          severity: 'error',
        }),
      ]),
    )
  })

  test('createEntry removes near-duplicate long bullets without dropping short skills', () => {
    const entry = createEntry({
      id: 'experience_net_migration',
      entryType: 'experience',
      title: '.NET Developer',
      subtitle: 'CREA-KO',
      bullets: [
        'Assisted in migrating a web-based ERP system from .NET Framework to .NET Core MVC, refactoring both front-end and back-end code to enhance performance, scalability, and alignment with the .NET Core MVC architecture.',
        'Refactored front-end and back-end code to align with .NET Core MVC architecture, improving the performance and scalability of the web application.',
        'Replaced 12 deprecated NuGet packages, eliminating 100+ security warnings in CI builds.',
      ],
      updatedAt: '2026-03-20T10:04:00.000Z',
      origin: 'imported',
      sortOrder: 0,
    })

    expect(entry.bullets.map((bullet) => bullet.text)).toEqual([
      'Assisted in migrating a web-based ERP system from .NET Framework to .NET Core MVC, refactoring both front-end and back-end code to enhance performance, scalability, and alignment with the .NET Core MVC architecture.',
      'Replaced 12 deprecated NuGet packages, eliminating 100+ security warnings in CI builds.',
    ])
  })
})
