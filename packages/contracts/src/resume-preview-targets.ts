export const resumePreviewIdentityFieldValues = [
  'fullName',
  'headline',
  'location',
  'email',
  'phone',
  'portfolioUrl',
  'linkedinUrl',
  'githubUrl',
  'personalWebsiteUrl',
  'additionalLinks',
] as const

export type ResumePreviewIdentityField = (typeof resumePreviewIdentityFieldValues)[number]

export const resumePreviewEntryFieldValues = [
  'title',
  'subtitle',
  'location',
  'dateRange',
  'summary',
] as const

export type ResumePreviewEntryField = (typeof resumePreviewEntryFieldValues)[number]

function encodeSegment(value: string): string {
  return encodeURIComponent(value)
}

function decodeSegment(value: string): string {
  return decodeURIComponent(value)
}

export function getResumeIdentityTargetId(field: ResumePreviewIdentityField): string {
  return `identity:${field}`
}

export function getResumeSectionTextTargetId(sectionId: string): string {
  return `section:${encodeSegment(sectionId)}:text`
}

export function getResumeSectionBulletTargetId(sectionId: string, bulletId: string): string {
  return `section:${encodeSegment(sectionId)}:bullet:${encodeSegment(bulletId)}`
}

export function getResumeEntryFieldTargetId(
  sectionId: string,
  entryId: string,
  field: ResumePreviewEntryField,
): string {
  return `entry:${encodeSegment(sectionId)}:${encodeSegment(entryId)}:${field}`
}

export function getResumeEntryBulletTargetId(sectionId: string, entryId: string, bulletId: string): string {
  return `entry:${encodeSegment(sectionId)}:${encodeSegment(entryId)}:bullet:${encodeSegment(bulletId)}`
}

export function getResumePreviewTargetContext(targetId: string): {
  sectionId: string | null
  entryId: string | null
} {
  if (targetId.startsWith('identity:')) {
    return {
      sectionId: null,
      entryId: null,
    }
  }

  const sectionTextMatch = /^section:([^:]+):text$/.exec(targetId)
  if (sectionTextMatch) {
    return {
      sectionId: decodeSegment(sectionTextMatch[1] ?? ''),
      entryId: null,
    }
  }

  const sectionBulletMatch = /^section:([^:]+):bullet:([^:]+)$/.exec(targetId)
  if (sectionBulletMatch) {
    return {
      sectionId: decodeSegment(sectionBulletMatch[1] ?? ''),
      entryId: null,
    }
  }

  const entryFieldMatch = /^entry:([^:]+):([^:]+):([a-zA-Z]+)$/.exec(targetId)
  if (entryFieldMatch) {
    return {
      sectionId: decodeSegment(entryFieldMatch[1] ?? ''),
      entryId: decodeSegment(entryFieldMatch[2] ?? ''),
    }
  }

  const entryBulletMatch = /^entry:([^:]+):([^:]+):bullet:([^:]+)$/.exec(targetId)
  if (entryBulletMatch) {
    return {
      sectionId: decodeSegment(entryBulletMatch[1] ?? ''),
      entryId: decodeSegment(entryBulletMatch[2] ?? ''),
    }
  }

  return {
    sectionId: null,
    entryId: null,
  }
}
