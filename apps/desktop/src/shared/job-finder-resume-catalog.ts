import {
  getResumeTemplateAtsConfidence,
  getResumeTemplateDeliveryLane,
  getResumeTemplateFamilyId,
  getResumeTemplateFamilyLabel,
  type ResumeTemplateAtsConfidence,
  type ResumeTemplateDefinition,
  type ResumeTemplateDeliveryLane,
  type ResumeTemplateId,
} from '@unemployed/contracts'

const resumeTemplates = [
  {
    id: 'classic_ats',
    label: 'Swiss Minimal - Standard',
    familyId: 'swiss_minimal',
    familyLabel: 'Swiss Minimal',
    familyDescription:
      'Calm single-column layouts with restrained hierarchy, quiet typography, and low-risk ATS-safe structure.',
    variantLabel: 'Standard',
    description:
      'Quiet single-column resume with restrained typography and balanced spacing for broad ATS-safe use.',
    fitSummary:
      'Strong default when you need a clean all-rounder that keeps attention on the content instead of the layout.',
    avoidSummary:
      'Less distinctive when projects, credentials, or technical skill clusters need to land before chronology.',
    bestFor: ['General applications', 'Recruiter screens', 'Broad ATS submissions'],
    visualTags: ['Minimal', 'Balanced', 'Single column'],
    density: 'balanced',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 10,
  },
  {
    id: 'modern_split',
    label: 'Swiss Minimal - Accent',
    familyId: 'swiss_minimal',
    familyLabel: 'Swiss Minimal',
    familyDescription:
      'Calm single-column layouts with restrained hierarchy, quiet typography, and low-risk ATS-safe structure.',
    variantLabel: 'Accent',
    description:
      'Same calm backbone with a stronger header band and summary callout for polished but still ATS-safe exports.',
    fitSummary:
      'Useful when you want a cleaner modern signal without leaving the conservative ATS lane.',
    avoidSummary:
      'Less helpful if you need dense compression or an obviously technical skill-first read.',
    bestFor: ['Product roles', 'Design-adjacent teams', 'Startup hiring loops'],
    visualTags: ['Accent header', 'Summary callout', 'Balanced'],
    density: 'balanced',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 30,
  },
  {
    id: 'compact_exec',
    label: 'Executive Brief - Dense',
    familyId: 'executive_brief',
    familyLabel: 'Executive Brief',
    familyDescription:
      'Leadership-oriented layouts that compress signal early and reward concise, high-trust experience narratives.',
    variantLabel: 'Dense',
    description:
      'Tighter spacing and a centered hierarchy for experienced candidates who need a denser executive-style read.',
    fitSummary:
      'Best when you have strong experience density and want to keep the document compact without sacrificing ATS safety.',
    avoidSummary:
      'Can feel tight for early-career profiles or resumes that need extra whitespace to breathe.',
    bestFor: ['Senior candidates', 'Content-dense resumes', 'Leadership screens'],
    visualTags: ['Dense', 'Centered header', 'High signal'],
    density: 'compact',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 20,
  },
  {
    id: 'credentials_focus',
    label: 'Executive Brief - Credentials',
    familyId: 'executive_brief',
    familyLabel: 'Executive Brief',
    familyDescription:
      'Leadership-oriented layouts that compress signal early and reward concise, high-trust experience narratives.',
    variantLabel: 'Credentials',
    description:
      'Executive-style structure that pulls certifications and education forward without leaving ATS-safe structure.',
    fitSummary:
      'Stronger when credentials, certifications, or formal education materially change recruiter trust or screening outcomes.',
    avoidSummary:
      'Less effective if credentials are thin and your strongest evidence is shipped work or technical systems depth.',
    bestFor: ['Regulated industries', 'Certification-heavy roles', 'Academic backgrounds'],
    visualTags: ['Credentials first', 'Centered header', 'Balanced'],
    density: 'balanced',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 60,
  },
  {
    id: 'technical_matrix',
    label: 'Engineering Spec - Systems',
    familyId: 'engineering_spec',
    familyLabel: 'Engineering Spec',
    familyDescription:
      'Spec-like layouts that privilege technical depth, structured skills, and systems signal before polish.',
    variantLabel: 'Systems',
    description:
      'Skills-forward ATS-safe layout that surfaces technical systems depth before chronology.',
    fitSummary:
      'Best when technical skill grouping and systems credibility need to land before the reader reaches your experience timeline.',
    avoidSummary:
      'Can feel overly technical for generalist roles where the strongest signal is leadership story or project proof.',
    bestFor: ['Engineering roles', 'Data roles', 'Security roles'],
    visualTags: ['Skills matrix', 'Technical', 'Compact'],
    density: 'compact',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 40,
  },
  {
    id: 'project_showcase',
    label: 'Portfolio Narrative - Proof-led',
    familyId: 'portfolio_narrative',
    familyLabel: 'Portfolio Narrative',
    familyDescription:
      'Proof-led layouts that lead with shipped work and outcome narrative while staying single-column and parseable.',
    variantLabel: 'Proof-led',
    description:
      'Project-first ATS-safe layout for candidates whose strongest evidence comes through specific shipped work.',
    fitSummary:
      'Useful when projects, launches, or portfolio proof tell the clearest case for fit.',
    avoidSummary:
      'Less ideal when you need a conservative recruiter-first chronology or stronger credentials signal up front.',
    bestFor: ['Portfolio-heavy candidates', 'Career changers', 'Product builders'],
    visualTags: ['Projects first', 'Proof led', 'Comfortable'],
    density: 'comfortable',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 50,
  },
] satisfies readonly ResumeTemplateDefinition[]

