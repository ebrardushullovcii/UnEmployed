import {
  AgentProviderStatusSchema,
  candidateLinkKindValues,
  type AgentProviderStatus,
  type CandidateProfile,
  type JobFinderSettings,
  type JobPosting,
  type JobSearchPreferences,
  workModeValues
} from '@unemployed/contracts'
import { z } from 'zod'

const NonEmptyStringSchema = z.string().trim().min(1)
const NullableStringSchema = NonEmptyStringSchema.nullable().default(null)

const ResumeExtractionProfessionalSummarySchema = z.object({
  shortValueProposition: NullableStringSchema,
  fullSummary: NullableStringSchema,
  careerThemes: z.array(NonEmptyStringSchema).default([]),
  leadershipSummary: NullableStringSchema,
  domainFocusSummary: NullableStringSchema,
  strengths: z.array(NonEmptyStringSchema).default([])
})

const ResumeExtractionSkillGroupSchema = z.object({
  coreSkills: z.array(NonEmptyStringSchema).default([]),
  tools: z.array(NonEmptyStringSchema).default([]),
  languagesAndFrameworks: z.array(NonEmptyStringSchema).default([]),
  softSkills: z.array(NonEmptyStringSchema).default([]),
  highlightedSkills: z.array(NonEmptyStringSchema).default([])
})

const ResumeExtractionExperienceSchema = z.object({
  companyName: NullableStringSchema,
  companyUrl: NullableStringSchema,
  title: NullableStringSchema,
  employmentType: NullableStringSchema,
  location: NullableStringSchema,
  workMode: z.enum(workModeValues).nullable().default(null),
  startDate: NullableStringSchema,
  endDate: NullableStringSchema,
  isCurrent: z.boolean().default(false),
  summary: NullableStringSchema,
  achievements: z.array(NonEmptyStringSchema).default([]),
  skills: z.array(NonEmptyStringSchema).default([]),
  domainTags: z.array(NonEmptyStringSchema).default([]),
  peopleManagementScope: NullableStringSchema,
  ownershipScope: NullableStringSchema
})

const ResumeExtractionEducationSchema = z.object({
  schoolName: NullableStringSchema,
  degree: NullableStringSchema,
  fieldOfStudy: NullableStringSchema,
  location: NullableStringSchema,
  startDate: NullableStringSchema,
  endDate: NullableStringSchema,
  summary: NullableStringSchema
})

const ResumeExtractionCertificationSchema = z.object({
  name: NullableStringSchema,
  issuer: NullableStringSchema,
  issueDate: NullableStringSchema,
  expiryDate: NullableStringSchema,
  credentialUrl: NullableStringSchema
})

const ResumeExtractionLinkSchema = z.object({
  label: NullableStringSchema,
  url: NullableStringSchema,
  kind: z.enum(candidateLinkKindValues).nullable().default(null)
})

const ResumeExtractionProjectSchema = z.object({
  name: NullableStringSchema,
  projectType: NullableStringSchema,
  summary: NullableStringSchema,
  role: NullableStringSchema,
  skills: z.array(NonEmptyStringSchema).default([]),
  outcome: NullableStringSchema,
  projectUrl: NullableStringSchema,
  repositoryUrl: NullableStringSchema,
  caseStudyUrl: NullableStringSchema
})

const ResumeExtractionLanguageSchema = z.object({
  language: NullableStringSchema,
  proficiency: NullableStringSchema,
  interviewPreference: z.boolean().default(false),
  notes: NullableStringSchema
})

const ResumeProfileExtractionSchema = z.object({
  firstName: NullableStringSchema,
  lastName: NullableStringSchema,
  middleName: NullableStringSchema,
  fullName: NullableStringSchema,
  headline: NullableStringSchema,
  summary: NullableStringSchema,
  currentLocation: NullableStringSchema,
  timeZone: NullableStringSchema,
  salaryCurrency: NullableStringSchema,
  yearsExperience: z.number().int().min(0).nullable(),
  email: NullableStringSchema,
  phone: NullableStringSchema,
  portfolioUrl: NullableStringSchema,
  linkedinUrl: NullableStringSchema,
  githubUrl: NullableStringSchema,
  personalWebsiteUrl: NullableStringSchema,
  professionalSummary: ResumeExtractionProfessionalSummarySchema.default({}),
  skillGroups: ResumeExtractionSkillGroupSchema.default({}),
  skills: z.array(NonEmptyStringSchema).default([]),
  targetRoles: z.array(NonEmptyStringSchema).default([]),
  preferredLocations: z.array(NonEmptyStringSchema).default([]),
  experiences: z.array(ResumeExtractionExperienceSchema).default([]),
  education: z.array(ResumeExtractionEducationSchema).default([]),
  certifications: z.array(ResumeExtractionCertificationSchema).default([]),
  links: z.array(ResumeExtractionLinkSchema).default([]),
  projects: z.array(ResumeExtractionProjectSchema).default([]),
  spokenLanguages: z.array(ResumeExtractionLanguageSchema).default([]),
  analysisProviderKind: z.enum(['deterministic', 'openai_compatible']),
  analysisProviderLabel: NonEmptyStringSchema,
  notes: z.array(NonEmptyStringSchema).default([])
})

export type ResumeProfileExtraction = z.infer<typeof ResumeProfileExtractionSchema>

const TailoredResumeDraftSchema = z.object({
  label: NullableStringSchema,
  summary: NonEmptyStringSchema,
  experienceHighlights: z.array(NonEmptyStringSchema).min(1),
  coreSkills: z.array(NonEmptyStringSchema).default([]),
  targetedKeywords: z.array(NonEmptyStringSchema).default([]),
  fullText: NonEmptyStringSchema,
  compatibilityScore: z.number().int().min(0).max(100).nullable(),
  notes: z.array(NonEmptyStringSchema).default([])
})

export type TailoredResumeDraft = z.infer<typeof TailoredResumeDraftSchema>

const JobFitAssessmentSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasons: z.array(NonEmptyStringSchema).default([]),
  gaps: z.array(NonEmptyStringSchema).default([])
})

export type JobFitAssessment = z.infer<typeof JobFitAssessmentSchema>

export interface ExtractProfileFromResumeInput {
  existingProfile: CandidateProfile
  existingSearchPreferences: JobSearchPreferences
  resumeText: string
}

export interface TailorResumeInput {
  profile: CandidateProfile
  searchPreferences: JobSearchPreferences
  settings: JobFinderSettings
  job: JobPosting
  resumeText: string | null
}

export interface AssessJobFitInput {
  profile: CandidateProfile
  searchPreferences: JobSearchPreferences
  job: JobPosting
}

