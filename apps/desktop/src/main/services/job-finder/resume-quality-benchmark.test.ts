import { describe, expect, test } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import type { ResumeTemplateDefinition } from '@unemployed/contracts'

import {
  defaultResumeQualityBenchmarkCases,
  runDesktopResumeQualityBenchmark,
  selectBenchmarkTemplateIds,
} from './resume-quality-benchmark'

describe('desktop resume quality benchmark', () => {
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

    expect(selectBenchmarkTemplateIds(templates)).toEqual([
      'classic_ats',
      'compact_exec',
    ])
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
    expect(report.cases.length).toBe(defaultResumeQualityBenchmarkCases.filter((entry) => entry.definition.canary).length * 8)
    expect(report.aggregate.groundedVisibleSkillRate).toBe(1)
    expect(report.aggregate.atsRenderPassRate).toBe(1)
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
  })

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
  })

  test('persists HTML artifacts when a target directory is provided', async () => {
    const persistArtifactsDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'resume-quality-report-artifacts-'),
    )

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
        const htmlPath = path.join(
          persistArtifactsDirectory,
          result.htmlArtifactRelativePath ?? '',
        )
        const html = await readFile(htmlPath, 'utf8')

        expect(html).toContain('<!doctype html>')
        expect(html).toContain('Alex Vanguard Resume')
      }
    } finally {
      await rm(persistArtifactsDirectory, { recursive: true, force: true })
    }
  })

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
  })

  test('includes real imported resume fixtures in the full quality corpus', () => {
    const realCaseIds = defaultResumeQualityBenchmarkCases
      .map((entry) => entry.definition.id)
      .filter((id) => id.startsWith('real_'))

    expect(realCaseIds).toEqual([
      'real_ebrar',
      'real_ebrar_new',
      'real_aaron_murphy',
      'real_paul_asselin',
      'real_ryan_holstien',
    ])
  })

  test('runs an imported real fixture through quality generation', async () => {
    const report = await runDesktopResumeQualityBenchmark({
      benchmarkVersion: '030-test-real-fixture-v1',
      caseIds: ['real_ebrar_new'],
      templateIds: ['classic_ats'],
    })

    expect(report.cases).toHaveLength(1)
    for (const result of report.cases) {
      expect(result.metrics.atsRenderPassRate).toBe(1)
      expect(result.metrics.bleedFreeCaseRate).toBe(1)
      expect(result.issueCategories).not.toContain('thin_output')
    }
  }, 20_000)
})
