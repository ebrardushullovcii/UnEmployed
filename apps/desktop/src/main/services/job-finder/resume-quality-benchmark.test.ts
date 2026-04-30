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
        label: 'Swiss Minimal - Standard',
        description: 'Apply-safe baseline.',
        bestFor: ['General applications'],
        density: 'balanced',
        deliveryLane: 'apply_safe',
        benchmarkEligible: true,
      },
      {
        id: 'modern_split',
        label: 'Swiss Minimal - Accent',
        description: 'Polished variant.',
        bestFor: ['Product roles'],
        density: 'balanced',
        deliveryLane: 'share_ready',
        benchmarkEligible: false,
      },
      {
        id: 'compact_exec',
        label: 'Executive Brief - Dense',
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
    ])
    expect(report.cases.length).toBe(defaultResumeQualityBenchmarkCases.filter((entry) => entry.definition.canary).length * 6)
    expect(report.aggregate.groundedVisibleSkillRate).toBe(1)
    expect(report.aggregate.atsRenderPassRate).toBe(1)
    expect(report.notes).toEqual([])
  })

  test('keeps contamination guard cases free of visible skill bleed after sanitation', async () => {
    const report = await runDesktopResumeQualityBenchmark({
      benchmarkVersion: '023-test-benchmark-v1',
      caseIds: ['contamination_guard'],
    })

    expect(report.cases).toHaveLength(6)
    for (const result of report.cases) {
      expect(result.visibleSkills).toEqual(expect.arrayContaining(['Figma']))
      expect(result.visibleSkills).not.toContain('Signal Systems')
      expect(result.visibleSkills).not.toContain('Greenhouse')
      expect(result.visibleSkills).not.toContain('Remote-first collaboration')
      expect(result.metrics.groundedVisibleSkillRate).toBe(1)
      expect(result.metrics.bleedFreeCaseRate).toBe(1)
    }
  })

  test('reports thin profile cases as not issue-free while keeping ATS rendering valid', async () => {
    const report = await runDesktopResumeQualityBenchmark({
      benchmarkVersion: '023-test-benchmark-v1',
      caseIds: ['thin_profile'],
    })

    expect(report.cases).toHaveLength(6)
    for (const result of report.cases) {
      expect(result.passed).toBe(false)
      expect(result.issueCategories).toContain('thin_output')
      expect(result.metrics.thinOutputFreeRate).toBe(0)
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
      expect(report.cases).toHaveLength(6)

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

    expect(report.cases).toHaveLength(12)

    for (const result of report.cases) {
      expect(result.passed).toBe(true)
      expect(result.metrics.issueFreeCaseRate).toBe(1)
      expect(result.metrics.atsRenderPassRate).toBe(1)
      expect(result.visibleSkills.length).toBeGreaterThan(0)
    }
  })
})