export interface JobFinderAiClient {
  getStatus(): AgentProviderStatus
  extractProfileFromResume(input: ExtractProfileFromResumeInput): Promise<ResumeProfileExtraction>
  tailorResume(input: TailorResumeInput): Promise<TailoredResumeDraft>
  assessJobFit(input: AssessJobFitInput): Promise<JobFitAssessment | null>
}

export interface OpenAiCompatibleJobFinderAiClientOptions {
  apiKey: string
  baseUrl: string
  model: string
  label?: string
}

type StringMap = Record<string, string | undefined>

const knownSkillPhrases = [
  'React',
  'React Native',
  'TypeScript',
  'JavaScript',
  'C#',
  'Node.js',
  'Node',
  'Next.js',
  'Express.js',
  'ASP.NET',
  '.NET Core',
  '.NET Framework',
  'Entity Framework',
  'MVC',
  'Electron',
  'Playwright',
  'SQLite',
  'Figma',
  'Design Systems',
  'Product Design',
  'UX Strategy',
  'Accessibility',
  'Python',
  'AWS',
  'Azure',
  'SQL Server',
  'MySQL',
  'PostgreSQL',
  'MongoDB',
  'Docker',
  'WebSockets',
  'Postman',
  'Jira',
  'Selenium',
  'Cypress',
  'GraphQL',
  'SQL',
  'CSS',
  'HTML',
  'OAuth',
  'JWT',
  'TailwindCSS',
  'ShadCN',
  'REST APIs'
] as const

const knownSoftSkillPhrases = [
  'Leadership',
  'Communication',
  'Problem-solving',
  'Adaptability',
  'Mentoring',
  'Collaboration',
  'Stakeholder alignment',
  'Facilitation'
] as const

const resumeSectionHeadings = new Set([
  'ABOUT MYSELF',
  'ABOUT',
  'SUMMARY',
  'PROFILE',
  'PERSONAL PROFILE',
  'PROFESSIONAL SUMMARY',
  'SKILLS',
  'TECHNICAL SKILLS',
  'CORE SKILLS',
  'KEY SKILLS',
  'WORK EXPERIENCE',
  'EXPERIENCE',
  'PROJECTS',
  'EDUCATION AND TRAINING',
  'EDUCATION',
  'LANGUAGE SKILLS',
  'CERTIFICATIONS'
])

const contactOrMetaPattern =
  /date of birth|nationality|phone|email|website|address|skills|experience|education|frameworks|languages|databases|tools|soft skills/i

const headlineKeywordPattern =
  /\b(software|full-stack|frontend|backend|web|react|node|\.net|chief)?\s*(engineer|developer|designer|manager|lead|architect|specialist|consultant|analyst|officer)\b/i

const skillSectionAliases = ['SKILLS', 'TECHNICAL SKILLS', 'CORE SKILLS', 'KEY SKILLS'] as const
const summarySectionAliases = ['ABOUT MYSELF', 'ABOUT', 'SUMMARY', 'PROFILE', 'PERSONAL PROFILE', 'PROFESSIONAL SUMMARY'] as const
const experienceSectionAliases = ['WORK EXPERIENCE', 'EXPERIENCE'] as const
const skillCategoryHeadingPattern = /^(frameworks|programming languages|languages|databases|tools|security(?:\s*&\s*authentication)?|soft skills)$/i
const dateRangePattern = /((?:\d{2}\/)?\d{4})\s*[–—-]\s*(current|present|(?:\d{2}\/)?\d{4})/i

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>()

  return values.flatMap((value) => {
    const normalized = value.trim()

    if (!normalized) {
      return []
    }

    const key = normalized.toLowerCase()

    if (seen.has(key)) {
      return []
    }

    seen.add(key)
    return [normalized]
  })
}

function cleanLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean)
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function extractRegexMatch(value: string, expression: RegExp): string | null {
  const match = value.match(expression)
  return cleanLine(match?.[0] ?? '') || null
}

function extractFirstUrl(value: string, expression: RegExp): string | null {
  const match = value.match(expression)
  return match?.[0] ?? null
}

function isResumeSectionHeading(line: string): boolean {
  return resumeSectionHeadings.has(line.toUpperCase())
}

function findSectionBodyLines(lines: readonly string[], heading: string): string[] {
  const startIndex = lines.findIndex((line) => line.toUpperCase() === heading.toUpperCase())

  if (startIndex === -1) {
    return []
  }

  const body: string[] = []

  for (const line of lines.slice(startIndex + 1)) {
    if (isResumeSectionHeading(line)) {
      break
    }

    body.push(line)
  }

  return body
}

function findSectionBodyLinesByAliases(lines: readonly string[], aliases: readonly string[]): string[] {
  for (const alias of aliases) {
    const body = findSectionBodyLines(lines, alias)

    if (body.length > 0) {
      return body
    }
  }

  return []
}

function normalizeHeadlineText(value: string): string {
  const normalized = cleanLine(
    value
      .replace(/\s+[–—-]\s+(?:\d{2}\/\d{4}|\d{4})\s+[–—-]\s+(?:current|present|\d{2}\/\d{4}|\d{4}).*$/i, '')
      .replace(/\s+[–—-]\s+current$/i, '')
  )

  const knownCaseMap: Record<string, string> = {
    react: 'React',
    'next.js': 'Next.js',
    'node.js': 'Node.js',
    node: 'Node',
    '.net': '.NET',
    'asp.net': 'ASP.NET',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    qa: 'QA',
    ui: 'UI',
    ux: 'UX'
  }

  const formatSegment = (segment: string): string => {
    const match = segment.match(/^([^A-Za-z0-9.]*)((?:[A-Za-z0-9.]+))(.*)$/)

    if (!match) {
      return segment
    }

    const prefix = match[1] ?? ''
    const core = match[2] ?? ''
    const suffix = match[3] ?? ''
    const lowerCore = core.toLowerCase()
    const formattedCore =
      knownCaseMap[lowerCore] ??
      (lowerCore.length > 0 ? `${lowerCore[0]?.toUpperCase() ?? ''}${lowerCore.slice(1)}` : core)

    return `${prefix}${formattedCore}${suffix}`
  }

  return normalized
    .split(/\s+/)
    .map((token) => token.split('/').map(formatSegment).join('/'))
    .join(' ')
}

function inferCurrentLocation(lines: readonly string[]): string | null {
  const addressLine = lines.find((line) => /^Address:/i.test(line))

  if (addressLine) {
    const cleaned = cleanLine(
      addressLine
        .replace(/^Address:\s*/i, '')
        .replace(/\s*\([^)]*\)\s*$/g, '')
    )

    if (cleaned) {
      return cleaned
    }
  }

  const fallbackLine = lines.find(
    (line) =>
      /^[A-Za-z][A-Za-z\s.'-]+,\s*[A-Za-z][A-Za-z\s.'-]+$/.test(line) && !/–/.test(line) && !contactOrMetaPattern.test(line)
  )

  return fallbackLine ?? null
}

