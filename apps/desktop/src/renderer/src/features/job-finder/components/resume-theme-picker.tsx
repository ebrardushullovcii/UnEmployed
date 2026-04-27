import { useMemo, useState } from 'react'
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

type ResumeTemplateLaneFilter = 'all' | 'apply_safe' | 'share_ready'
type ResumeTemplateDensityFilter = 'all' | ResumeTemplateDefinition['density']

interface ResumeThemePickerProps {
  disabled?: boolean
  id?: string
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
  templates: readonly ResumeTemplateDefinition[]
}

const laneFilterOptions: ReadonlyArray<{
  label: string
  value: ResumeTemplateLaneFilter
}> = [
  { label: 'All lanes', value: 'all' },
  { label: 'Apply-safe', value: 'apply_safe' },
  { label: 'Share-ready', value: 'share_ready' },
]

const densityFilterOptions: ReadonlyArray<{
  label: string
  value: ResumeTemplateDensityFilter
}> = [
  { label: 'All density', value: 'all' },
  { label: 'Comfortable', value: 'comfortable' },
  { label: 'Balanced', value: 'balanced' },
  { label: 'Compact', value: 'compact' },
]

function getLaneLabel(lane: 'apply_safe' | 'share_ready') {
  return lane === 'apply_safe' ? 'Apply-safe' : 'Share-ready'
}

function getAtsConfidenceLabel(confidence: 'high' | 'medium' | 'low') {
  switch (confidence) {
    case 'high':
      return 'ATS confidence: High'
    case 'medium':
      return 'ATS confidence: Medium'
    case 'low':
      return 'ATS confidence: Low'
  }
}

function getLaneBadgeVariant(lane: 'apply_safe' | 'share_ready') {
  return lane === 'apply_safe' ? 'default' : 'outline'
}

function normalizeRecommendationSignal(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function hasAnySignal(
  haystack: readonly string[],
  needles: readonly string[],
): boolean {
  return needles.some((needle) => haystack.some((signal) => signal.includes(needle)))
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
  const hasDenseSignal =
    context.experienceEntryCount >= 3 || context.totalIncludedBulletCount >= 10
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
          reason = 'The job reads as technical, and this variant brings skills and systems depth forward without leaving the apply-safe lane.'
        }
        break
      case 'project_showcase':
        if (context.hasProjects) {
          score = 4
          reason = 'This draft already has project proof to lead with, and this variant surfaces shipped work earlier than chronology-first layouts.'
        }
        break
      case 'credentials_focus':
        if (context.hasCertifications && (context.hasFormalEducation || isCredentialSensitiveRole)) {
          score = 4
          reason = 'This draft has real credential signal, and this variant moves certifications and education forward when that trust changes screening outcomes.'
        }
        break
      case 'compact_exec':
        if (hasDenseSignal) {
          score = 3
          reason = 'This draft is content-dense, and this variant compresses senior signal without leaving ATS-safe structure.'
        }
        break
      case 'modern_split':
        if (isProductOrDesignRole && !isTechnicalRole) {
          score = 2
          reason = 'The role leans product or design, and this variant adds a stronger summary-led read while staying apply-safe.'
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
            reason: 'No stronger layout-specific signal stands out for this draft, so this remains the safest general ATS choice.',
          },
        ]
      : []
  }

  return scoredRecommendations
    .sort((left, right) => right.score - left.score || left.sortOrder - right.sortOrder)
    .slice(0, 3)
    .map(({ templateId, reason }) => ({ templateId, reason }))
}

