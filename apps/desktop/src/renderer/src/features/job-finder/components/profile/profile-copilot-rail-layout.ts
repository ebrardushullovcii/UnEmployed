const COPILOT_PANEL_MAX_WIDTH = 480
const COPILOT_PANEL_OFFSET = 16
const COPILOT_COLLAPSED_WIDTH = 320
const COPILOT_COLLAPSED_HEIGHT = 80
const COPILOT_STACK_GAP = 12
export const COPILOT_BOTTOM_OFFSET = 20
export const COPILOT_NAV_SAFE_OFFSET = 112
export const COPILOT_POSITION_STORAGE_KEY = 'unemployed.profile-copilot-position'

export interface CopilotPosition {
  x: number
  y: number
}

export function parseCopilotPosition(value: string | null): CopilotPosition | null {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as Partial<CopilotPosition>

    if (
      typeof parsed.x !== 'number' ||
      !Number.isFinite(parsed.x) ||
      typeof parsed.y !== 'number' ||
      !Number.isFinite(parsed.y)
    ) {
      return null
    }

    return { x: parsed.x, y: parsed.y }
  } catch {
    return null
  }
}

export function getDraggedCopilotPosition(input: {
  clientX: number
  clientY: number
  originX: number
  originY: number
  startX: number
  startY: number
}): { moved: boolean; position: CopilotPosition } {
  const deltaX = input.originX - input.clientX
  const deltaY = input.originY - input.clientY

  return {
    moved: Math.abs(deltaX) + Math.abs(deltaY) >= 6,
    position: {
      x: input.startX + deltaX,
      y: input.startY + deltaY,
    },
  }
}

export function getCopilotPanelDimensions(minBottomOffset = COPILOT_PANEL_OFFSET) {
  if (typeof window === 'undefined') {
    return {
      expandedWidth: COPILOT_PANEL_MAX_WIDTH,
      expandedHeight: 580,
      collapsedWidth: COPILOT_COLLAPSED_WIDTH,
      collapsedHeight: COPILOT_COLLAPSED_HEIGHT,
      stackGap: COPILOT_STACK_GAP,
    }
  }

  return {
    expandedWidth: Math.min(COPILOT_PANEL_MAX_WIDTH, Math.max(320, window.innerWidth - 32)),
    expandedHeight: Math.min(
      672,
      Math.max(
        320,
        window.innerHeight -
          COPILOT_NAV_SAFE_OFFSET -
          Math.max(minBottomOffset, COPILOT_PANEL_OFFSET) -
          COPILOT_COLLAPSED_HEIGHT -
          COPILOT_STACK_GAP,
      ),
    ),
    collapsedWidth: Math.min(COPILOT_COLLAPSED_WIDTH, Math.max(220, window.innerWidth - 32)),
    collapsedHeight: COPILOT_COLLAPSED_HEIGHT,
    stackGap: COPILOT_STACK_GAP,
  }
}

export function clampCopilotPosition(input: {
  x: number
  y: number
  isOpen: boolean
  minBottomOffset: number
  containerMinBottomOffset?: number
}) {
  const activeMinBottomOffset = input.isOpen
    ? input.minBottomOffset
    : input.containerMinBottomOffset ?? input.minBottomOffset

  if (typeof window === 'undefined') {
    return {
      x: Math.max(COPILOT_PANEL_OFFSET, input.x),
      y: Math.max(activeMinBottomOffset, input.y),
    }
  }

  const dimensions = getCopilotPanelDimensions(input.minBottomOffset)
  const width = input.isOpen ? dimensions.expandedWidth : dimensions.collapsedWidth
  const height = input.isOpen
    ? dimensions.expandedHeight + dimensions.collapsedHeight + dimensions.stackGap
    : dimensions.collapsedHeight
  const maxX = Math.max(COPILOT_PANEL_OFFSET, window.innerWidth - width - COPILOT_PANEL_OFFSET)
  const maxY = Math.max(
    activeMinBottomOffset,
    window.innerHeight - height - (input.isOpen ? COPILOT_NAV_SAFE_OFFSET : COPILOT_PANEL_OFFSET),
  )
  const minY = activeMinBottomOffset

  return {
    x: Math.max(COPILOT_PANEL_OFFSET, Math.min(input.x, maxX)),
    y: Math.max(minY, Math.min(input.y, maxY)),
  }
}