function inferPhone(resumeText: string, existingPhone: string | null): string | null {
  const labeledMatch = resumeText.match(/Phone:\s*([^\n]+?)(?:\s+Email:|\s+Website:|\s+Address:|$)/i)

  if (labeledMatch?.[1]) {
    const cleaned = cleanLine(labeledMatch[1].replace(/\s*\((?:mobile|home|work)\)\s*$/i, ''))

    if (cleaned) {
      return cleaned
    }
  }

  return extractRegexMatch(resumeText, /(\(?\+?\d[\d\s().-]{7,}\d\)?)/) ?? existingPhone
}

function inferPortfolioUrl(resumeText: string): string | null {
  return (
    uniqueStrings((resumeText.match(/https?:\/\/[^\s]+/gi) ?? []).map((url) => url.replace(/[),.;]+$/, ''))).find(
      (url) => !/linkedin\.com/i.test(url)
    ) ?? null
  )
}

function inferName(lines: readonly string[]): string | null {
  const candidate = lines.find(
    (line) =>
      !line.includes('@') &&
      !/^https?:\/\//i.test(line) &&
      !/resume|curriculum|summary|profile|experience|birth|nationality|phone|email|address/i.test(line) &&
      line.split(' ').length >= 2 &&
      line.split(' ').length <= 5 &&
      line.length <= 48 &&
      /^[A-Za-z\s'-]+$/.test(line)
  )

  return candidate ?? null
}

function parseNameParts(fullName: string | null): { firstName: string | null; lastName: string | null; middleName: string | null } {
  if (!fullName) {
    return { firstName: null, lastName: null, middleName: null }
  }

  const parts = fullName.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return { firstName: null, lastName: null, middleName: null }
  }

  if (parts.length === 1) {
    return { firstName: parts[0] ?? null, lastName: null, middleName: null }
  }

  if (parts.length === 2) {
    return { firstName: parts[0] ?? null, lastName: parts[1] ?? null, middleName: null }
  }

  const firstName = parts[0] ?? null
  const lastName = parts[parts.length - 1] ?? null
  const middleParts = parts.slice(1, -1)
  const middleName = middleParts.length > 0 ? middleParts.join(' ') : null

  return { firstName, lastName, middleName }
}

function inferHeadline(lines: readonly string[]): string | null {
  const candidate = lines.find(
    (line) =>
      !line.includes('@') &&
      !/^https?:\/\//i.test(line) &&
      !contactOrMetaPattern.test(line) &&
      headlineKeywordPattern.test(line) &&
      line.length <= 72 &&
      line.split(/\s+/).length <= 10
  )

  return candidate ? normalizeHeadlineText(candidate) : null
}

function inferSummary(lines: readonly string[]): string | null {
  const aboutLines = findSectionBodyLinesByAliases(lines, summarySectionAliases).filter(
    (line) => !/date of birth|nationality|phone|email|website|address/i.test(line) && !/^https?:\/\//i.test(line)
  )

  if (aboutLines.length > 0) {
    return cleanLine(aboutLines.join(' '))
  }

  return (
    lines.find(
      (line) =>
        line.length >= 48 &&
        !line.includes('@') &&
        !/^https?:\/\//i.test(line) &&
        !/date of birth|nationality|phone|email|website|address/i.test(line) &&
        !isResumeSectionHeading(line)
    ) ?? null
  )
}

function inferSkills(resumeText: string, fallbackSkills: readonly string[]): string[] {
  const sectionLines = findSectionBodyLinesByAliases(splitLines(resumeText), skillSectionAliases)
  const sectionText = sectionLines.join('\n')
  const matchedKnownSkills = uniqueStrings(
    knownSkillPhrases.filter((skill) => sectionText.toLowerCase().includes(skill.toLowerCase()))
  )
  const rawSectionSkills = sectionLines
    .filter((line) => !skillCategoryHeadingPattern.test(line))
    .flatMap((line) => line.split(/,|\||\u2022/))
    .map(cleanLine)
    .filter((entry) => entry.length >= 2 && entry.length <= 28)
    .filter((entry) => {
      const overlappingKnownSkills = knownSkillPhrases.filter((skill) => entry.toLowerCase().includes(skill.toLowerCase()))

      if (overlappingKnownSkills.length > 1) {
        return false
      }

      return !matchedKnownSkills.some((skill) => skill.toLowerCase() === entry.toLowerCase())
    })
  const sectionSkills = uniqueStrings([...matchedKnownSkills, ...rawSectionSkills])

  if (sectionSkills.length > 0) {
    return uniqueStrings(sectionSkills)
  }

  const lowerText = resumeText.toLowerCase()
  const extractedSkills = knownSkillPhrases.filter((skill) => lowerText.includes(skill.toLowerCase()))
  return extractedSkills.length > 0 ? uniqueStrings(extractedSkills) : uniqueStrings(fallbackSkills)
}

function extractAllUrls(resumeText: string): string[] {
  return uniqueStrings((resumeText.match(/https?:\/\/[^\s]+/gi) ?? []).map((url) => url.replace(/[),.;]+$/, '')))
}

function inferGithubUrl(resumeText: string): string | null {
  return extractFirstUrl(resumeText, /https?:\/\/(?:www\.)?github\.com\/[\w./?%&=+-]*/i)
}

function inferPersonalWebsiteUrl(resumeText: string): string | null {
  return (
    extractAllUrls(resumeText).find((url) => !/linkedin\.com|github\.com/i.test(url)) ?? null
  )
}

function inferKnownPhrases(text: string, phrases: readonly string[]): string[] {
  const lowerText = text.toLowerCase()
  return uniqueStrings(phrases.filter((phrase) => lowerText.includes(phrase.toLowerCase())))
}

function splitSkillLine(line: string): string[] {
  const rawEntries = line
    .split(/,|\||\u2022| {2,}/)
    .map(cleanLine)
    .filter((entry) => entry.length >= 2 && entry.length <= 40)

  const matchedKnownSkills = inferKnownPhrases(line, knownSkillPhrases)

  if (matchedKnownSkills.length > 1) {
    return matchedKnownSkills
  }

  return uniqueStrings([
    ...matchedKnownSkills,
    ...rawEntries.filter((entry) => inferKnownPhrases(entry, knownSkillPhrases).length <= 1)
  ])
}