function buildFamilyViewModels(
  themes: readonly ResumeTemplateDefinition[],
): readonly ResumeTemplateFamilyViewModel[] {
  const families = new Map<string, ResumeTemplateDefinition[]>()

  for (const theme of themes) {
    const familyId = getResumeTemplateFamilyId(theme)
    const entries = families.get(familyId) ?? []
    entries.push(theme)
    families.set(familyId, entries)
  }

  return [...families.values()]
    .map((templates) => {
      const [firstTemplate] = [...templates].sort(
        (left, right) => (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER),
      )

      return {
        id: getResumeTemplateFamilyId(firstTemplate!),
        label: getResumeTemplateFamilyLabel(firstTemplate!),
        description:
          firstTemplate?.familyDescription ?? firstTemplate?.description ?? 'Resume family',
        deliveryLane: getResumeTemplateDeliveryLane(firstTemplate!),
        atsConfidence: getResumeTemplateAtsConfidence(firstTemplate!),
        fitSummary: firstTemplate?.fitSummary ?? null,
        templates: [...templates].sort(
          (left, right) => (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER),
        ),
      }
    })
    .sort((left, right) => {
      const leftOrder = left.templates[0]?.sortOrder ?? Number.MAX_SAFE_INTEGER
      const rightOrder = right.templates[0]?.sortOrder ?? Number.MAX_SAFE_INTEGER
      return leftOrder - rightOrder
    })
}