export interface LocalResumeTemplateFamily {
  id: string
  label: string
  description: string
  deliveryLane: ResumeTemplateDeliveryLane
  atsConfidence: ResumeTemplateAtsConfidence
  sortOrder: number
  templates: readonly ResumeTemplateDefinition[]
}

function sortTemplateDefinitions(
  left: ResumeTemplateDefinition,
  right: ResumeTemplateDefinition,
): number {
  return (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER)
}

export function listLocalResumeTemplates(): readonly ResumeTemplateDefinition[] {
  return [...resumeTemplates].sort(sortTemplateDefinitions)
}

export function getLocalResumeTemplateDefinition(
  templateId: ResumeTemplateId,
): ResumeTemplateDefinition {
  if (resumeTemplates.length === 0) {
    throw new Error('Expected at least one local resume template')
  }

  return resumeTemplates.find((template) => template.id === templateId) ?? resumeTemplates[0]!
}

export function getDefaultApplySafeResumeTemplateId(): ResumeTemplateId {
  if (resumeTemplates.length === 0) {
    throw new Error('Expected at least one local resume template')
  }

  return (
    resumeTemplates.find(
      (template) => template.deliveryLane === 'apply_safe' && template.applyEligible,
    )?.id ?? resumeTemplates[0]!.id
  )
}

export function listLocalResumeTemplateFamilies(): readonly LocalResumeTemplateFamily[] {
  const templatesByFamily = new Map<string, ResumeTemplateDefinition[]>()

  for (const template of listLocalResumeTemplates()) {
    const familyId = getResumeTemplateFamilyId(template)
    const existingTemplates = templatesByFamily.get(familyId) ?? []
    existingTemplates.push(template)
    templatesByFamily.set(familyId, existingTemplates)
  }

  return [...templatesByFamily.entries()]
    .map(([familyId, templates]) => {
      const primaryTemplate = templates[0]!
      const familyDescription = templates.find(
        (template) => template.familyDescription?.trim(),
      )?.familyDescription?.trim()

      return {
        id: familyId,
        label: getResumeTemplateFamilyLabel(primaryTemplate),
        description:
          familyDescription ??
          primaryTemplate.description,
        deliveryLane: getResumeTemplateDeliveryLane(primaryTemplate),
        atsConfidence: getResumeTemplateAtsConfidence(primaryTemplate),
        sortOrder: primaryTemplate.sortOrder ?? Number.MAX_SAFE_INTEGER,
        templates,
      } satisfies LocalResumeTemplateFamily
    })
    .sort((left, right) => left.sortOrder - right.sortOrder)
}
