export type JobFinderSaveSurface = 'profile' | 'settings' | 'resume' | 'answers'

export type JobFinderSaveState =
  | { state: 'idle'; version: 0 }
  | {
      state: 'saving' | 'saved' | 'failed'
      version: number
      attempt: number
      surface: JobFinderSaveSurface
      label: string
      message: string
      canRetry: boolean
      savedAt?: string
    }

export const initialJobFinderSaveState: JobFinderSaveState = {
  state: 'idle',
  version: 0
}

const SAVE_RECEIPT_STORAGE_KEY = 'unemployed.job-finder.save-receipt.v1'

export type JobFinderSaveReceipt = {
  schemaVersion: 1
  dedupeKey: string
  label: string
  message: string
  savedAt: string
  surface: JobFinderSaveSurface
  version: number
}

type SaveReceiptStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

function isSaveSurface(value: unknown): value is JobFinderSaveSurface {
  return value === 'profile' || value === 'settings' || value === 'resume' || value === 'answers'
}

export function loadJobFinderSaveReceipt(storage: SaveReceiptStorage): JobFinderSaveReceipt | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(SAVE_RECEIPT_STORAGE_KEY) ?? 'null')
    if (!value || typeof value !== 'object') {
      return null
    }

    const receipt = value as Record<string, unknown>
    if (
      receipt.schemaVersion !== 1 ||
      typeof receipt.dedupeKey !== 'string' ||
      typeof receipt.label !== 'string' ||
      typeof receipt.message !== 'string' ||
      typeof receipt.savedAt !== 'string' ||
      !isSaveSurface(receipt.surface) ||
      typeof receipt.version !== 'number' ||
      !Number.isInteger(receipt.version) ||
      receipt.version < 1
    ) {
      return null
    }

    return receipt as JobFinderSaveReceipt
  } catch {
    return null
  }
}

export function persistJobFinderSaveReceipt(storage: SaveReceiptStorage, receipt: JobFinderSaveReceipt | null): void {
  try {
    if (receipt) {
      storage.setItem(SAVE_RECEIPT_STORAGE_KEY, JSON.stringify(receipt))
    } else {
      storage.removeItem(SAVE_RECEIPT_STORAGE_KEY)
    }
  } catch {
    // Saving workspace data succeeded even when renderer receipt storage is unavailable.
  }
}

export function getJobFinderSaveStateFromReceipt(receipt: JobFinderSaveReceipt | null): JobFinderSaveState {
  return receipt
    ? {
        state: 'saved',
        version: receipt.version,
        attempt: 1,
        surface: receipt.surface,
        label: receipt.label,
        message: receipt.message,
        canRetry: false,
        savedAt: receipt.savedAt
      }
    : initialJobFinderSaveState
}
export type JobFinderSaveRequest<TResult> = {
  dedupeKey: string
  execute: () => Promise<TResult>
  failedMessage: (error: unknown) => string
  label: string
  savedMessage: string
  surface: JobFinderSaveSurface
}

export type JobFinderSaveResult<TResult> = { status: 'saved'; result: TResult } | { status: 'failed'; error: unknown }

export type JobFinderSaveCoordinator = {
  clearReceipt: () => void
  dismissSaved: () => void
  retry: () => Promise<JobFinderSaveResult<unknown> | null>
  run: <TResult>(request: JobFinderSaveRequest<TResult>) => Promise<JobFinderSaveResult<TResult>>
}

function hashSavePayload(value: string): string {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

export function createSaveDedupeKey(surface: JobFinderSaveSurface, payload: unknown): string {
  return `${surface}:${hashSavePayload(JSON.stringify(payload) ?? String(payload))}`
}

export function createJobFinderSaveCoordinator(input: {
  initialReceipt?: JobFinderSaveReceipt | null
  onReceiptChange?: (receipt: JobFinderSaveReceipt | null) => void
  onStateChange: (state: JobFinderSaveState) => void
}): JobFinderSaveCoordinator {
  let version = input.initialReceipt?.version ?? 0
  let attempt = 0
  let operationToken = 0
  let latestOperationToken = 0
  let latestDedupeKey: string | null = input.initialReceipt?.dedupeKey ?? null
  let retryRequest: JobFinderSaveRequest<unknown> | null = null
  let currentState = getJobFinderSaveStateFromReceipt(input.initialReceipt ?? null)
  const inFlight = new Map<string, Promise<JobFinderSaveResult<unknown>>>()
  const emitState = (state: JobFinderSaveState) => {
    currentState = state
    input.onStateChange(state)
  }

  const run = <TResult>(request: JobFinderSaveRequest<TResult>): Promise<JobFinderSaveResult<TResult>> => {
    const existing = inFlight.get(request.dedupeKey)
    if (existing) {
      return existing as Promise<JobFinderSaveResult<TResult>>
    }

    if (request.dedupeKey !== latestDedupeKey) {
      version += 1
      attempt = 1
      latestDedupeKey = request.dedupeKey
    } else {
      attempt += 1
    }
    operationToken += 1
    latestOperationToken = operationToken
    const currentOperationToken = operationToken
    const operationVersion = version
    const operationAttempt = attempt
    retryRequest = request as JobFinderSaveRequest<unknown>
    emitState({
      state: 'saving',
      version: operationVersion,
      attempt: operationAttempt,
      surface: request.surface,
      label: request.label,
      message: `Saving ${request.label.toLowerCase()}…`,
      canRetry: false
    })

    const operation = request
      .execute()
      .then((result): JobFinderSaveResult<TResult> => {
        if (currentOperationToken === latestOperationToken) {
          const savedAt = new Date().toISOString()
          retryRequest = null
          emitState({
            state: 'saved',
            version: operationVersion,
            attempt: operationAttempt,
            surface: request.surface,
            label: request.label,
            message: request.savedMessage,
            canRetry: false,
            savedAt
          })
          input.onReceiptChange?.({
            schemaVersion: 1,
            dedupeKey: request.dedupeKey,
            label: request.label,
            message: request.savedMessage,
            savedAt,
            surface: request.surface,
            version: operationVersion
          })
        }

        return { status: 'saved', result }
      })
      .catch((error: unknown): JobFinderSaveResult<TResult> => {
        if (currentOperationToken === latestOperationToken) {
          emitState({
            state: 'failed',
            version: operationVersion,
            attempt: operationAttempt,
            surface: request.surface,
            label: request.label,
            message: request.failedMessage(error),
            canRetry: true
          })
        }

        return { status: 'failed', error }
      })
      .finally(() => {
        if (inFlight.get(request.dedupeKey) === operation) {
          inFlight.delete(request.dedupeKey)
        }
      })

    inFlight.set(request.dedupeKey, operation as Promise<JobFinderSaveResult<unknown>>)
    return operation
  }

  return {
    clearReceipt: () => {
      operationToken += 1
      latestOperationToken = operationToken
      version = 0
      attempt = 0
      latestDedupeKey = null
      retryRequest = null
      inFlight.clear()
      input.onReceiptChange?.(null)
      emitState(initialJobFinderSaveState)
    },
    dismissSaved: () => {
      if (currentState.state !== 'saved') {
        return
      }
      retryRequest = null
      input.onReceiptChange?.(null)
      emitState(initialJobFinderSaveState)
    },
    retry: () => (retryRequest ? run(retryRequest) : Promise.resolve(null)),
    run
  }
}
