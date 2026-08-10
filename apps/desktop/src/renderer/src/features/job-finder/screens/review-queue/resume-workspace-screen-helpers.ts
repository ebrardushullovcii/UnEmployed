import type { JobFinderResumeWorkspace, ResumeDraft, ResumeTemplateDeliveryLane, ResumeTemplateDefinition } from '@unemployed/contracts'
import { getJobFinderErrorMessage } from '@renderer/features/job-finder/lib/job-finder-error-message'

export function getNewestExport(exports: JobFinderResumeWorkspace['exports'], draftId: string) {
  let latestEntry: JobFinderResumeWorkspace['exports'][number] | null = null
  let latestTime = Number.NEGATIVE_INFINITY

  for (const entry of exports) {
    if (entry.draftId !== draftId) {
      continue
    }

    const exportedAtTime = new Date(entry.exportedAt).getTime()
    if (exportedAtTime > latestTime) {
      latestEntry = entry
      latestTime = exportedAtTime
    }
  }

  return latestEntry
}

export function getPreviewErrorMessage(error: unknown): string {
  return getJobFinderErrorMessage(error, 'The current draft could not be previewed.')
}

export function buildResumeThemeRecommendationContext(input: { draft: ResumeDraft | null; workspace: JobFinderResumeWorkspace | null }) {
  const { draft, workspace } = input
  if (!workspace || !draft) {
    return null
  }

  const job = workspace.job
  const includedSections = draft.sections.filter((section) => section.included)
  const includedExperienceEntries = includedSections
    .filter((section) => section.kind === 'experience')
    .flatMap((section) => section.entries.filter((entry) => entry.included))
  const includedProjects = includedSections
    .filter((section) => section.kind === 'projects')
    .flatMap((section) => section.entries.filter((entry) => entry.included))
  const includedCertifications = includedSections
    .filter((section) => section.kind === 'certifications')
    .flatMap((section) => section.entries.filter((entry) => entry.included))
  const includedEducation = includedSections
    .filter((section) => section.kind === 'education')
    .flatMap((section) => section.entries.filter((entry) => entry.included))

  return {
    experienceEntryCount: includedExperienceEntries.length,
    hasCertifications: includedCertifications.length > 0,
    hasFormalEducation: includedEducation.length > 0,
    hasProjects: includedProjects.length > 0,
    jobKeywords: [...job.keySkills, ...job.keywordSignals.map((signal) => signal.label)],
    jobTitle: job.title,
    totalIncludedBulletCount: includedSections.reduce(
      (sum, section) =>
        sum +
        section.bullets.filter((bullet) => bullet.included).length +
        section.entries.reduce((entrySum, entry) => (entry.included ? entrySum + entry.bullets.filter((bullet) => bullet.included).length : entrySum), 0),
      0
    )
  }
}

export function getAvailableExportToApprove(input: { draft: ResumeDraft | null; hasUnsavedChanges: boolean; workspace: JobFinderResumeWorkspace | null }) {
  const { draft, hasUnsavedChanges, workspace } = input
  if (hasUnsavedChanges || !workspace || !draft) {
    return null
  }

  const newestExport = getNewestExport(workspace.exports, workspace.draft.id)

  if (!newestExport) {
    return null
  }

  return new Date(newestExport.exportedAt).getTime() >= new Date(workspace.draft.updatedAt).getTime() ? newestExport : null
}

export function buildWorkspaceStatusCopy(input: {
  availableExportToApprove: ReturnType<typeof getAvailableExportToApprove>
  draft: ResumeDraft
  selectedTemplateApprovalEligible: boolean
  selectedTemplateLane: ResumeTemplateDeliveryLane
  hasUnsavedChanges: boolean
}) {
  const { availableExportToApprove, draft, hasUnsavedChanges, selectedTemplateApprovalEligible, selectedTemplateLane } = input

  const studioStatusMessage = hasUnsavedChanges
    ? 'Save the draft before you export a fresh PDF or approve it.'
    : !selectedTemplateApprovalEligible
      ? `This ${selectedTemplateLane === 'share_ready' ? 'share-ready' : 'selected'} template can still be exported, but approval stays disabled until you switch back to an apply-safe template.`
      : draft.approvedExportId
        ? 'A PDF from this saved draft is already approved. Any new save or template change clears that approval.'
        : availableExportToApprove
          ? 'The newest saved export matches this draft and can be approved now.'
          : 'Save the draft, then export a fresh PDF before approval.'
  const approvalStateLabel = selectedTemplateApprovalEligible ? null : 'Approval stays blocked'

  return {
    approvalStateLabel,
    studioStatusMessage
  }
}

export function getSelectedTheme(availableResumeTemplates: readonly ResumeTemplateDefinition[], templateId: string) {
  return availableResumeTemplates.find((template) => template.id === templateId) ?? null
}
