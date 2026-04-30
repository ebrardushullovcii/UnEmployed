import { describe, expect, it } from 'vitest'
import type { SetStateAction } from 'react'
import type { ActionState } from '@renderer/features/job-finder/lib/job-finder-types'
import { createActionRunners } from './use-job-finder-page-controller-actions'
import {
  type PendingActionState,
  jobFinderPendingActions,
} from './job-finder-pending-actions'

describe('createActionRunners', () => {
  it('keeps scoped pending state active until async success work finishes', async () => {
    let actionState: ActionState = { message: null }
    let pendingActionState: PendingActionState = {}
    const observedPendingStates: PendingActionState[] = []
    const scope = jobFinderPendingActions.profileMutation()
    const applyActionState = (next: SetStateAction<ActionState>) => {
      actionState = typeof next === 'function' ? next(actionState) : next
    }
    const applyPendingActionState = (
      next: SetStateAction<PendingActionState>,
    ) => {
      pendingActionState =
        typeof next === 'function' ? next(pendingActionState) : next
      observedPendingStates.push({ ...pendingActionState })
    }

    const { runAction } = createActionRunners({
      setActionState: applyActionState,
      setPendingActionState: applyPendingActionState,
    })

    await runAction(
      async () => {
        await Promise.resolve()
        return 'result'
      },
      async () => {
        await Promise.resolve()
        observedPendingStates.push({ ...pendingActionState })
      },
      'Saved',
      { scope },
    )

    expect(observedPendingStates).toEqual([
      { [scope]: 1 },
      { [scope]: 1 },
      {},
    ])
    expect(actionState.message).toBe('Saved')
  })
})