function inferSkillGroups(resumeText: string, fallbackSkills: readonly string[]) {
  const sectionLines = findSectionBodyLinesByAliases(splitLines(resumeText), skillSectionAliases)
  const groups = {
    coreSkills: [] as string[],
    tools: [] as string[],
    languagesAndFrameworks: [] as string[],
    softSkills: [] as string[],
    highlightedSkills: [] as string[]
  }
  let activeGroup: keyof typeof groups = 'coreSkills'

  for (const line of sectionLines) {
    if (/^(frameworks|programming languages|languages)$/i.test(line)) {
      activeGroup = 'languagesAndFrameworks'
      continue
    }

    if (/^(databases|tools|security(?:\s*&\s*authentication)?)$/i.test(line)) {
      activeGroup = 'tools'
      continue
    }

    if (/^soft skills$/i.test(line)) {
      activeGroup = 'softSkills'
      continue
    }

    if (skillCategoryHeadingPattern.test(line)) {
      continue
    }

    if (activeGroup === 'softSkills') {
      groups.softSkills.push(...inferKnownPhrases(line, knownSoftSkillPhrases))
      continue
    }

    groups[activeGroup].push(...splitSkillLine(line))
  }

  const allSkills = inferSkills(resumeText, fallbackSkills)

  return {
    coreSkills: uniqueStrings(groups.coreSkills.length > 0 ? groups.coreSkills : allSkills.slice(0, 8)),
    tools: uniqueStrings(groups.tools),
    languagesAndFrameworks: uniqueStrings(groups.languagesAndFrameworks),
    softSkills: uniqueStrings(groups.softSkills),
    highlightedSkills: uniqueStrings([
      ...groups.coreSkills.slice(0, 4),
      ...groups.languagesAndFrameworks.slice(0, 4),
      ...allSkills.slice(0, 4)
    ]).slice(0, 8)
  }
}

function titleCaseWords(value: string): string {
  return cleanLine(value.toLowerCase().replace(/\b[a-z]/g, (character) => character.toUpperCase()))
}

function normalizeLocationLabel(value: string | null): string | null {
  if (!value) {
    return null
  }

  return /[A-Z]{2,}/.test(value) ? titleCaseWords(value) : cleanLine(value)
}

function inferTimeZoneFromLocation(location: string | null): string | null {
  if (!location) {
    return null
  }

  const normalizedLocation = location.toLowerCase()
  const knownMappings: Array<[RegExp, string]> = [
    [/prishtina|kosovo/, 'Europe/Belgrade'],
    [/london|united kingdom|uk\b|england/, 'Europe/London'],
    [/new york|usa|united states/, 'America/New_York'],
    [/berlin|germany/, 'Europe/Berlin'],
    [/paris|france/, 'Europe/Paris'],
    [/toronto|canada/, 'America/Toronto'],
    [/zurich|switzerland/, 'Europe/Zurich']
  ]

  for (const [pattern, timeZone] of knownMappings) {
    if (pattern.test(normalizedLocation)) {
      return timeZone
    }
  }

  return null
}

function inferSalaryCurrencyFromLocation(location: string | null): string | null {
  if (!location) {
    return null
  }

  const normalizedLocation = location.toLowerCase()
  const knownMappings: Array<[RegExp, string]> = [
    [/prishtina|kosovo|germany|berlin|france|paris|spain|italy|netherlands|belgium|austria|portugal|finland|ireland|greece/, 'EUR'],
    [/london|united kingdom|uk\b|england/, 'GBP'],
    [/switzerland|zurich|geneva/, 'CHF'],
    [/toronto|canada/, 'CAD'],
    [/new york|usa|united states/, 'USD']
  ]

  for (const [pattern, currency] of knownMappings) {
    if (pattern.test(normalizedLocation)) {
      return currency
    }
  }

  return null
}

function inferProfessionalSummary(summary: string | null, headline: string | null, skills: readonly string[]) {
  const firstSentence = cleanLine(summary?.split(/(?<=[.!?])\s+/)[0] ?? '') || null

  return {
    shortValueProposition: firstSentence,
    fullSummary: summary,
    careerThemes: uniqueStrings([headline ?? '', ...skills.slice(0, 3)]),
    leadershipSummary: null,
    domainFocusSummary: null,
    strengths: uniqueStrings(skills.slice(0, 5))
  }
}

function parseDateRange(line: string): { startDate: string | null; endDate: string | null; isCurrent: boolean } {
  const match = line.match(dateRangePattern)

  if (!match) {
    return { startDate: null, endDate: null, isCurrent: false }
  }

  const startDate = match[1] ?? null
  const rawEndDate = match[2] ?? null
  const isCurrent = rawEndDate ? /current|present/i.test(rawEndDate) : false

  return {
    startDate,
    endDate: isCurrent ? null : rawEndDate,
    isCurrent
  }
}

function isCompanyMarkerLine(line: string): boolean {
  const cleaned = cleanLine(line.replace(/^[^A-Za-z0-9]+/, ''))
  return /^[A-Z0-9&.'()/-]+(?:\s+[A-Z0-9&.'()/-]+)*\s*[–—-]\s*[A-Z][A-Z\s.'-]+,\s*[A-Z][A-Z\s.'-]+$/.test(cleaned)
}

function parseCompanyMarker(line: string): { companyName: string | null; location: string | null } {
  const cleaned = cleanLine(line.replace(/^[^A-Za-z0-9]+/, ''))
  const match = cleaned.match(/^([A-Z0-9&.'()/-]+(?:\s+[A-Z0-9&.'()/-]+)*)\s*[–—-]\s*([A-Z][A-Z\s.'-]+,\s*[A-Z][A-Z\s.'-]+)$/)

  if (!match) {
    return { companyName: null, location: null }
  }

  return {
    companyName: cleanLine(match[1] ?? '') || null,
    location: normalizeLocationLabel(match[2] ?? null)
  }
}

function splitExperienceBlocks(lines: readonly string[]): string[][] {
  const blocks: string[][] = []
  let currentBlock: string[] = []
  let pendingCompanyMarker: string | null = null

  for (const line of lines) {
    if (isCompanyMarkerLine(line)) {
      pendingCompanyMarker = line
      continue
    }

    const startsNewBlock = dateRangePattern.test(line)

    if (startsNewBlock) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock)
      }

      currentBlock = pendingCompanyMarker ? [pendingCompanyMarker, line] : [line]
      pendingCompanyMarker = null
      continue
    }

    if (currentBlock.length > 0) {
      currentBlock.push(line)
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock)
  }

  return blocks.filter((block) => block.some((line) => dateRangePattern.test(line)))
}

