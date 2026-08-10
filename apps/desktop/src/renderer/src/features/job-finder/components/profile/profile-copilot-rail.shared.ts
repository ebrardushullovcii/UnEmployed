import type {
  JobFinderWorkspaceSnapshot,
  ProfileCopilotContext,
  ProfileCopilotPatchOperation,
} from '@unemployed/contracts'
import { formatStatusLabel } from '../../lib/job-finder-utils'

function getDiscoveryTargetCount(operation: ProfileCopilotPatchOperation): number | null {
  if (operation.operation !== 'replace_search_preferences_fields') {
    return null
  }

  const discoveryValue = operation.value.discovery
  return discoveryValue ? discoveryValue.targets.length : null
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

function formatProposedValue(value: unknown): string {
  if (value === null) {
    return 'cleared'
  }

  if (typeof value === 'string') {
    return `“${value}”`
  }

  if (typeof value === 'number') {
    return formatNumber(value)
  }

  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no'
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'none'
    }

    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (typeof item === 'number') {
          return formatNumber(item)
        }

        if (typeof item === 'boolean') {
          return item ? 'yes' : 'no'
        }

        return 'updated item'
      })
      .join(', ')
  }

  return 'updated details'
}

function describeFieldChanges(value: Record<string, unknown>): string {
  return Object.entries(value)
    .map(([key, proposedValue]) => {
      const fieldLabel = humanizeFieldKey(key)

      if (proposedValue === null) {
        return `Clear ${fieldLabel}`
      }

      return `Set ${fieldLabel} to ${formatProposedValue(proposedValue)}`
    })
    .join('; ')
}

function humanizeFieldKey(key: string): string {
  switch (key) {
    case 'targetSalaryUsd':
      return 'expected salary'
    case 'minimumSalaryUsd':
      return 'minimum salary'
    case 'workModes':
      return 'work modes'
    case 'targetRoles':
      return 'target roles'
    case 'yearsExperience':
      return 'years of experience'
    case 'linkedinUrl':
      return 'LinkedIn URL'
    case 'portfolioUrl':
      return 'portfolio URL'
    case 'currentLocation':
      return 'current location'
    case 'preferredEmail':
      return 'preferred email'
    case 'preferredPhone':
      return 'preferred phone'
    case 'professionalStory':
      return 'professional story'
    case 'nextChapterSummary':
      return 'next chapter summary'
    case 'careerTransitionSummary':
      return 'career transition summary'
    case 'selfIntroduction':
      return 'self-introduction'
    case 'visaSponsorship':
      return 'visa sponsorship'
    case 'authorizedWorkCountries':
      return 'authorized work countries'
    case 'requiresVisaSponsorship':
      return 'requires visa sponsorship'
    case 'remoteEligible':
      return 'remote eligible'
    case 'willingToRelocate':
      return 'willing to relocate'
    case 'willingToTravel':
      return 'willing to travel'
    case 'availableStartDate':
      return 'available start date'
    case 'jobFamilies':
      return 'job families'
    default:
      return key.replace(/([A-Z])/g, ' $1').trim().toLowerCase()
  }
}

export function getProfileCopilotContextLabel(context: ProfileCopilotContext): string {
  if (context.surface === 'setup') {
    return `Setup - ${formatStatusLabel(context.step)}`
  }

  if (context.surface === 'profile') {
    return `Profile - ${formatStatusLabel(context.section)}`
  }

  return 'Profile'
}

export function getPatchGroupBadgeVariant(
  applyMode: JobFinderWorkspaceSnapshot['profileCopilotMessages'][number]['patchGroups'][number]['applyMode'],
): 'default' | 'outline' | 'destructive' {
  if (applyMode === 'applied') {
    return 'default'
  }

  return applyMode === 'rejected' ? 'destructive' : 'outline'
}

