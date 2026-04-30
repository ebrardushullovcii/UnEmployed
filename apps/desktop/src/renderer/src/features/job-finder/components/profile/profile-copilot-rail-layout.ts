const COPILOT_PANEL_MAX_WIDTH = 480
const COPILOT_PANEL_OFFSET = 16
const COPILOT_COLLAPSED_WIDTH = 320
const COPILOT_COLLAPSED_HEIGHT = 80
export const COPILOT_NAV_SAFE_OFFSET = 112
export const COPILOT_CONTENT_SAFE_OFFSET = Math.max(COPILOT_NAV_SAFE_OFFSET, 160)

export function getCopilotPanelDimensions(minBottomOffset = COPILOT_PANEL_OFFSET) {
  if (typeof window === 'undefined') {
    return {
      expandedWidth: COPILOT_PANEL_MAX_WIDTH,
      expandedHeight: 672,
      collapsedWidth: COPILOT_COLLAPSED_WIDTH,
      collapsedHeight: COPILOT_COLLAPSED_HEIGHT,
    }
  }

  return {
    expandedWidth: Math.min(COPILOT_PANEL_MAX_WIDTH, Math.max(320, window.innerWidth - 32)),
    expandedHeight: Math.min(
      672,
      Math.max(320, window.innerHeight - COPILOT_NAV_SAFE_OFFSET - Math.max(minBottomOffset, COPILOT_PANEL_OFFSET)),
    ),
    collapsedWidth: Math.min(COPILOT_COLLAPSED_WIDTH, Math.max(220, window.innerWidth - 32)),
    collapsedHeight: COPILOT_COLLAPSED_HEIGHT,
  }
}

export function clampCopilotPosition(input: {
  x: number
  y: number
  isOpen: boolean
  minBottomOffset: number
}) {
  if (typeof window === 'undefined') {
    return {
      x: Math.max(COPILOT_PANEL_OFFSET, input.x),
      y: Math.max(input.minBottomOffset, input.y),
    }
  }

  const dimensions = getCopilotPanelDimensions(input.minBottomOffset)
  const width = input.isOpen ? dimensions.expandedWidth : dimensions.collapsedWidth
  const height = input.isOpen ? dimensions.expandedHeight : dimensions.collapsedHeight
  const maxX = Math.max(COPILOT_PANEL_OFFSET, window.innerWidth - width - COPILOT_PANEL_OFFSET)
  const maxY = Math.max(
    input.minBottomOffset,
    window.innerHeight - height - (input.isOpen ? COPILOT_NAV_SAFE_OFFSET : COPILOT_PANEL_OFFSET),
  )
  const minY = input.minBottomOffset

  return {
    x: Math.max(COPILOT_PANEL_OFFSET, Math.min(input.x, maxX)),
    y: Math.max(minY, Math.min(input.y, maxY)),
  }
}