function inferExperienceEntries(resumeText: string) {
  const sectionLines = findSectionBodyLinesByAliases(splitLines(resumeText), experienceSectionAliases)

  return splitExperienceBlocks(sectionLines)
    .map((block) => {
      const companyContext = isCompanyMarkerLine(block[0] ?? '') ? parseCompanyMarker(block[0] ?? '') : null
      const headerLine = companyContext ? block[1] ?? '' : block[0] ?? ''
      const dateRange = parseDateRange(headerLine)
      const titleValue = cleanLine(headerLine.replace(dateRangePattern, '').replace(/[|,–—-]+\s*$/g, '')) || null
      const detailLines = block
        .slice(companyContext ? 2 : 1)
        .map((line) => cleanLine(line.replace(/^[•*-]\s*/, '')))
        .filter((line) => line.length > 0 && !isCompanyMarkerLine(line))
      const summaryLine = detailLines.find((line) => !/^project lead\b/i.test(line)) ?? null
      const achievementLines = detailLines.filter((line) => line !== summaryLine)

      return {
        companyName: companyContext?.companyName ?? null,
        companyUrl: null,
        title: titleValue ? normalizeHeadlineText(titleValue) : null,
        employmentType: null,
        location: companyContext?.location ?? null,
        workMode: null,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        isCurrent: dateRange.isCurrent,
        summary: summaryLine,
        achievements: uniqueStrings(achievementLines.filter((line) => line.length >= 24).slice(0, 6)),
        skills: inferSkills(block.join('\n'), []),
        domainTags: [],
        peopleManagementScope: null,
        ownershipScope: null
      }
    })
    .filter((entry) => entry.title || entry.companyName || entry.summary)
}

function inferLinkKind(url: string): (typeof candidateLinkKindValues)[number] {
  if (/linkedin\.com/i.test(url)) {
    return 'linkedin'
  }

  if (/github\.com/i.test(url)) {
    return 'github'
  }

  return 'website'
}

function inferLinkLabel(url: string): string {
  if (/linkedin\.com/i.test(url)) {
    return 'LinkedIn'
  }

  if (/github\.com/i.test(url)) {
    return 'GitHub'
  }

  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return 'Website'
  }
}

function inferLinks(resumeText: string) {
  return extractAllUrls(resumeText).map((url) => ({
    label: inferLinkLabel(url),
    url,
    kind: inferLinkKind(url)
  }))
}

function inferEducationEntries(resumeText: string) {
  const lines = splitLines(resumeText)
  const educationLine = lines.find(
    (line) =>
      /degree|bachelor|master|phd/i.test(line) &&
      /(college|university|school|institute|kolegji)/i.test(line) &&
      !isResumeSectionHeading(line)
  )

  if (!educationLine) {
    return []
  }

  const schoolKeywordMatch = educationLine.match(/\b(College|University|School|Institute|Kolegji)\b/i)
  const schoolName = schoolKeywordMatch?.index !== undefined ? cleanLine(educationLine.slice(schoolKeywordMatch.index)) : null
  const detailsPart = schoolKeywordMatch?.index !== undefined ? cleanLine(educationLine.slice(0, schoolKeywordMatch.index)) : educationLine
  const [degreePart, fieldPart] = detailsPart.split(',').map(cleanLine)
  const locationLine = lines[lines.indexOf(educationLine) - 1]

  return [
    {
      schoolName,
      degree: degreePart || null,
      fieldOfStudy: fieldPart || null,
      location: normalizeLocationLabel(locationLine ?? null),
      startDate: null,
      endDate: null,
      summary: null
    }
  ].filter((entry) => entry.schoolName || entry.degree || entry.fieldOfStudy)
}

function inferSpokenLanguages(resumeText: string) {
  const lines = splitLines(resumeText)
  const entries: Array<{ language: string | null; proficiency: string | null; interviewPreference: boolean; notes: string | null }> = []
  const motherTongueMatch = resumeText.match(/Mother tongue\(s\):\s*([A-Za-z]+)/i)

  if (motherTongueMatch?.[1]) {
    entries.push({
      language: titleCaseWords(motherTongueMatch[1]),
      proficiency: 'Native',
      interviewPreference: true,
      notes: null
    })
  }

  for (const line of lines) {
    const proficiencyMatch = line.match(/^([A-Z][A-Z\s]+?)\s+(A1|A2|B1|B2|C1|C2)(?:\s+(A1|A2|B1|B2|C1|C2)){4}$/)

    if (!proficiencyMatch) {
      continue
    }

    entries.push({
      language: titleCaseWords(proficiencyMatch[1] ?? ''),
      proficiency: proficiencyMatch[2] ?? null,
      interviewPreference: false,
      notes: null
    })
  }

  return entries.filter((entry) => entry.language)
}

function buildProfileExtractionNotes(input: {
  fullName: string | null
  headline: string | null
  summary: string | null
  currentLocation: string | null
}): string[] {
  const notes: string[] = []

  if (!input.fullName) {
    notes.push('Review the imported name because the parser could not confidently extract it.')
  }

  if (!input.headline) {
    notes.push('Add a preferred headline if the resume does not expose a clear current role.')
  }

  if (!input.summary) {
    notes.push('Add a short professional summary if the resume does not include one.')
  }

  if (!input.currentLocation) {
    notes.push('Confirm the preferred location because the resume did not expose a clear location line.')
  }

  return notes
}

function inferTargetRoles(headline: string | null, existingProfile: CandidateProfile): string[] {
  if (!headline) {
    return uniqueStrings(existingProfile.targetRoles)
  }

  return [headline]
}

function inferLocations(
  currentLocation: string | null,
  profile: CandidateProfile,
  searchPreferences: JobSearchPreferences
): string[] {
  if (currentLocation) {
    return uniqueStrings([currentLocation])
  }

  if (profile.locations.length > 0) {
    return uniqueStrings(profile.locations)
  }

  if (searchPreferences.locations.length > 0) {
    return uniqueStrings(searchPreferences.locations)
  }

  return uniqueStrings([profile.currentLocation])
}