export function describePatchOperation(operation: ProfileCopilotPatchOperation): string {
  switch (operation.operation) {
    case 'replace_identity_fields':
    case 'replace_work_eligibility_fields':
    case 'replace_professional_summary_fields':
    case 'replace_narrative_fields':
    case 'replace_answer_bank_fields':
    case 'replace_application_identity_fields':
    case 'replace_skill_group_fields':
    case 'replace_profile_list_fields':
    case 'replace_search_preferences_fields': {
      const keys = Object.keys(operation.value)
      const discoveryTargetCount = getDiscoveryTargetCount(operation)

      if (keys.length === 1 && keys[0] === 'discovery' && discoveryTargetCount !== null) {
        return `Update job sources (${discoveryTargetCount} target${discoveryTargetCount === 1 ? '' : 's'})`
      }

      return describeFieldChanges(operation.value)
    }
    case 'replace_compensation_preferences_fields': {
      const { currency, currencyStatus, interval, maximum, minimum } = operation.value
      const range = minimum != null && maximum != null
        ? `${formatNumber(minimum)}–${formatNumber(maximum)}`
        : minimum != null
          ? `from ${formatNumber(minimum)}`
          : maximum != null
            ? `up to ${formatNumber(maximum)}`
            : 'range'
      const currencyLabel = currencyStatus === 'needs_clarification'
        ? 'currency not set — confirmation needed'
        : currency ?? 'saved currency'
      return `Set compensation to ${range} / ${interval ?? 'saved interval'} (${currencyLabel})`
    }
    case 'upsert_experience_record':
      return `Add or update experience: ${operation.record.title ?? operation.record.companyName ?? 'record'}`
    case 'remove_experience_record':
      return `Remove experience record ${operation.recordId}`
    case 'upsert_education_record':
      return `Add or update education: ${operation.record.schoolName ?? operation.record.degree ?? 'record'}`
    case 'remove_education_record':
      return `Remove education record ${operation.recordId}`
    case 'upsert_certification_record':
      return `Add or update certification: ${operation.record.name ?? 'record'}`
    case 'remove_certification_record':
      return `Remove certification record ${operation.recordId}`
    case 'upsert_project_record':
      return `Add or update project: ${operation.record.name}`
    case 'remove_project_record':
      return `Remove project record ${operation.recordId}`
    case 'upsert_link_record':
      return `Add or update link: ${operation.record.label ?? operation.record.url ?? 'record'}`
    case 'remove_link_record':
      return `Remove link record ${operation.recordId}`
    case 'upsert_language_record':
      return `Add or update language: ${operation.record.language}`
    case 'remove_language_record':
      return `Remove language record ${operation.recordId}`
    case 'upsert_proof_point':
      return `Add or update proof: ${operation.record.title}`
    case 'remove_proof_point':
      return `Remove proof record ${operation.recordId}`
    case 'upsert_reusable_answer':
      return `Add or update reusable answer: ${operation.record.label}`
    case 'remove_reusable_answer':
      return `Remove reusable answer ${operation.recordId}`
    case 'resolve_review_items':
      return `Resolve ${operation.reviewItemIds.length} review item${operation.reviewItemIds.length === 1 ? '' : 's'} as ${formatStatusLabel(operation.resolutionStatus)}`
  }

  return 'Update profile data'
}

export function getProfileCopilotDisplayContent(
  message: JobFinderWorkspaceSnapshot['profileCopilotMessages'][number],
): string {
  if (
    message.patchGroups.length === 0 ||
    message.patchGroups.every((patchGroup) => patchGroup.applyMode === 'needs_review')
  ) {
    return message.content
  }

  const appliedCount = message.patchGroups.filter(
    (patchGroup) => patchGroup.applyMode === 'applied',
  ).length
  const rejectedCount = message.patchGroups.filter(
    (patchGroup) => patchGroup.applyMode === 'rejected',
  ).length
  const pendingCount = message.patchGroups.length - appliedCount - rejectedCount
  const contentWithoutPendingStatus = message.content
    .replace(/\s*Nothing changed yet\.?/giu, '')
    .trim()
  const currentStatus = appliedCount === message.patchGroups.length
    ? `**Current status:** ${appliedCount === 1 ? 'This change is' : 'These changes are'} applied to your profile.`
    : rejectedCount === message.patchGroups.length
      ? `**Current status:** ${rejectedCount === 1 ? 'This proposal was' : 'These proposals were'} rejected. Your profile was not changed.`
      : pendingCount === 0
        ? `**Current status:** All proposals resolved — ${appliedCount} applied and ${rejectedCount} rejected.`
        : `**Current status:** ${appliedCount} applied, ${pendingCount} awaiting review${rejectedCount > 0 ? `, and ${rejectedCount} rejected` : ''}.`

  return `${contentWithoutPendingStatus}\n\n${currentStatus}`
}

export function getPatchGroupOperationSummary(
  patchGroup: JobFinderWorkspaceSnapshot['profileCopilotMessages'][number]['patchGroups'][number],
): string {
  const firstOperation = patchGroup.operations[0]

  if (!firstOperation) {
    return patchGroup.summary
  }

  switch (firstOperation.operation) {
    case 'replace_identity_fields':
    case 'replace_work_eligibility_fields':
    case 'replace_narrative_fields':
    case 'replace_professional_summary_fields':
    case 'replace_answer_bank_fields':
    case 'replace_application_identity_fields':
    case 'replace_skill_group_fields': {
      const keys = Object.keys(firstOperation.value)

      if (keys.length === 1 && keys[0] !== undefined) {
        return `Updated ${humanizeFieldKey(keys[0])}`
      }

      return `Updated ${keys.length} profile fields`
    }
    case 'replace_search_preferences_fields': {
      const keys = Object.keys(firstOperation.value)

      if (keys.length === 1 && keys[0] === 'discovery') {
        return patchGroup.summary
      }

      if (keys.length === 1 && keys[0] !== undefined) {
        return `Updated ${humanizeFieldKey(keys[0])}`
      }

      return `Updated ${keys.length} profile fields`
    }
    case 'replace_compensation_preferences_fields':
      return 'Updated compensation preferences'
    case 'upsert_experience_record':
      return `Suggested experience update: ${firstOperation.record.title ?? firstOperation.record.companyName ?? 'record'}`
    case 'upsert_link_record':
      return `Suggested link update: ${firstOperation.record.label ?? firstOperation.record.url ?? 'record'}`
    default:
      return patchGroup.summary
  }
}
