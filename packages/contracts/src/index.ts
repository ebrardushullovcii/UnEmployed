import { z } from 'zod'

export const suiteModules = ['job-finder', 'interview-helper'] as const
export type SuiteModule = (typeof suiteModules)[number]

export const applicationStatusValues = [
  'discovered',
  'shortlisted',
  'drafting',
  'ready_for_review',
  'approved',
  'submitted',
  'assessment',
  'interview',
  'rejected',
  'offer',
  'withdrawn',
  'archived'
] as const

export const ApplicationStatusSchema = z.enum(applicationStatusValues)
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>

export const CandidateProfileSchema = z.object({
  id: z.string().min(1),
  headline: z.string().min(1),
  targetRoles: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([])
})
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>

export const DesktopPlatformPingSchema = z.object({
  ok: z.literal(true),
  platform: z.enum(['darwin', 'win32', 'linux'])
})
export type DesktopPlatformPing = z.infer<typeof DesktopPlatformPingSchema>

