import { useEffect, useMemo, useRef, useState } from 'react'
import type { ResumeTemplateDefinition, ResumeTemplateId } from '@unemployed/contracts'
import {
  getResumeTemplateAtsConfidence,
  getResumeTemplateDeliveryLane,
  getResumeTemplateFamilyId,
  getResumeTemplateFamilyLabel,
  getResumeTemplateVariantLabel,
  getResumeTemplateVisualTags,
} from '@unemployed/contracts'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { renderResumeTemplateCatalogPreviewHtml } from '../../../../../shared/job-finder-resume-renderer'

export interface ResumeThemePickerRecommendationContext {
  jobTitle: string | null
  jobKeywords: readonly string[]
  hasProjects: boolean
  hasCertifications: boolean
  hasFormalEducation: boolean
  experienceEntryCount: number
  totalIncludedBulletCount: number
}

export interface ResumeThemePickerRecommendation {
  templateId: ResumeTemplateId
  reason: string
}

interface ResumeThemePickerProps {
  disabled?: boolean
  id?: string
  mode?: 'full' | 'compact'
  recommendationContext?: ResumeThemePickerRecommendationContext | null
  selectedThemeId: ResumeTemplateId
  themes: readonly ResumeTemplateDefinition[]
  onChange: (themeId: ResumeTemplateId) => void
}

interface ResumeTemplateFamilyViewModel {
  id: string
  label: string
  description: string
  deliveryLane: 'apply_safe' | 'share_ready'
  atsConfidence: 'high' | 'medium' | 'low'
  fitSummary: string | null
  familySortOrder: number
  templates: readonly ResumeTemplateDefinition[]
}

function getLaneLabel(lane: 'apply_safe' | 'share_ready') {
  return lane === 'apply_safe' ? 'Apply-safe' : 'Share-ready'
}

function getAtsConfidenceLabel(confidence: 'high' | 'medium' | 'low') {
  switch (confidence) {
    case 'high':
      return 'ATS high confidence'
    case 'medium':
      return 'ATS medium confidence'
    case 'low':
      return 'ATS lower confidence'
  }
}

function getLaneBadgeVariant(lane: 'apply_safe' | 'share_ready') {
  return lane === 'apply_safe' ? 'default' : 'outline'
}