export function ResumeThemePicker({
  disabled = false,
  id,
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
  const [laneFilter, setLaneFilter] = useState<ResumeTemplateLaneFilter>('all')
  const [densityFilter, setDensityFilter] = useState<ResumeTemplateDensityFilter>('all')
  const [recommendedOnly, setRecommendedOnly] = useState(false)
  const filteredThemes = useMemo(
    () =>
      themes.filter((theme) => {
        if (laneFilter !== 'all' && getResumeTemplateDeliveryLane(theme) !== laneFilter) {
          return false
        }

        if (densityFilter !== 'all' && theme.density !== densityFilter) {
          return false
        }

        if (recommendedOnly && !recommendedThemeIds.has(theme.id)) {
          return false
        }

        return true
      }),
    [densityFilter, laneFilter, recommendedOnly, recommendedThemeIds, themes],
  )
  const families = useMemo(() => buildFamilyViewModels(filteredThemes), [filteredThemes])
  const selectedTemplate = themes.find((theme) => theme.id === selectedThemeId) ?? themes[0] ?? null
  const selectedFamilyId =
    selectedTemplate && families.some((family) => family.id === getResumeTemplateFamilyId(selectedTemplate))
      ? getResumeTemplateFamilyId(selectedTemplate)
      : families[0]?.id ?? null
  const [comparedThemeIds, setComparedThemeIds] = useState<ResumeTemplateId[]>(
    selectedThemeId ? [selectedThemeId] : [],
  )
  const hasActiveFilters = laneFilter !== 'all' || densityFilter !== 'all' || recommendedOnly

  const visibleComparedThemes = filteredThemes.filter((theme) => comparedThemeIds.includes(theme.id))

  return (
    <div className="grid gap-4" aria-labelledby={id}>
      <div className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-overlay-subtle) px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">Family-first catalog</Badge>
          <Badge variant="section">Real renderer previews</Badge>
          <Badge variant="section">Honest delivery labels</Badge>
        </div>
        <p className="text-(length:--text-description) leading-6 text-foreground-soft">
          Pick a resume family first, then choose the exact variant that this draft or default setting should own.
        </p>
        <div className="grid gap-3 rounded-(--radius-field) border border-border/40 bg-background/55 px-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="section">{filteredThemes.length} visible variants</Badge>
            {recommendations.length > 0 ? (
              <Badge variant="default">{recommendations.length} recommended</Badge>
            ) : null}
            {hasActiveFilters ? <Badge variant="outline">Filters active</Badge> : null}
          </div>

          {recommendations.length > 0 ? (
            <div className="grid gap-2">
              <p className="label-mono-xs">Recommended for this draft</p>
              <div className="flex flex-wrap gap-2">
                {recommendations.map((recommendation) => {
                  const theme = themes.find((entry) => entry.id === recommendation.templateId)

                  if (!theme) {
                    return null
                  }

                  return (
                    <Button
                      key={`recommended_${theme.id}`}
                      disabled={disabled}
                      onClick={() => onChange(theme.id)}
                      size="compact"
                      type="button"
                      variant={theme.id === selectedThemeId ? 'primary' : 'secondary'}
                    >
                      {theme.label}
                    </Button>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div className="grid gap-2">
            <div className="flex flex-wrap gap-2">
              {laneFilterOptions.map((option) => (
                <Button
                  key={`lane_${option.value}`}
                  aria-pressed={laneFilter === option.value}
                  disabled={disabled}
                  onClick={() => setLaneFilter(option.value)}
                  size="compact"
                  type="button"
                  variant={laneFilter === option.value ? 'primary' : 'outline'}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {densityFilterOptions.map((option) => (
                <Button
                  key={`density_${option.value}`}
                  aria-pressed={densityFilter === option.value}
                  disabled={disabled}
                  onClick={() => setDensityFilter(option.value)}
                  size="compact"
                  type="button"
                  variant={densityFilter === option.value ? 'primary' : 'outline'}
                >
                  {option.label}
                </Button>
              ))}
              {recommendations.length > 0 ? (
                <Button
                  aria-pressed={recommendedOnly}
                  disabled={disabled}
                  onClick={() => setRecommendedOnly((current) => !current)}
                  size="compact"
                  type="button"
                  variant={recommendedOnly ? 'primary' : 'outline'}
                >
                  Recommended only
                </Button>
              ) : null}
              {hasActiveFilters ? (
                <Button
                  disabled={disabled}
                  onClick={() => {
                    setLaneFilter('all')
                    setDensityFilter('all')
                    setRecommendedOnly(false)
                  }}
                  size="compact"
                  type="button"
                  variant="ghost"
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,24rem)]">
        <div
          aria-disabled={disabled || undefined}
          className="grid gap-4"
          role="radiogroup"
        >
          {families.length === 0 ? (
            <div className="rounded-(--radius-field) border border-dashed border-(--surface-panel-border) bg-background/55 px-4 py-5 text-sm leading-6 text-foreground-soft">
              No templates match the current filters.
            </div>
          ) : families.map((family) => {
            const familySelected = family.id === selectedFamilyId
            const familyRecommendedCount = family.templates.filter((theme) => recommendedThemeIds.has(theme.id)).length

            return (
              <section
                key={family.id}
                className={cn(
                  'grid gap-4 rounded-(--radius-field) border px-4 py-4 transition-[border-color,background-color,box-shadow]',
                  familySelected
                    ? 'border-primary/35 bg-primary/6 shadow-[inset_0_1px_0_var(--focus-inset-highlight)]'
                    : 'border-(--surface-panel-border) bg-(--surface-panel)',
                )}
              >
                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_12rem] md:items-start">
                  <div className="grid gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-(length:--text-body) font-semibold text-foreground">
                        {family.label}
                      </h3>
                      <Badge variant={getLaneBadgeVariant(family.deliveryLane)}>
                        {getLaneLabel(family.deliveryLane)}
                      </Badge>
                      <Badge variant="section">{getAtsConfidenceLabel(family.atsConfidence)}</Badge>
                      {familyRecommendedCount > 0 ? (
                        <Badge variant="default">
                          {familyRecommendedCount === 1 ? 'Recommended variant' : `${familyRecommendedCount} recommended variants`}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-(length:--text-description) leading-6 text-foreground-soft">
                      {family.description}
                    </p>
                    {family.fitSummary ? (
                      <p className="rounded-(--radius-field) border border-border/40 bg-background/55 px-3 py-2 text-sm leading-6 text-foreground-soft">
                        {family.fitSummary}
                      </p>
                    ) : null}
                  </div>
                  <div className="overflow-hidden rounded-(--radius-field) border border-border/40 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.95),rgba(226,232,240,0.92))] p-2">
                    <iframe
                      aria-hidden="true"
                      className="h-[15.2rem] w-full overflow-hidden rounded-[0.9rem] border-0 bg-transparent"
                      sandbox="allow-same-origin"
                      srcDoc={renderResumeTemplateCatalogPreviewHtml(family.templates[0]!.id)}
                      title={`${family.label} preview`}
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {family.templates.map((theme, index) => {
                    const selected = theme.id === selectedThemeId
                    const compareSelected = comparedThemeIds.includes(theme.id)
                    const recommendationReason = recommendationReasons.get(theme.id)
                    const visualTags = getResumeTemplateVisualTags(theme)

                    return (
                      <div
                        key={theme.id}
                        className={cn(
                          'grid gap-3 rounded-(--radius-field) border px-4 py-4 transition-[border-color,background-color,box-shadow]',
                          selected
                            ? 'border-primary/45 bg-primary/8 shadow-[inset_0_1px_0_var(--focus-inset-highlight)]'
                            : 'border-(--surface-panel-border) bg-background/55',
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {getResumeTemplateVariantLabel(theme)}
                          </span>
                          <Badge variant="section">Variant {index + 1}</Badge>
                          {recommendationReason ? (
                            <Badge variant="default">Recommended for this draft</Badge>
                          ) : null}
                          {selected ? <Badge variant="default">Selected</Badge> : null}
                        </div>
                        <p className="text-(length:--text-description) leading-6 text-foreground-soft">
                          {theme.description}
                        </p>
                        {recommendationReason ? (
                          <p className="rounded-(--radius-field) border border-primary/15 bg-primary/6 px-3 py-2 text-xs leading-5 text-foreground-soft">
                            Why it matches: {recommendationReason}
                          </p>
                        ) : null}
                        {visualTags.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {visualTags.map((tag) => (
                              <Badge key={`${theme.id}_${tag}`} variant="section">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                        {theme.avoidSummary ? (
                          <p className="text-xs leading-5 text-foreground-muted">
                            Avoid when: {theme.avoidSummary}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            disabled={disabled}
                            onClick={() => onChange(theme.id)}
                            role="radio"
                            aria-checked={selected}
                            type="button"
                            variant={selected ? 'primary' : 'secondary'}
                            size="compact"
                          >
                            {selected ? 'Selected variant' : 'Use this variant'}
                          </Button>
                          <Button
                            disabled={disabled}
                            onClick={() =>
                              setComparedThemeIds((current) =>
                                current.includes(theme.id)
                                  ? current.filter((id) => id !== theme.id)
                                  : [...current, theme.id].slice(-3),
                              )
                            }
                            type="button"
                            variant="outline"
                            size="compact"
                          >
                            {compareSelected ? 'Remove from compare' : 'Compare'}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>

        <aside className="grid h-fit gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-panel) px-4 py-4">
          <div className="grid gap-1">
            <p className="label-mono-xs">Shortlist compare</p>
            <p className="text-(length:--text-description) leading-6 text-foreground-soft">
              Compare up to three shortlisted variants side by side before you commit.
            </p>
          </div>

          {visibleComparedThemes.length === 0 ? (
            <div className="rounded-(--radius-field) border border-dashed border-(--surface-panel-border) bg-background/50 px-4 py-5 text-sm leading-6 text-foreground-soft">
              Add one or more variants to compare density, emphasis, and delivery lane details.
            </div>
          ) : (
            <div className="grid gap-3">
              {visibleComparedThemes.map((theme) => (
                <div
                  key={`compare_${theme.id}`}
                  className="grid gap-2 rounded-(--radius-field) border border-border/45 bg-background/55 px-3 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{theme.label}</span>
                    <Badge variant={getLaneBadgeVariant(getResumeTemplateDeliveryLane(theme))}>
                      {getLaneLabel(getResumeTemplateDeliveryLane(theme))}
                    </Badge>
                  </div>
                  <p className="text-xs leading-5 text-foreground-soft">
                    {theme.fitSummary ?? theme.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {getResumeTemplateVisualTags(theme).slice(0, 3).map((tag) => (
                      <Badge key={`compare_tag_${theme.id}_${tag}`} variant="section">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
