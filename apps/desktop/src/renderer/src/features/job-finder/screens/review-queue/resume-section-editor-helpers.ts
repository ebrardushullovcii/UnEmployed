import type {
  ResumeDraftBullet,
  ResumeDraftEntry,
  ResumeDraftPatch,
  ResumeDraftSection,
} from '@unemployed/contracts'

let resumeDraftPatchCounter = 0

export function normalizeNullableText(
  value: string | null | undefined,
): string | null {
  if (value == null || value.trim() === '') {
    return null
  }

  return value
}

export function createResumeDraftPatch(input: {
  anchorBulletId?: string | null
  bulletId?: string | null
  entryId?: string | null
  idPrefix: string
  newBullets?: ResumeDraftBullet[] | null
  newIncluded?: boolean | null
  newLocked?: boolean | null
  newText?: string | null
  operation: ResumeDraftPatch['operation']
  position?: ResumeDraftPatch['position']
  sectionId: string
}) {
  const {
    anchorBulletId = null,
    bulletId = null,
    entryId = null,
    idPrefix,
    newBullets = null,
    newIncluded = null,
    newLocked = null,
    newText = null,
    operation,
    position = null,
    sectionId,
  } = input

  resumeDraftPatchCounter += 1
  const id = `${idPrefix}_${Date.now()}_${resumeDraftPatchCounter}`

  return {
    id,
    draftId: '',
    operation,
    targetSectionId: sectionId,
    targetEntryId: entryId,
    targetBulletId: bulletId,
    anchorBulletId,
    position,
    newText,
    newIncluded,
    newLocked,
    newBullets,
    appliedAt: new Date().toISOString(),
    origin: 'user' as const,
    conflictReason: null,
  } satisfies ResumeDraftPatch
}

export function updateSectionEntry(
  section: ResumeDraftSection,
  entryId: string,
  updater: (entry: ResumeDraftEntry) => ResumeDraftEntry,
) {
  return {
    ...section,
    entries: section.entries.map((entry) =>
      entry.id === entryId ? updater(entry) : entry,
    ),
  }
}

export function updateEntryField(
  section: ResumeDraftSection,
  entryId: string,
  field: 'dateRange' | 'location' | 'subtitle' | 'summary' | 'title',
  value: string | null,
) {
  return updateSectionEntry(section, entryId, (entry) => ({
    ...entry,
    [field]: value,
  }))
}

export function updateEntryBulletText(
  section: ResumeDraftSection,
  entryId: string,
  bulletId: string,
  text: string,
) {
  return updateSectionEntry(section, entryId, (entry) => ({
    ...entry,
    bullets: entry.bullets.map((bullet) =>
      bullet.id === bulletId ? { ...bullet, text } : bullet,
    ),
  }))
}

export function updateSectionBulletText(
  section: ResumeDraftSection,
  bulletId: string,
  text: string,
) {
  return {
    ...section,
    bullets: section.bullets.map((bullet) =>
      bullet.id === bulletId ? { ...bullet, text } : bullet,
    ),
  }
}