function normalizeRecommendationSignal(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function hasAnySignal(haystack: readonly string[], needles: readonly string[]): boolean {
  const signalTokenSets = haystack.map((signal) => new Set(normalizeRecommendationSignal(signal).split(' ').filter(Boolean)))

  return needles.some((needle) => {
    const needleTokens = normalizeRecommendationSignal(needle).split(' ').filter(Boolean)
    if (needleTokens.length === 0) {
      return false
    }

    return signalTokenSets.some((signalTokens) =>
      needleTokens.every((token) => signalTokens.has(token)),
    )
  })
}

export function buildResumeThemePickerRecommendations(input: {
  recommendationContext?: ResumeThemePickerRecommendationContext | null
  themes: readonly ResumeTemplateDefinition[]
}): readonly ResumeThemePickerRecommendation[] {
  const context = input.recommendationContext

  if (!context) {
    return []
  }

  const jobSignals = [context.jobTitle ?? '', ...context.jobKeywords]
    .map(normalizeRecommendationSignal)
    .filter(Boolean)
  const hasDenseSignal = context.experienceEntryCount >= 3 || context.totalIncludedBulletCount >= 10
  const isTechnicalRole = hasAnySignal(jobSignals, [
    'engineer',
    'engineering',
    'developer',
    'frontend',
    'backend',
    'software',
    'platform',
    'data',
    'analytics',
    'analyst',
    'security',
    'infrastructure',
    'sql',
  ])
  const isProductOrDesignRole = hasAnySignal(jobSignals, [
    'product',
    'design',
    'designer',
    'ux',
    'ui',
    'brand',
    'creative',
    'marketing',
  ])
  const isCredentialSensitiveRole = hasAnySignal(jobSignals, [
    'compliance',
    'regulated',
    'certification',
    'credential',
    'audit',
    'security',
    'healthcare',
    'finance',
    'education',
  ])
  const scoredRecommendations: Array<ResumeThemePickerRecommendation & { score: number; sortOrder: number }> = []

  for (const theme of input.themes) {
    let score = 0
    let reason: string | null = null

    switch (theme.id) {
      case 'technical_matrix':
        if (isTechnicalRole) {
          score = 4
          reason = 'This role reads technical, so the skills-first systems variant should land faster without leaving the apply-safe lane.'
        }
        break
      case 'project_showcase':
        if (context.hasProjects) {
          score = 4
          reason = 'You already have project proof in this draft, so the proof-led layout can earn more attention early.'
        }
        break
      case 'credentials_focus':
        if (context.hasCertifications && (context.hasFormalEducation || isCredentialSensitiveRole)) {
          score = 4
          reason = 'Credential signal matters here, so moving certifications and education higher can improve trust quickly.'
        }
        break
      case 'compact_exec':
        if (hasDenseSignal) {
          score = 3
          reason = 'This draft is dense, and the tighter executive variant keeps more signal visible before page pressure becomes a problem.'
        }
        break
      case 'modern_split':
        if (isProductOrDesignRole && !isTechnicalRole) {
          score = 2
          reason = 'The role leans product or design, so the sharper summary-led variant may read as more intentional.'
        }
        break
      default:
        break
    }

    if (score > 0 && reason) {
      scoredRecommendations.push({
        templateId: theme.id,
        reason,
        score,
        sortOrder: theme.sortOrder ?? Number.MAX_SAFE_INTEGER,
      })
    }
  }

  if (scoredRecommendations.length === 0) {
    const fallbackTheme = input.themes.find((theme) => theme.id === 'classic_ats') ?? input.themes[0]

    return fallbackTheme
      ? [
          {
            templateId: fallbackTheme.id,
            reason: 'No stronger layout-specific signal stands out, so this remains the safest general ATS choice.',
          },
        ]
      : []
  }

  return scoredRecommendations
    .sort((left, right) => right.score - left.score || left.sortOrder - right.sortOrder)
    .slice(0, 3)
    .map(({ templateId, reason }) => ({ templateId, reason }))
}

function buildFamilyViewModels(themes: readonly ResumeTemplateDefinition[]): readonly ResumeTemplateFamilyViewModel[] {
  const families = new Map<string, ResumeTemplateDefinition[]>()

  for (const theme of themes) {
    const familyId = getResumeTemplateFamilyId(theme)
    const entries = families.get(familyId) ?? []
    entries.push(theme)
    families.set(familyId, entries)
  }

  return [...families.values()]
    .map((templates) => {
      const sortedTemplates = [...templates].sort(
        (left, right) => (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER),
      )
      const firstTemplate = sortedTemplates[0]!
      const familyId = getResumeTemplateFamilyId(firstTemplate)
      const familySortOrder = firstTemplate.sortOrder ?? Number.MAX_SAFE_INTEGER

      return {
        id: familyId,
        label: getResumeTemplateFamilyLabel(firstTemplate),
        description: firstTemplate.familyDescription ?? firstTemplate.description ?? 'Resume family',
        deliveryLane: getResumeTemplateDeliveryLane(firstTemplate),
        atsConfidence: getResumeTemplateAtsConfidence(firstTemplate),
        fitSummary: firstTemplate.fitSummary ?? null,
        familySortOrder,
        templates: sortedTemplates,
      }
    })
    .sort((left, right) => {
      return left.familySortOrder - right.familySortOrder || left.id.localeCompare(right.id)
    })
}

export function ResumeThemePicker({
  disabled = false,
  id,
  mode = 'full',
  recommendationContext = null,
  selectedThemeId,
  themes,
  onChange,
}: ResumeThemePickerProps) {
  const recommendations = useMemo(
    () => buildResumeThemePickerRecommendations({ recommendationContext, themes }),
    [recommendationContext, themes],
  )
  const recommendationReasons = useMemo(
    () => new Map(recommendations.map((recommendation) => [recommendation.templateId, recommendation.reason])),
    [recommendations],
  )
  const recommendedThemeIds = useMemo(
    () => new Set(recommendations.map((recommendation) => recommendation.templateId)),
    [recommendations],
  )
  const families = useMemo(() => buildFamilyViewModels(themes), [themes])
  const selectedTemplate = themes.find((theme) => theme.id === selectedThemeId) ?? themes[0] ?? null
  const selectedFamilyId = selectedTemplate ? getResumeTemplateFamilyId(selectedTemplate) : families[0]?.id ?? null
  const selectedFamily = families.find((family) => family.id === selectedFamilyId) ?? null
  const initialFocusedFamily = selectedFamilyId ?? families[0]?.id ?? null
  const [focusedFamilyId, setFocusedFamilyId] = useState<string | null>(initialFocusedFamily)
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null)
  const familySectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const [previewFrameHeight, setPreviewFrameHeight] = useState<number | null>(null)

  useEffect(() => {
    if (!selectedFamilyId) {
      return
    }

    setFocusedFamilyId(selectedFamilyId)
  }, [selectedFamilyId])

  useEffect(() => {
    if (!selectedFamilyId) {
      return
    }

    const selectedFamilySection = familySectionRefs.current[selectedFamilyId]
    if (typeof selectedFamilySection?.scrollIntoView !== 'function') {
      return
    }

    selectedFamilySection.scrollIntoView({ block: 'nearest' })
  }, [selectedFamilyId, selectedThemeId])

  useEffect(() => {
    if (mode === 'compact') {
      return
    }

    const iframe = previewFrameRef.current

    if (!iframe) {
      return
    }

    const measureHeight = () => {
      const frameDocument = iframe.contentDocument

      if (!frameDocument) {
        return
      }

      const page = frameDocument.querySelector<HTMLElement>('.page')
      const body = frameDocument.body
      const nextHeight = Math.ceil((page?.getBoundingClientRect().height ?? body?.scrollHeight ?? 0) + 8)

      if (nextHeight > 0) {
        setPreviewFrameHeight((current) => (current === nextHeight ? current : nextHeight))
      }
    }

    const handleLoad = () => {
      measureHeight()
    }

    handleLoad()
    iframe.addEventListener('load', handleLoad)
    window.addEventListener('resize', handleLoad)

    return () => {
      iframe.removeEventListener('load', handleLoad)
      window.removeEventListener('resize', handleLoad)
    }
  }, [selectedThemeId, mode, themes])

  const focusedFamily = families.find((family) => family.id === focusedFamilyId) ?? families[0] ?? null
  const focusedFamilyRecommended = focusedFamily?.templates.find((template) => recommendedThemeIds.has(template.id)) ?? null
  const leadingRecommendedFamily = recommendations[0]
    ? families.find((family) => family.templates.some((template) => template.id === recommendations[0]?.templateId)) ?? null
    : null
  const heroTemplate = selectedTemplate ?? focusedFamily?.templates[0] ?? null
  const heroReason = heroTemplate ? recommendationReasons.get(heroTemplate.id) ?? null : null
  const heroVisualTags = heroTemplate ? getResumeTemplateVisualTags(heroTemplate).slice(0, 2) : []
  const compact = mode === 'compact'

  if (!heroTemplate || !focusedFamily) {
    return (
      <div className="rounded-(--radius-field) border border-dashed border-(--surface-panel-border) bg-background/55 px-4 py-5 text-sm leading-6 text-foreground-soft">
        No templates are available right now.
      </div>
    )
  }

  if (compact) {
    return (
      <div className="grid gap-3" aria-labelledby={id}>
        <section className="surface-panel-shell relative overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border)">
          <div className="grid content-start gap-3 p-3">
            <div className="grid gap-3">
              <div className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/55 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="label-mono-xs">Choose a family</p>
                  <Badge variant={getLaneBadgeVariant(focusedFamily.deliveryLane)}>
                    {getLaneLabel(focusedFamily.deliveryLane)}
                  </Badge>
                </div>

                {selectedFamily || leadingRecommendedFamily ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.72rem] leading-4 text-foreground-soft">
                    {selectedFamily ? <span>Current: {selectedFamily.label}</span> : null}
                    {leadingRecommendedFamily ? <Badge variant="section">Recommended</Badge> : null}
                    {leadingRecommendedFamily ? <span>{leadingRecommendedFamily.label}</span> : null}
                  </div>
                ) : null}

                <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-4">
                  {families.map((family) => {
                    const isActive = family.id === focusedFamily.id

                    return (
                      <button
                        key={family.id}
                        className={cn(
                          'flex min-h-10 items-center rounded-(--radius-field) border px-3 py-2 text-left transition-[border-color,background-color,box-shadow]',
                          isActive
                            ? 'border-primary/35 bg-primary/7 shadow-[inset_0_1px_0_var(--focus-inset-highlight)]'
                            : 'border-(--surface-panel-border) bg-background/45 hover:border-border/80 hover:bg-background/65',
                        )}
                        disabled={disabled}
                        onClick={() => setFocusedFamilyId(family.id)}
                        type="button"
                      >
                        <span className="text-[0.82rem] font-semibold leading-4 text-foreground">{family.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

              <div className="grid gap-2.5 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/55 px-3 py-2.5">
                <div className="grid gap-1">
                  <p className="label-mono-xs">{focusedFamily.label} variants</p>
                </div>

                <div className="grid gap-1.5">
                  {focusedFamily.templates.map((theme) => {
                    const selected = theme.id === selectedThemeId
                    const recommendationReason = recommendationReasons.get(theme.id)
                    const compactReason = recommendationReason ?? theme.fitSummary ?? theme.description

                  return (
                      <div
                        key={theme.id}
                        className={cn(
                          'grid gap-2 rounded-(--radius-field) border px-3 py-2.5 transition-[border-color,background-color,box-shadow]',
                          selected
                            ? 'border-primary/38 bg-primary/8 shadow-[inset_0_1px_0_var(--focus-inset-highlight)]'
                            : 'border-(--surface-panel-border) bg-background/45',
                        )}
                      >
                        <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                          <div className="grid gap-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">{getResumeTemplateVariantLabel(theme)}</span>
                              {selected ? <Badge variant="default">Selected</Badge> : null}
                            </div>
                            <p className="text-[0.74rem] leading-4.5 text-foreground-soft">{compactReason}</p>
                          </div>
                          <Button
                            className="xl:min-w-44"
                            disabled={disabled}
                            onClick={() => onChange(theme.id)}
                            size="compact"
                            type="button"
                            variant={selected ? 'primary' : 'secondary'}
                          >
                            {selected ? 'Selected variant' : 'Use this variant'}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="grid gap-4" aria-labelledby={id}>
      <section className="surface-panel-shell relative overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border)">
        <div className="grid gap-3 p-3.5 xl:gap-3.5">
          <div className="flex flex-wrap items-start justify-between gap-2.5">
            <div className="grid gap-1.5">
              <p className="label-mono-xs">Current selection</p>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-[clamp(1.18rem,1.45vw,1.5rem)] font-semibold tracking-[-0.04em] text-(--text-headline)">
                  {heroTemplate.label}
                </h3>
                {heroVisualTags.map((tag) => (
                  <Badge key={tag} variant="section">
                    {tag}
                  </Badge>
                ))}
              </div>
              <p className="max-w-[64ch] text-[0.82rem] leading-4.5 text-foreground-soft">{heroTemplate.description}</p>
              {heroReason ? <p className="text-[0.72rem] leading-4.5 text-primary/85">{heroReason}</p> : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="default">Real renderer preview</Badge>
              <Badge variant="section">{getLaneLabel(getResumeTemplateDeliveryLane(heroTemplate))}</Badge>
              <Badge variant="section">{getAtsConfidenceLabel(getResumeTemplateAtsConfidence(heroTemplate))}</Badge>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.72fr)_minmax(18rem,19.5rem)] xl:items-start">
            <div className="overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) bg-(--resume-preview-frame) p-1.5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] xl:p-2">
              <iframe
                aria-hidden="true"
                className="block w-full rounded-[1rem] border-0 bg-transparent"
                ref={previewFrameRef}
                sandbox="allow-same-origin"
                srcDoc={renderResumeTemplateCatalogPreviewHtml(heroTemplate.id, { layout: 'panel' })}
                style={{ height: previewFrameHeight ? `${previewFrameHeight}px` : '34rem' }}
                title={`${heroTemplate.label} preview`}
              />
            </div>

            <div className="min-w-0 grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/55 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="label-mono-xs">Choose a family</p>
                <Badge variant="section">{families.length} families</Badge>
              </div>

              <div className="grid gap-1.5">
                {families.map((family) => {
                  const isActive = family.id === focusedFamily.id
                  const isSelectedFamily = family.id === selectedFamilyId
                  const familyRecommendationCount = family.templates.filter((template) => recommendedThemeIds.has(template.id)).length

                  return (
                    <div
                      key={family.id}
                      ref={(element) => {
                        familySectionRefs.current[family.id] = element
                      }}
                      className={cn(
                        'min-w-0 grid gap-1 rounded-(--radius-field) border px-2.5 py-2 transition-[border-color,background-color,box-shadow]',
                        isActive
                          ? 'border-primary/35 bg-primary/7 shadow-[inset_0_1px_0_var(--focus-inset-highlight)]'
                          : 'border-(--surface-panel-border) bg-background/45',
                      )}
                    >
                      <button
                        className="flex min-h-9 min-w-0 items-center justify-between gap-2 text-left"
                        disabled={disabled}
                        onClick={() => setFocusedFamilyId(family.id)}
                        type="button"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="text-[0.82rem] font-semibold leading-4 text-foreground">{family.label}</span>
                          {isSelectedFamily ? <Badge variant="default">Selected</Badge> : null}
                          {familyRecommendationCount > 0 ? <Badge variant="section">Recommended</Badge> : null}
                        </div>
                        <span className="text-[0.68rem] leading-4 text-foreground-soft">
                          {family.templates.length} variant{family.templates.length === 1 ? '' : 's'}
                        </span>
                      </button>

                      {isActive ? (
                        <div className="grid gap-1 border-t border-border/10 pt-1.5">
                          {family.templates.map((theme) => {
                            const selected = theme.id === selectedThemeId
                            const visualTags = getResumeTemplateVisualTags(theme).slice(0, 2)

                            return (
                              <div
                                key={theme.id}
                                className={cn(
                                  'min-w-0 grid gap-1 rounded-(--radius-field) border px-2.5 py-2 transition-[border-color,background-color,box-shadow]',
                                  selected
                                    ? 'border-primary/38 bg-primary/8 shadow-[inset_0_1px_0_var(--focus-inset-highlight)]'
                                    : 'border-(--surface-panel-border) bg-background/55',
                                )}
                              >
                                <div className="grid gap-2">
                                  <div className="grid min-w-0 gap-1">
                                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                      <span className="text-[0.8rem] font-semibold leading-4 text-foreground">
                                        {getResumeTemplateVariantLabel(theme)}
                                      </span>
                                      {selected ? <Badge variant="default">Selected</Badge> : null}
                                      {theme.id === focusedFamilyRecommended?.id ? <Badge variant="section">Best match</Badge> : null}
                                    </div>
                                    {visualTags.length > 0 ? (
                                      <p className="text-[0.68rem] leading-4 text-foreground-soft">{visualTags.join(' · ')}</p>
                                    ) : null}
                                  </div>

                                  <Button
                                    className="w-full"
                                    disabled={disabled}
                                    onClick={() => onChange(theme.id)}
                                    size="compact"
                                    type="button"
                                    variant={selected ? 'primary' : 'secondary'}
                                  >
                                    {selected ? 'Selected variant' : 'Use this variant'}
                                  </Button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              <div className="rounded-(--radius-field) border border-dashed border-(--surface-panel-border) bg-background/35 px-2.5 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="label-mono-xs">Focused family</p>
                  <Badge variant="section">{focusedFamily.label}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.72rem] leading-4 text-foreground-soft">
                  {selectedFamily ? <span>Current default: {selectedFamily.label}</span> : null}
                  <span>Variants open directly under the active family.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
