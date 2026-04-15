import type { JobPosting, JobSearchPreferences } from '@unemployed/contracts'
import type { CatalogSessionAgentDiscoveryOptions } from './session-agent'
import { matchesAnyPhrase, normalizeText, parseSalaryFloor } from './shared'

export function buildDiscoveryQuerySummary(searchPreferences: JobSearchPreferences): string {
  const roles = searchPreferences.targetRoles.join(', ') || 'all roles'
  const locations = searchPreferences.locations.join(', ') || 'all locations'
  const workModes = searchPreferences.workModes.join(', ') || 'all work modes'

  return `${roles} | ${locations} | ${workModes}`
}

export function filterCatalogDiscoveryJobs(
  jobs: readonly JobPosting[],
  searchPreferences: JobSearchPreferences,
): JobPosting[] {
  return jobs.filter((job) => {
    if (job.applyPath !== 'easy_apply' || !job.easyApplyEligible) {
      return false
    }

    if (
      searchPreferences.companyBlacklist.some(
        (company) => normalizeText(company) === normalizeText(job.company),
      )
    ) {
      return false
    }

    const matchesRole = matchesAnyPhrase(job.title, searchPreferences.targetRoles)
    const matchesLocation = matchesAnyPhrase(job.location, searchPreferences.locations)
    const matchesWorkMode =
      searchPreferences.workModes.length === 0 ||
      searchPreferences.workModes.includes('flexible') ||
      job.workMode.some((mode) => searchPreferences.workModes.includes(mode))
    const salaryFloor = parseSalaryFloor(job.salaryText)
    const meetsSalaryExpectation =
      searchPreferences.minimumSalaryUsd === null ||
      salaryFloor === null ||
      salaryFloor >= searchPreferences.minimumSalaryUsd

    return matchesRole && matchesLocation && matchesWorkMode && meetsSalaryExpectation
  })
}

export function filterCatalogAgentDiscoveryJobs(
  jobs: readonly JobPosting[],
  options: CatalogSessionAgentDiscoveryOptions,
): JobPosting[] {
  return jobs
    .filter((job) => {
      const matchesRole = matchesAnyPhrase(job.title, options.searchPreferences.targetRoles)
      const matchesLocation = matchesAnyPhrase(job.location, options.searchPreferences.locations)
      return matchesRole && matchesLocation
    })
    .slice(0, options.targetJobCount)
}
