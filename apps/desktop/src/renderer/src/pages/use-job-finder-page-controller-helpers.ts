import { useEffect, useState } from 'react'
import type { JobFinderWorkspaceSnapshot } from '@unemployed/contracts'

type SelectedState = string | null

export function useResettableSelection(initialValue: SelectedState) {
  const [value, setValue] = useState<SelectedState>(initialValue)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  return [value, setValue] as const
}

export function getActiveResumeWorkspaceJobId(pathname: string): string | null {
  const match = pathname.match(/\/job-finder\/review-queue\/([^/]+)\/resume$/)
  return match?.[1] ?? null
}

export function isProfileSetupPath(pathname: string): boolean {
  return pathname === '/job-finder/profile/setup'
}

export function getLatestApplicationAttempt(
  workspace: JobFinderWorkspaceSnapshot,
  selectedApplicationRecordId: string | null,
) {
  const selectedApplicationRecord =
    workspace.applicationRecords.find(
      (record) => record.id === selectedApplicationRecordId,
    ) ??
    workspace.applicationRecords[0] ??
    null

  const selectedApplicationAttempt = selectedApplicationRecord
    ? ([...workspace.applicationAttempts]
        .filter((attempt) => attempt.jobId === selectedApplicationRecord.jobId)
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime(),
        )[0] ?? null)
    : null

  return {
    selectedApplicationAttempt,
    selectedApplicationRecord,
  }
}