function buildDeterministicResumeProfileExtraction(
  input: ExtractProfileFromResumeInput,
  analysisProviderKind: ResumeProfileExtraction['analysisProviderKind'],
  analysisProviderLabel: string
): ResumeProfileExtraction {
  const lines = splitLines(input.resumeText)
  const fullName = inferName(lines)
  const nameParts = parseNameParts(fullName)
  const headline = inferHeadline(lines) ?? input.existingProfile.headline
  const summary = inferSummary(lines) ?? input.existingProfile.summary
  const currentLocation = inferCurrentLocation(lines)
  const skills = inferSkills(input.resumeText, input.existingProfile.skills)
  const skillGroups = inferSkillGroups(input.resumeText, skills)
  const personalWebsiteUrl = inferPersonalWebsiteUrl(input.resumeText)
  const portfolioUrl = inferPortfolioUrl(input.resumeText) ?? personalWebsiteUrl
  const education = inferEducationEntries(input.resumeText)
  const notes = buildProfileExtractionNotes({
    fullName,
    headline,
    summary,
    currentLocation
  })

  return ResumeProfileExtractionSchema.parse({
    firstName: nameParts.firstName ?? input.existingProfile.firstName,
    lastName: nameParts.lastName ?? input.existingProfile.lastName,
    middleName: nameParts.middleName ?? input.existingProfile.middleName,
    fullName: fullName ?? input.existingProfile.fullName,
    headline,
    summary,
    currentLocation: currentLocation ?? input.existingProfile.currentLocation,
    timeZone: inferTimeZoneFromLocation(currentLocation) ?? input.existingProfile.timeZone,
    salaryCurrency: inferSalaryCurrencyFromLocation(currentLocation) ?? input.existingSearchPreferences.salaryCurrency,
    yearsExperience:
      Number.parseInt(extractRegexMatch(input.resumeText, /\b\d{1,2}\+?\s+years?\b/i)?.match(/\d+/)?.[0] ?? '', 10) ||
      input.existingProfile.yearsExperience,
    email: extractRegexMatch(input.resumeText, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) ?? input.existingProfile.email,
    phone: inferPhone(input.resumeText, input.existingProfile.phone),
    portfolioUrl,
    linkedinUrl:
      extractFirstUrl(input.resumeText, /https?:\/\/(?:www\.)?linkedin\.com\/[\w./?%&=+-]*/i) ??
      input.existingProfile.linkedinUrl,
    githubUrl: inferGithubUrl(input.resumeText) ?? input.existingProfile.githubUrl,
    personalWebsiteUrl,
    professionalSummary: inferProfessionalSummary(summary, headline, skillGroups.highlightedSkills),
    skillGroups,
    skills,
    targetRoles: inferTargetRoles(headline, input.existingProfile),
    preferredLocations: inferLocations(currentLocation, input.existingProfile, input.existingSearchPreferences),
    experiences: inferExperienceEntries(input.resumeText),
    education,
    certifications: [],
    links: inferLinks(input.resumeText),
    projects: [],
    spokenLanguages: inferSpokenLanguages(input.resumeText),
    analysisProviderKind,
    analysisProviderLabel,
    notes
  })
}

function mergeExperienceExtractionEntries(
  primary: readonly ResumeProfileExtraction['experiences'][number][],
  fallback: readonly ResumeProfileExtraction['experiences'][number][]
) {
  if (primary.length === 0) {
    return fallback
  }

  const fallbackByKey = new Map(fallback.map((entry) => [`${entry.title ?? ''}|${entry.startDate ?? ''}`, entry]))

  return primary.map((entry, index) => {
    const match = fallbackByKey.get(`${entry.title ?? ''}|${entry.startDate ?? ''}`) ?? fallback[index]

    return {
      ...entry,
      companyName: entry.companyName ?? match?.companyName ?? null,
      companyUrl: entry.companyUrl ?? match?.companyUrl ?? null,
      location: entry.location ?? match?.location ?? null,
      workMode: entry.workMode ?? match?.workMode ?? null,
      summary: entry.summary ?? match?.summary ?? null,
      achievements: entry.achievements.length > 0 ? entry.achievements : match?.achievements ?? [],
      skills: entry.skills.length > 0 ? entry.skills : match?.skills ?? [],
      domainTags: entry.domainTags.length > 0 ? entry.domainTags : match?.domainTags ?? []
    }
  })
}

function mergeEducationExtractionEntries(
  primary: readonly ResumeProfileExtraction['education'][number][],
  fallback: readonly ResumeProfileExtraction['education'][number][]
) {
  if (primary.length === 0) {
    return fallback
  }

  return primary.map((entry, index) => {
    const match = fallback[index]

    return {
      ...entry,
      schoolName: entry.schoolName ?? match?.schoolName ?? null,
      location: entry.location ?? match?.location ?? null,
      summary: entry.summary ?? match?.summary ?? null
    }
  })
}

function mergeLinkExtractionEntries(
  primary: readonly ResumeProfileExtraction['links'][number][],
  fallback: readonly ResumeProfileExtraction['links'][number][]
) {
  if (primary.length === 0) {
    return fallback
  }

  const fallbackByUrl = new Map(fallback.map((entry) => [entry.url ?? '', entry]))

  return primary.map((entry, index) => {
    const match = fallbackByUrl.get(entry.url ?? '') ?? fallback[index]

    return {
      ...entry,
      label: entry.label ?? match?.label ?? null,
      url: entry.url ?? match?.url ?? null,
      kind: entry.kind ?? match?.kind ?? null
    }
  })
}

function scoreExperienceEntries(entries: readonly ResumeProfileExtraction['experiences'][number][]): number {
  if (entries.length === 0) {
    return 0
  }

  const total = entries.reduce((score, entry) => {
    return (
      score +
      (entry.companyName ? 2 : 0) +
      (entry.title ? 1 : 0) +
      (entry.location ? 1 : 0) +
      (entry.summary ? 2 : 0) +
      Math.min(entry.achievements.length, 2) +
      Math.min(entry.skills.length, 2)
    )
  }, 0)

  return total / entries.length
}

function scoreEducationEntries(entries: readonly ResumeProfileExtraction['education'][number][]): number {
  if (entries.length === 0) {
    return 0
  }

  const total = entries.reduce((score, entry) => {
    return score + (entry.schoolName ? 2 : 0) + (entry.degree ? 1 : 0) + (entry.fieldOfStudy ? 1 : 0)
  }, 0)

  return total / entries.length
}

function choosePreferredHeadline(primary: string | null, fallback: string | null): string | null {
  if (!primary) {
    return fallback
  }

  if (primary.length > 60 || primary.includes('|')) {
    return fallback ?? primary
  }

  return primary
}

