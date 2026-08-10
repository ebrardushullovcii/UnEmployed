const COPILOT_PANEL_MAX_WIDTH = 480;
const COPILOT_PANEL_OFFSET = 16;
const COPILOT_COLLAPSED_WIDTH = 320;
const COPILOT_COLLAPSED_HEIGHT = 64;
export const COPILOT_BOTTOM_OFFSET = 16;
export const COPILOT_NAV_SAFE_OFFSET = 112;
export const COPILOT_POSITION_STORAGE_KEY =
  "unemployed.profile-copilot-position-v6";

function getCopilotShellSafeTopOffset(): number {
  return 240;
}

export interface CopilotPosition {
  x: number;
  y: number;
}

export function getDefaultCopilotPosition(
  minBottomOffset = COPILOT_BOTTOM_OFFSET,
): CopilotPosition {
  const defaultY =
    typeof window === "undefined"
      ? getCopilotShellSafeTopOffset()
      : Math.max(
          getCopilotShellSafeTopOffset(),
          window.innerHeight -
            COPILOT_COLLAPSED_HEIGHT -
            Math.max(minBottomOffset, COPILOT_PANEL_OFFSET),
        );

  return {
    x: COPILOT_PANEL_OFFSET,
    y: defaultY,
  };
}

export function parseCopilotPosition(
  value: string | null,
): CopilotPosition | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<CopilotPosition>;

    if (
      typeof parsed.x !== "number" ||
      !Number.isFinite(parsed.x) ||
      typeof parsed.y !== "number" ||
      !Number.isFinite(parsed.y)
    ) {
      return null;
    }

    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

export function getDraggedCopilotPosition(input: {
  clientX: number;
  clientY: number;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
}): { moved: boolean; position: CopilotPosition } {
  const deltaX = input.clientX - input.originX;
  const deltaY = input.clientY - input.originY;

  return {
    moved: Math.abs(deltaX) + Math.abs(deltaY) >= 6,
    position: {
      x: input.startX + deltaX,
      y: input.startY + deltaY,
    },
  };
}

export function getCopilotPanelDimensions(
  minTopOffset = getCopilotShellSafeTopOffset(),
) {
  if (typeof window === "undefined") {
    return {
      expandedWidth: COPILOT_PANEL_MAX_WIDTH,
      expandedHeight: 580,
      collapsedWidth: COPILOT_COLLAPSED_WIDTH,
      collapsedHeight: COPILOT_COLLAPSED_HEIGHT,
    };
  }

  return {
    expandedWidth: Math.min(
      COPILOT_PANEL_MAX_WIDTH,
      Math.max(320, window.innerWidth - 32),
    ),
    expandedHeight: Math.min(
      672,
      Math.max(320, window.innerHeight - minTopOffset - COPILOT_PANEL_OFFSET),
    ),
    collapsedWidth: Math.min(
      COPILOT_COLLAPSED_WIDTH,
      Math.max(220, window.innerWidth - 32),
    ),
    collapsedHeight: COPILOT_COLLAPSED_HEIGHT,
  };
}

export function clampCopilotPosition(input: {
  x: number;
  y: number;
  isOpen: boolean;
  minBottomOffset: number;
  containerMinBottomOffset?: number;
  minTopOffset?: number;
}) {
  if (typeof window === "undefined") {
    return {
      x: Math.max(COPILOT_PANEL_OFFSET, input.x),
      y: Math.max(
        input.minTopOffset ?? getCopilotShellSafeTopOffset(),
        input.y,
      ),
    };
  }

  const minY = input.minTopOffset ?? getCopilotShellSafeTopOffset();
  const dimensions = getCopilotPanelDimensions(minY);
  const width = input.isOpen
    ? dimensions.expandedWidth
    : dimensions.collapsedWidth;
  const height = input.isOpen
    ? dimensions.expandedHeight
    : dimensions.collapsedHeight;
  const maxX = Math.max(
    COPILOT_PANEL_OFFSET,
    window.innerWidth - width - COPILOT_PANEL_OFFSET,
  );
  const maxY = Math.max(
    minY,
    window.innerHeight -
      height -
      Math.max(input.minBottomOffset, COPILOT_PANEL_OFFSET),
  );

  return {
    x: Math.max(COPILOT_PANEL_OFFSET, Math.min(input.x, maxX)),
    y: Math.max(minY, Math.min(input.y, maxY)),
  };
}
