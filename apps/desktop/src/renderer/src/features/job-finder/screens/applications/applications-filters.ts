export const APPLICATION_FILTERS = ['all', 'needs_action', 'in_progress', 'submitted', 'manual_only'] as const

export type ApplicationsViewFilter = typeof APPLICATION_FILTERS[number]

export const APPLICATION_FILTER_LABELS: Record<ApplicationsViewFilter, string> = {
  all: 'All',
  needs_action: 'Needs action',
  in_progress: 'In progress',
  submitted: 'Submitted',
  manual_only: 'Manual only'
}