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
    label: 'Chronology Classic',
    familyId: 'chronology_classic',
    familyLabel: 'Chronology Classic',
    familyDescription:
      'Conservative chronology-first layouts that mirror recruiter expectations while staying sharply typeset and parseable.',
    variantLabel: 'Recruiter Standard',
    description:
      'A restrained chronology-first resume with an editorial header, compact skill strip, and familiar section order for broad ATS-safe use.',
    fitSummary:
      'Strong default when the safest move is a familiar recruiter read: identity, summary, skills, then reverse chronology.',
    avoidSummary:
      'Less distinctive when long history, credentials, projects, or a career-pivot bridge need to lead the story.',
    bestFor: ['General applications', 'Recruiter screens', 'Conservative ATS submissions'],
    visualTags: ['Chronology first', 'Conservative', 'Single column'],
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
    label: 'Modern Editorial',
    familyId: 'modern_editorial',
    familyLabel: 'Modern Editorial',
    familyDescription:
      'Polished modern layouts with stronger editorial hierarchy, a sharper opening narrative, and restrained ATS-safe structure.',
    variantLabel: 'Polished Default',
    description:
      'A polished modern default with a strong left-aligned identity block, elevated summary, and balanced proof sections.',
    fitSummary:
      'Useful when you want a confident, contemporary first impression without leaving the single-column apply-safe lane.',
    avoidSummary:
      'Less helpful if a dense long-history timeline, credentials, or a highly technical skills-first scan is the main differentiator.',
    bestFor: ['Product roles', 'Design-adjacent teams', 'Startup hiring loops'],
    visualTags: ['Modern default', 'Editorial header', 'Balanced'],
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
    label: 'Senior Brief',
    familyId: 'senior_brief',
    familyLabel: 'Senior Brief',
    familyDescription:
      'Dense senior layouts that compress signal early and reward concise, high-trust experience narratives.',
    variantLabel: 'Dense Timeline',
    description:
      'A compact senior read with centered identity, compressed summary, and a tighter reverse-chronology timeline.',
    fitSummary:
      'Best when you have strong experience density and want more signal visible before page pressure becomes a problem.',
    avoidSummary:
      'Can feel tight for early-career profiles or resumes that need extra whitespace to breathe.',
    bestFor: ['Senior candidates', 'Content-dense resumes', 'Leadership screens'],
    visualTags: ['Dense', 'Senior timeline', 'High signal'],
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
    label: 'Credential Ledger',
    familyId: 'credential_ledger',
    familyLabel: 'Credential Ledger',
    familyDescription:
      'Trust-first layouts that pull certifications, education, and formal proof forward without using tables or columns.',
    variantLabel: 'Credentials First',
    description:
      'Credentials-first structure that opens with formal trust signals, then summary, skills, chronology, and project proof.',
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
    label: 'Engineering Spec',
    familyId: 'engineering_spec',
    familyLabel: 'Engineering Spec',
    familyDescription:
      'Spec-like layouts that privilege technical depth, structured skills, and systems signal before polish.',
    variantLabel: 'Skills First',
    description:
      'Skills-first ATS-safe layout that surfaces technical systems depth before summary and chronology.',
    fitSummary:
      'Best when technical skill grouping and systems credibility need to land before the reader reaches your experience timeline.',
    avoidSummary:
      'Can feel overly technical for generalist roles where the strongest signal is leadership story or project proof.',
    bestFor: ['Engineering roles', 'Data roles', 'Security roles'],
    visualTags: ['Skills first', 'Technical', 'Compact'],
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
    label: 'Proof Portfolio',
    familyId: 'proof_portfolio',
    familyLabel: 'Proof Portfolio',
    familyDescription:
      'Proof-led layouts that lead with shipped work and outcome narrative while staying single-column and parseable.',
    variantLabel: 'Projects First',
    description:
      'Project-first ATS-safe layout for candidates whose strongest evidence comes through shipped work and measurable outcomes.',
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
  {
    id: 'timeline_longform',
    label: 'Longform Timeline',
    familyId: 'longform_timeline',
    familyLabel: 'Longform Timeline',
    familyDescription:
      'Long-history layouts that make many roles scannable through a career snapshot and compact chaptered chronology.',
    variantLabel: 'Career Depth',
    description:
      'A long-history timeline with a compact career snapshot, chapter-style experience entries, and reduced decorative friction for many roles.',
    fitSummary:
      'Best when the draft includes many relevant or gap-covering roles and the reader needs fast orientation before the full chronology.',
    avoidSummary:
      'Overkill for thin or early-career resumes where a simpler chronology or project-led read would feel more focused.',
    bestFor: ['Long work histories', 'Senior ICs', 'Mixed chronology with gap coverage'],
    visualTags: ['Long history', 'Career snapshot', 'Compact'],
    density: 'compact',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 70,
  },
  {
    id: 'career_pivot',
    label: 'Career Pivot Bridge',
    familyId: 'career_pivot_bridge',
    familyLabel: 'Career Pivot Bridge',
    familyDescription:
      'Hybrid layouts for mixed backgrounds that connect transferable experience, technical proof, and projects before chronology.',
    variantLabel: 'Hybrid Bridge',
    description:
      'A hybrid career-pivot layout that leads with transferable narrative, role-ready skills, project proof, and then supporting chronology.',
    fitSummary:
      'Useful when mixed or dev-adjacent history needs a clear bridge from past roles to the target job before the timeline begins.',
    avoidSummary:
      'Less ideal when the candidate already has a straightforward same-lane chronology that should lead without explanation.',
    bestFor: ['Career pivots', 'Mixed backgrounds', 'Dev-adjacent evidence'],
    visualTags: ['Hybrid bridge', 'Transferable proof', 'Balanced'],
    density: 'balanced',
    deliveryLane: 'apply_safe',
    atsConfidence: 'high',
    applyEligible: true,
    approvalEligible: true,
    benchmarkEligible: true,
    sortOrder: 80,
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
