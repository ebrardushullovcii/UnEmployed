const COPILOT_PANEL_MAX_WIDTH = 480;
const COPILOT_PANEL_OFFSET = 16;
const COPILOT_COLLAPSED_WIDTH = 48;
const COPILOT_COLLAPSED_HEIGHT = 48;
const COPILOT_SUGGESTION_STACK_GAP = 12;
const COPILOT_SUGGESTION_PILL_HEIGHT = 44;
export const COPILOT_BOTTOM_OFFSET = 16;
export const COPILOT_NAV_SAFE_OFFSET = 112;
export const COPILOT_LAUNCHER_MIN_INTERACTIVE_GAP = 24;
export const COPILOT_POSITION_STORAGE_KEY =
  "unemployed.profile-copilot-position-v7";

function getCopilotShellSafeTopOffset(): number {
  return 240;
}

export interface CopilotPosition {
  x: number;
  y: number;
}

export interface CopilotRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface CopilotViewport {
  height: number;
  width: number;
}

export function getCollapsedLauncherStackSize(input: {
  showSuggestionPill: boolean;
}): { height: number; width: number } {
  return {
    height:
      COPILOT_COLLAPSED_HEIGHT +
      (input.showSuggestionPill
        ? COPILOT_SUGGESTION_STACK_GAP + COPILOT_SUGGESTION_PILL_HEIGHT
        : 0),
    width: COPILOT_COLLAPSED_WIDTH,
  };
}

export function getCollapsedLauncherClearance(input: {
  launcherHeight: number;
  launcherWidth: number;
  minTopOffset: number;
  targets: readonly CopilotRect[];
  viewportHeight: number;
  viewportWidth: number;
}): number {
  const launcherHeight = Math.max(0, input.launcherHeight);
  const columnRight = input.viewportWidth - COPILOT_PANEL_OFFSET;
  const columnLeft = columnRight - Math.max(0, input.launcherWidth);
  const dockedStackTop =
    input.viewportHeight - COPILOT_BOTTOM_OFFSET - launcherHeight;
  const dockedStackBottom = input.viewportHeight - COPILOT_BOTTOM_OFFSET;
  const maxClearance = Math.max(
    COPILOT_BOTTOM_OFFSET,
    input.viewportHeight - launcherHeight - Math.max(0, input.minTopOffset),
  );
  let clearance = COPILOT_BOTTOM_OFFSET;

  for (const target of input.targets) {
    const intersectsLauncherColumn =
      target.right > columnLeft && target.left < columnRight;

    if (!intersectsLauncherColumn) {
      continue;
    }

    if (target.bottom <= dockedStackTop || target.top >= dockedStackBottom) {
      continue;
    }

    const needed =
      input.viewportHeight - target.top + COPILOT_LAUNCHER_MIN_INTERACTIVE_GAP;

    clearance = Math.max(clearance, Math.min(needed, maxClearance));
  }

  return Math.ceil(clearance);
}

export interface PersistedCopilotPosition extends CopilotPosition {
  viewportHeight?: number;
  viewportWidth?: number;
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
    x:
      typeof window === "undefined"
        ? COPILOT_PANEL_OFFSET
        : Math.max(
            COPILOT_PANEL_OFFSET,
            window.innerWidth - COPILOT_COLLAPSED_WIDTH - COPILOT_PANEL_OFFSET,
          ),
    y: defaultY,
  };
}

export function parseCopilotPosition(
  value: string | null,
): PersistedCopilotPosition | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<PersistedCopilotPosition>;

    if (
      typeof parsed.x !== "number" ||
      !Number.isFinite(parsed.x) ||
      typeof parsed.y !== "number" ||
      !Number.isFinite(parsed.y)
    ) {
      return null;
    }

    const viewportWidth =
      typeof parsed.viewportWidth === "number" &&
      Number.isFinite(parsed.viewportWidth) &&
      parsed.viewportWidth > 0
        ? parsed.viewportWidth
        : undefined;
    const viewportHeight =
      typeof parsed.viewportHeight === "number" &&
      Number.isFinite(parsed.viewportHeight) &&
      parsed.viewportHeight > 0
        ? parsed.viewportHeight
        : undefined;

    return {
      x: parsed.x,
      y: parsed.y,
      ...(viewportWidth !== undefined && viewportHeight !== undefined
        ? { viewportHeight, viewportWidth }
        : {}),
    };
  } catch {
    return null;
  }
}

function getCopilotPositionBounds(input: {
  isOpen: boolean;
  minBottomOffset: number;
  minTopOffset: number;
  viewport: CopilotViewport;
}) {
  const collapsedWidth = Math.min(
    COPILOT_COLLAPSED_WIDTH,
    Math.max(COPILOT_COLLAPSED_WIDTH, input.viewport.width - 32),
  );
  const expandedWidth = Math.min(
    COPILOT_PANEL_MAX_WIDTH,
    Math.max(320, input.viewport.width - 32),
  );
  const expandedHeight = Math.min(
    672,
    Math.max(
      320,
      input.viewport.height - input.minTopOffset - COPILOT_PANEL_OFFSET,
    ),
  );
  const width = input.isOpen ? expandedWidth : collapsedWidth;
  const height = input.isOpen ? expandedHeight : COPILOT_COLLAPSED_HEIGHT;

  return {
    maxX: Math.max(
      COPILOT_PANEL_OFFSET,
      input.viewport.width - width - COPILOT_PANEL_OFFSET,
    ),
    maxY: Math.max(
      input.minTopOffset,
      input.viewport.height -
        height -
        Math.max(input.minBottomOffset, COPILOT_PANEL_OFFSET),
    ),
    minX: COPILOT_PANEL_OFFSET,
    minY: input.minTopOffset,
  };
}

export function resizeCopilotPosition(input: {
  isOpen: boolean;
  minBottomOffset: number;
  minTopOffset: number;
  nextViewport: CopilotViewport;
  position: CopilotPosition;
  previousViewport: CopilotViewport;
}): CopilotPosition {
  const previousBounds = getCopilotPositionBounds({
    isOpen: input.isOpen,
    minBottomOffset: input.minBottomOffset,
    minTopOffset: input.minTopOffset,
    viewport: input.previousViewport,
  });
  const nextBounds = getCopilotPositionBounds({
    isOpen: input.isOpen,
    minBottomOffset: input.minBottomOffset,
    minTopOffset: input.minTopOffset,
    viewport: input.nextViewport,
  });
  const leftOffset = Math.max(0, input.position.x - previousBounds.minX);
  const rightOffset = Math.max(0, previousBounds.maxX - input.position.x);
  const topOffset = Math.max(0, input.position.y - previousBounds.minY);
  const bottomOffset = Math.max(0, previousBounds.maxY - input.position.y);
  const x =
    rightOffset < leftOffset
      ? nextBounds.maxX - rightOffset
      : nextBounds.minX + leftOffset;
  const y =
    bottomOffset < topOffset
      ? nextBounds.maxY - bottomOffset
      : nextBounds.minY + topOffset;

  return {
    x: Math.max(nextBounds.minX, Math.min(x, nextBounds.maxX)),
    y: Math.max(nextBounds.minY, Math.min(y, nextBounds.maxY)),
  };
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
      Math.max(COPILOT_COLLAPSED_WIDTH, window.innerWidth - 32),
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