function completeResumeExtraction(
  primary: ResumeProfileExtraction,
  fallback: ResumeProfileExtraction
): ResumeProfileExtraction {
  const mergedExperiences = mergeExperienceExtractionEntries(primary.experiences, fallback.experiences)
  const mergedEducation = mergeEducationExtractionEntries(primary.education, fallback.education)
  const useFallbackExperiences = scoreExperienceEntries(primary.experiences) < scoreExperienceEntries(fallback.experiences)
  const useFallbackEducation = scoreEducationEntries(primary.education) < scoreEducationEntries(fallback.education)

  return ResumeProfileExtractionSchema.parse({
    ...primary,
    firstName: primary.firstName ?? fallback.firstName,
    lastName: primary.lastName ?? fallback.lastName,
    middleName: primary.middleName ?? fallback.middleName,
    fullName: primary.fullName ?? fallback.fullName,
    headline: choosePreferredHeadline(primary.headline, fallback.headline),
    summary: primary.summary ?? fallback.summary,
    currentLocation: primary.currentLocation ?? fallback.currentLocation,
    timeZone: primary.timeZone ?? fallback.timeZone,
    salaryCurrency: primary.salaryCurrency ?? fallback.salaryCurrency,
    yearsExperience: primary.yearsExperience ?? fallback.yearsExperience,
    email: primary.email ?? fallback.email,
    phone: primary.phone ?? fallback.phone,
    portfolioUrl: primary.portfolioUrl ?? fallback.portfolioUrl,
    linkedinUrl: primary.linkedinUrl ?? fallback.linkedinUrl,
    githubUrl: primary.githubUrl ?? fallback.githubUrl,
    personalWebsiteUrl: primary.personalWebsiteUrl ?? fallback.personalWebsiteUrl,
    professionalSummary: {
      shortValueProposition:
        primary.professionalSummary.shortValueProposition ?? fallback.professionalSummary.shortValueProposition,
      fullSummary: primary.professionalSummary.fullSummary ?? fallback.professionalSummary.fullSummary,
      careerThemes:
        primary.professionalSummary.careerThemes.length > 0
          ? primary.professionalSummary.careerThemes
          : fallback.professionalSummary.careerThemes,
      leadershipSummary: primary.professionalSummary.leadershipSummary ?? fallback.professionalSummary.leadershipSummary,
      domainFocusSummary: primary.professionalSummary.domainFocusSummary ?? fallback.professionalSummary.domainFocusSummary,
      strengths:
        primary.professionalSummary.strengths.length > 0
          ? primary.professionalSummary.strengths
          : fallback.professionalSummary.strengths
    },
    skillGroups: {
      coreSkills: primary.skillGroups.coreSkills.length > 0 ? primary.skillGroups.coreSkills : fallback.skillGroups.coreSkills,
      tools: primary.skillGroups.tools.length > 0 ? primary.skillGroups.tools : fallback.skillGroups.tools,
      languagesAndFrameworks:
        primary.skillGroups.languagesAndFrameworks.length > 0
          ? primary.skillGroups.languagesAndFrameworks
          : fallback.skillGroups.languagesAndFrameworks,
      softSkills: primary.skillGroups.softSkills.length > 0 ? primary.skillGroups.softSkills : fallback.skillGroups.softSkills,
      highlightedSkills:
        primary.skillGroups.highlightedSkills.length > 0
          ? primary.skillGroups.highlightedSkills
          : fallback.skillGroups.highlightedSkills
    },
    skills: uniqueStrings([...primary.skills, ...fallback.skills]),
    targetRoles: primary.targetRoles.length > 0 ? primary.targetRoles : fallback.targetRoles,
    preferredLocations: primary.preferredLocations.length > 0 ? primary.preferredLocations : fallback.preferredLocations,
    experiences: useFallbackExperiences ? fallback.experiences : mergedExperiences,
    education: useFallbackEducation ? fallback.education : mergedEducation,
    certifications: primary.certifications.length > 0 ? primary.certifications : fallback.certifications,
    links: mergeLinkExtractionEntries(primary.links, fallback.links),
    projects: primary.projects.length > 0 ? primary.projects : fallback.projects,
    spokenLanguages: primary.spokenLanguages.length > 0 ? primary.spokenLanguages : fallback.spokenLanguages,
    notes: uniqueStrings([...primary.notes, ...fallback.notes])
  })
}

function buildDeterministicResumeText(
  profile: CandidateProfile,
  job: JobPosting,
  summary: string,
  experienceHighlights: readonly string[],
  coreSkills: readonly string[],
  targetedKeywords: readonly string[]
): string {
  return [
    profile.fullName,
    profile.headline,
    [profile.currentLocation, profile.email, profile.phone].filter(Boolean).join(' | '),
    '',
    `Target Role: ${job.title} at ${job.company}`,
    '',
    'Summary',
    summary,
    '',
    'Experience Highlights',
    ...experienceHighlights.map((line) => `- ${line}`),
    '',
    'Core Skills',
    ...coreSkills.map((line) => `- ${line}`),
    '',
    'Targeted Keywords',
    ...targetedKeywords.map((line) => `- ${line}`)
  ]
    .filter(Boolean)
    .join('\n')
}

function isTextContentPart(value: unknown): value is { text: string } {
  return Boolean(value && typeof value === 'object' && 'text' in value && typeof value.text === 'string')
}

function extractContentString(rawContent: unknown): string {
  if (typeof rawContent === 'string') {
    return rawContent
  }

  if (Array.isArray(rawContent)) {
    return rawContent
      .flatMap((entry) => {
        if (typeof entry === 'string') {
          return [entry]
        }

        if (isTextContentPart(entry)) {
          return [entry.text]
        }

        return []
      })
      .join('\n')
  }

  return ''
}

function extractJsonString(rawContent: string): string {
  const fencedMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/i)

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const firstBraceIndex = rawContent.indexOf('{')
  const lastBraceIndex = rawContent.lastIndexOf('}')

  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    return rawContent.slice(firstBraceIndex, lastBraceIndex + 1)
  }

  return rawContent.trim()
}

async function parseModelJsonResponse(response: Response): Promise<unknown> {
  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown
      }
    }>
    error?: {
      message?: string
    }
  }

  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Model request failed with status ${response.status}.`)
  }

  const rawContent = extractContentString(payload.choices?.[0]?.message?.content)
  const jsonString = extractJsonString(rawContent)
  return JSON.parse(jsonString) as unknown
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return new URL('chat/completions', normalizedBaseUrl).toString()
}

function buildDeterministicStatus(detail: string): AgentProviderStatus {
  return AgentProviderStatusSchema.parse({
    kind: 'deterministic',
    ready: true,
    label: 'Built-in deterministic agent fallback',
    model: null,
    baseUrl: null,
    detail
  })
}

export function createDeterministicJobFinderAiClient(detail?: string): JobFinderAiClient {
  const status = buildDeterministicStatus(
    detail ??
      'Deterministic fallback is active. Set UNEMPLOYED_AI_API_KEY to use the configured OpenAI-compatible provider for resume extraction and tailoring.'
  )

  return {
    getStatus() {
      return status
    },
    extractProfileFromResume(input) {
      return Promise.resolve(buildDeterministicResumeProfileExtraction(input, 'deterministic', status.label))
    },
    tailorResume(input) {
      const coreSkills = uniqueStrings([...input.profile.skills.slice(0, 6), ...input.job.keySkills.slice(0, 6)]).slice(0, 8)
      const targetedKeywords = uniqueStrings(input.job.keySkills).slice(0, 6)
      const summary = `${input.profile.headline} aligned to ${input.job.title} at ${input.job.company}, emphasizing ${targetedKeywords.slice(0, 3).join(', ') || 'role alignment'} and ${input.job.workMode} delivery.`
      const experienceHighlights = uniqueStrings([
        `${input.profile.yearsExperience}+ years of experience aligned to ${input.job.summary.toLowerCase()}`,
        `Grounded in ${input.searchPreferences.tailoringMode} tailoring with saved preferences for ${input.searchPreferences.targetRoles.slice(0, 2).join(' and ') || input.job.title}.`,
        input.resumeText ? 'Tailoring references the stored base resume text and saved profile details.' : 'Tailoring references the saved structured profile because base resume text is not stored yet.'
      ]).slice(0, 3)
      const fullText = buildDeterministicResumeText(
        input.profile,
        input.job,
        summary,
        experienceHighlights,
        coreSkills,
        targetedKeywords
      )

      return Promise.resolve(TailoredResumeDraftSchema.parse({
        label: 'Tailored Resume',
        summary,
        experienceHighlights,
        coreSkills,
        targetedKeywords,
        fullText,
        compatibilityScore: clampScore(78 + Math.min(input.job.keySkills.length * 3, 18)),
        notes: ['Used the built-in deterministic resume tailorer.']
      }))
    },
    assessJobFit() {
      return Promise.resolve(null)
    }
  }
}

export function createOpenAiCompatibleJobFinderAiClient(
  options: OpenAiCompatibleJobFinderAiClientOptions
): JobFinderAiClient {
  const status = AgentProviderStatusSchema.parse({
    kind: 'openai_compatible',
    ready: true,
    label: options.label ?? 'AI resume agent',
    model: options.model,
    baseUrl: options.baseUrl,
    detail: 'The configured AI provider handles resume extraction and tailoring. Structured JSON outputs are validated locally before they affect Job Finder state.'
  })

  async function fetchModelJson(
    systemPrompt: string,
    userPayload: unknown
  ): Promise<unknown> {
    const response = await fetch(buildChatCompletionsUrl(options.baseUrl), {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: JSON.stringify(userPayload)
          }
        ]
      })
    })

    return parseModelJsonResponse(response)
  }

  return {
    getStatus() {
      return status
    },
    async extractProfileFromResume(input) {
      const payload = await fetchModelJson(
        [
          'You extract structured candidate details from resume text.',
          'Return JSON only.',
          'The resume text may come from PDF, DOCX, TXT, or Markdown extraction and can contain broken lines, repeated headings, metadata, or messy spacing.',
          'Normalize the output into a clean candidate profile.',
          'Use the resume text as the primary source of truth and only fall back to the provided existing profile when the resume does not contain the field.',
          'Do not invent employers, dates, locations, links, or achievements that are not grounded in the input.',
          'Prefer null instead of guessing for missing contact details.',
          'Keep summary focused on the professional bio, not contact metadata.',
          'Return a concise headline without dates or employment ranges.',
          'Split names into firstName, middleName, lastName when possible.',
          'Return preferredLocations as a clean list of likely target locations, not raw address metadata.',
          'If timezone is not explicitly written but location is clear, infer the most likely IANA timezone from the city, region, or country.',
          'If salary currency or regional defaults are not explicitly written but the resume location makes them obvious, infer the most likely value with high confidence.',
          'Return atomic list items only: one skill, one role, one school, one language, or one company per entry.',
          'Do not repeat exact duplicates across skills, grouped skills, links, languages, projects, or experience item arrays.',
          'Populate skillGroups with coreSkills, tools, languagesAndFrameworks, softSkills, and highlightedSkills instead of dumping everything into skills.',
          'Populate experiences, education, certifications, links, projects, and spokenLanguages as structured arrays with one record per item whenever the resume contains enough evidence.',
          'Use professionalSummary for narrative rollups such as shortValueProposition, fullSummary, careerThemes, and strengths.',
          'Return notes only when the extraction is uncertain, incomplete, or needs user review; otherwise return an empty array.'
        ].join(' '),
        {
          existingProfile: input.existingProfile,
          existingSearchPreferences: input.existingSearchPreferences,
          resumeText: input.resumeText
        }
      )
      const normalizedPayload = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
      const parsedPrimaryExtraction = ResumeProfileExtractionSchema.parse({
        ...normalizedPayload,
        analysisProviderKind: 'openai_compatible',
        analysisProviderLabel: status.label
      })
      const deterministicSupplement = buildDeterministicResumeProfileExtraction(
        input,
        'deterministic',
        'Built-in deterministic parser supplement'
      )

      return ResumeProfileExtractionSchema.parse({
        ...completeResumeExtraction(parsedPrimaryExtraction, deterministicSupplement),
        analysisProviderKind: 'openai_compatible',
        analysisProviderLabel: status.label
      })
    },
    async tailorResume(input) {
      const payload = await fetchModelJson(
        [
          'You tailor resumes for specific jobs.',
          'Return JSON only.',
          'Ground every section in the provided profile, resume text, and job posting.',
          'Do not invent employers, achievements, dates, or credentials.',
          'Write concise ATS-friendly content.'
        ].join(' '),
        input
      )
      return TailoredResumeDraftSchema.parse(payload)
    },
    async assessJobFit(input) {
      const payload = await fetchModelJson(
        [
          'You assess how well a job matches a candidate profile.',
          'Return JSON only.',
          'Use a 0-100 score, 1-3 reasons, and up to 3 gaps.',
          'Keep explanations specific to the provided profile and job.'
        ].join(' '),
        input
      )
      return JobFitAssessmentSchema.parse(payload)
    }
  }
}

export function createJobFinderAiClientFromEnvironment(env: StringMap = process.env): JobFinderAiClient {
  const apiKey = env.UNEMPLOYED_AI_API_KEY

  if (!apiKey) {
    return createDeterministicJobFinderAiClient()
  }

  const primaryClient = createOpenAiCompatibleJobFinderAiClient({
    apiKey,
    baseUrl: env.UNEMPLOYED_AI_BASE_URL ?? 'https://ai.automatedpros.link/v1',
    model: env.UNEMPLOYED_AI_MODEL ?? 'FelidaeAI-Pro-2.5',
    label: 'AI resume agent'
  })
  const fallbackClient = createDeterministicJobFinderAiClient(
    'The configured model is enabled, and deterministic fallbacks protect the app when a model call fails.'
  )

  return {
    getStatus() {
      return primaryClient.getStatus()
    },
    async extractProfileFromResume(input) {
      try {
        return await primaryClient.extractProfileFromResume(input)
      } catch {
        const fallback = await fallbackClient.extractProfileFromResume(input)
        return {
          ...fallback,
          notes: uniqueStrings([...fallback.notes, 'Fell back to the deterministic resume parser after the model call failed.'])
        }
      }
    },
    async tailorResume(input) {
      try {
        return await primaryClient.tailorResume(input)
      } catch {
        const fallback = await fallbackClient.tailorResume(input)
        return {
          ...fallback,
          notes: uniqueStrings([...fallback.notes, 'Fell back to the deterministic resume tailorer after the model call failed.'])
        }
      }
    },
    async assessJobFit(input) {
      try {
        return await primaryClient.assessJobFit(input)
      } catch {
        return fallbackClient.assessJobFit(input)
      }
    }
  }
}

export const aiProvidersPackageReady = true
