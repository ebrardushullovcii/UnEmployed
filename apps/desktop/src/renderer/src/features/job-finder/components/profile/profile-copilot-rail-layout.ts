const COPILOT_PANEL_MAX_WIDTH = 360;
const COPILOT_PANEL_MAX_HEIGHT = 460;
const COPILOT_PANEL_OFFSET = 16;
export const COPILOT_MOBILE_BREAKPOINT = 640;
export const COPILOT_MOBILE_SIDE_INSET = 12;
const COPILOT_COLLAPSED_WIDTH = 48;
const COPILOT_COLLAPSED_HEIGHT = 48;
const COPILOT_SUGGESTION_STACK_GAP = 12;
const COPILOT_SUGGESTION_PILL_HEIGHT = 44;
export const COPILOT_BOTTOM_OFFSET = 16;
export const COPILOT_NAV_SAFE_OFFSET = 112;
export const COPILOT_LAUNCHER_MIN_INTERACTIVE_GAP = 24;
export const COPILOT_POSITION_STORAGE_KEY =
  "unemployed.profile-copilot-position-v7";

const COPILOT_INTERACTIVE_TOP_GAP = 16;

export function getCopilotViewportInset(viewportWidth: number): number {
  return viewportWidth < COPILOT_MOBILE_BREAKPOINT
    ? COPILOT_MOBILE_SIDE_INSET
    : COPILOT_PANEL_OFFSET;
}

export interface CopilotPanelSizeLimits {
  maxHeight: number;
  maxWidth: number;
}

/**
 * Narrowest the open panel may become while still reading as a conversation.
 * Below this it is squeezed rather than usable, so the panel keeps its normal
 * width and floats instead.
 */
export const COPILOT_PANEL_MIN_WIDTH = 288;

/** Breathing room between the edited column and the panel beside it. */
export const COPILOT_CONTENT_COLUMN_GAP = 16;

/**
 * How wide the open panel may be without landing on the fields it is talking
 * about.
 *
 * The panel floats on the right while the profile's field column runs
 * underneath it, so it sliced the last-name field in half and hid the
 * headline field entirely. When the space beside the column can hold a usable
 * panel, the panel is sized to that space and its right-hand dock keeps it
 * clear of every field. When it cannot, the panel keeps its normal width: a
 * 120px sliver would hide the conversation instead of the form.
 */
export function getCopilotOpenPanelMaxWidth(input: {
  contentColumnRight: number | null;
  maxWidth: number;
  viewportWidth: number;
}): number {
  const columnRight = input.contentColumnRight;
  if (
    columnRight === null ||
    !Number.isFinite(columnRight) ||
    columnRight <= 0 ||
    !Number.isFinite(input.viewportWidth) ||
    input.viewportWidth <= 0
  ) {
    return input.maxWidth;
  }

  const freeWidth = Math.floor(
    input.viewportWidth -
      getCopilotViewportInset(input.viewportWidth) -
      COPILOT_CONTENT_COLUMN_GAP -
      columnRight,
  );

  if (freeWidth >= input.maxWidth) {
    return input.maxWidth;
  }

  return freeWidth >= COPILOT_PANEL_MIN_WIDTH ? freeWidth : input.maxWidth;
}

/**
 * How much width the edited column must give up so the open panel can dock
 * beside it instead of on top of it.
 *
 * {@link getCopilotOpenPanelMaxWidth} shrinks the panel into whatever space is
 * already free, and when that space cannot hold a readable conversation it
 * gives up and lets the panel float over the form — which is exactly the case
 * the panel finding reported: "the 'Kim' last-name field is sliced in half and
 * the HEADLINE field is hidden entirely". Sizing alone cannot fix that; the
 * layout has to reserve the room. This returns the reservation in pixels: 0
 * whenever the panel is closed, the window is a phone-width sheet, or the
 * space beside the column is already enough.
 */
export function getCopilotReservedColumnWidth(input: {
  contentColumnRight: number | null;
  isOpen: boolean;
  maxWidth: number;
  viewportWidth: number;
}): number {
  if (
    !input.isOpen ||
    !Number.isFinite(input.viewportWidth) ||
    input.viewportWidth < COPILOT_MOBILE_BREAKPOINT
  ) {
    return 0;
  }

  const columnRight = input.contentColumnRight;
  if (
    columnRight === null ||
    !Number.isFinite(columnRight) ||
    columnRight <= 0
  ) {
    return 0;
  }

  const freeWidth = Math.floor(
    input.viewportWidth -
      getCopilotViewportInset(input.viewportWidth) -
      COPILOT_CONTENT_COLUMN_GAP -
      columnRight,
  );
  const wantedWidth = Math.max(
    COPILOT_PANEL_MIN_WIDTH,
    Math.min(input.maxWidth, COPILOT_PANEL_MIN_WIDTH),
  );

  if (freeWidth >= wantedWidth) {
    return 0;
  }

  // Never reserve more than the column can spare: on a genuinely tiny window
  // the panel is a sheet and this returns 0 above, but a mid-width window must
  // still be left with a usable form.
  const reservation = wantedWidth - Math.max(0, freeWidth);
  return Math.max(0, Math.min(reservation, Math.floor(columnRight / 2)));
}

function resolveCopilotPanelSizeLimits(
  panelSizeLimits?: CopilotPanelSizeLimits,
): CopilotPanelSizeLimits {
  return {
    maxHeight: panelSizeLimits?.maxHeight ?? COPILOT_PANEL_MAX_HEIGHT,
    maxWidth: panelSizeLimits?.maxWidth ?? COPILOT_PANEL_MAX_WIDTH,
  };
}

function getCopilotShellSafeTopOffset(): number {
  return 240;
}

export function getProfileCopilotSafeTopOffset(input: {
  profileTabsBottom: number | undefined;
  shellHeaderBottom: number;
}): number {
  const profileTabsBottom = Number.isFinite(input.profileTabsBottom)
    ? (input.profileTabsBottom ?? 0)
    : 0;
  const shellHeaderBottom = Number.isFinite(input.shellHeaderBottom)
    ? input.shellHeaderBottom
    : 0;

  return Math.max(
    COPILOT_NAV_SAFE_OFFSET,
    Math.ceil(
      Math.max(shellHeaderBottom, profileTabsBottom) +
        COPILOT_INTERACTIVE_TOP_GAP,
    ),
  );
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
  const viewportInset = getCopilotViewportInset(input.viewportWidth);
  const columnRight = input.viewportWidth - viewportInset;
  const columnLeft = columnRight - Math.max(0, input.launcherWidth);
  const maxClearance = Math.max(
    COPILOT_BOTTOM_OFFSET,
    input.viewportHeight - launcherHeight - Math.max(0, input.minTopOffset),
  );
  let clearance = COPILOT_BOTTOM_OFFSET;

  const targets = input.targets.filter(
    (target) =>
      Number.isFinite(target.left) &&
      Number.isFinite(target.right) &&
      Number.isFinite(target.top) &&
      Number.isFinite(target.bottom) &&
      target.bottom > 0 &&
      target.top < input.viewportHeight &&
      target.right > columnLeft &&
      target.left < columnRight,
  );

  // Start at the bottom-right dock and repeatedly lift the whole interactive
  // stack above any measured workspace target it would cover. Rechecking all
  // targets after every lift is important when two workspace targets overlap.
  for (let pass = 0; pass <= targets.length; pass += 1) {
    const launcherBottom = input.viewportHeight - clearance;
    const launcherTop = launcherBottom - launcherHeight;
    const overlappingTarget = targets.find(
      (target) =>
        target.bottom + COPILOT_LAUNCHER_MIN_INTERACTIVE_GAP > launcherTop &&
        target.top - COPILOT_LAUNCHER_MIN_INTERACTIVE_GAP < launcherBottom,
    );

    if (!overlappingTarget) {
      break;
    }

    const needed =
      input.viewportHeight -
      overlappingTarget.top +
      COPILOT_LAUNCHER_MIN_INTERACTIVE_GAP;
    const nextClearance = Math.min(needed, maxClearance);

    if (nextClearance <= clearance) {
      break;
    }

    clearance = nextClearance;
  }

  return Math.ceil(clearance);
}

/** What currently owns keyboard focus, from the launcher's point of view. */
export type CopilotFocusKind = "none" | "copilot" | "form_field" | "other";

export const COPILOT_LAUNCHER_SELECTOR = "[data-profile-copilot-launcher]";

/**
 * Classify the focused element so the collapsed launcher can step out of the
 * way of the field a user is typing in. The floating pill otherwise sits on
 * top of the text they just typed on narrow content columns.
 */
export function classifyCopilotFocusTarget(
  element: Element | null | undefined,
): CopilotFocusKind {
  if (!element || element.tagName === "BODY" || element.tagName === "HTML") {
    return "none";
  }

  if (
    typeof element.closest === "function" &&
    element.closest(
      `[data-profile-copilot-panel], ${COPILOT_LAUNCHER_SELECTOR}`,
    )
  ) {
    return "copilot";
  }

  const isEditableHost =
    element instanceof HTMLElement && element.isContentEditable;

  if (
    isEditableHost ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT" ||
    element.tagName === "INPUT"
  ) {
    return "form_field";
  }

  return "other";
}

/**
 * True while the collapsed launcher should yield the pixels it occupies to the
 * field being edited. It stays mounted and keyboard-reachable: focusing it
 * brings it straight back.
 */
export function shouldYieldCollapsedLauncher(input: {
  focusKind: CopilotFocusKind;
  isOpen: boolean;
  isPendingHere: boolean;
}): boolean {
  if (input.isOpen || input.isPendingHere) {
    return false;
  }

  return input.focusKind === "form_field";
}

export interface PersistedCopilotPosition extends CopilotPosition {
  viewportHeight?: number;
  viewportWidth?: number;
}

export function getDefaultCopilotPosition(
  minBottomOffset = COPILOT_BOTTOM_OFFSET,
): CopilotPosition {
  const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth;
  const viewportInset =
    typeof window === "undefined"
      ? COPILOT_PANEL_OFFSET
      : getCopilotViewportInset(viewportWidth);
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
            viewportInset,
            viewportWidth - COPILOT_COLLAPSED_WIDTH - viewportInset,
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
  panelSizeLimits?: CopilotPanelSizeLimits;
  viewport: CopilotViewport;
}) {
  const panelSizeLimits = resolveCopilotPanelSizeLimits(input.panelSizeLimits);
  const viewportInset = getCopilotViewportInset(input.viewport.width);
  const collapsedWidth = Math.min(
    COPILOT_COLLAPSED_WIDTH,
    Math.max(COPILOT_COLLAPSED_WIDTH, input.viewport.width - viewportInset * 2),
  );
  const expandedWidth = Math.min(
    panelSizeLimits.maxWidth,
    Math.max(0, input.viewport.width - viewportInset * 2),
  );
  // The expanded rail is a fixed surface, so its height must be derived from
  // both safe edges. A minimum height that ignores the footer/toast clearance
  // makes the top clamp win and lets the panel cover the action footer on
  // compact windows.
  const expandedHeight = Math.max(
    0,
    Math.min(
      panelSizeLimits.maxHeight,
      input.viewport.height -
        input.minTopOffset -
        Math.max(input.minBottomOffset, COPILOT_PANEL_OFFSET),
    ),
  );
  const width = input.isOpen ? expandedWidth : collapsedWidth;
  const height = input.isOpen ? expandedHeight : COPILOT_COLLAPSED_HEIGHT;

  return {
    maxX: Math.max(viewportInset, input.viewport.width - width - viewportInset),
    maxY: Math.max(
      input.minTopOffset,
      input.viewport.height -
        height -
        Math.max(input.minBottomOffset, COPILOT_PANEL_OFFSET),
    ),
    minX: viewportInset,
    minY: input.minTopOffset,
  };
}

export function resizeCopilotPosition(input: {
  isOpen: boolean;
  minBottomOffset: number;
  minTopOffset: number;
  nextViewport: CopilotViewport;
  panelSizeLimits?: CopilotPanelSizeLimits;
  position: CopilotPosition;
  previousViewport: CopilotViewport;
}): CopilotPosition {
  const previousBounds = getCopilotPositionBounds({
    isOpen: input.isOpen,
    minBottomOffset: input.minBottomOffset,
    minTopOffset: input.minTopOffset,
    ...(input.panelSizeLimits
      ? { panelSizeLimits: input.panelSizeLimits }
      : {}),
    viewport: input.previousViewport,
  });
  const nextBounds = getCopilotPositionBounds({
    isOpen: input.isOpen,
    minBottomOffset: input.minBottomOffset,
    minTopOffset: input.minTopOffset,
    ...(input.panelSizeLimits
      ? { panelSizeLimits: input.panelSizeLimits }
      : {}),
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
  minBottomOffset = COPILOT_BOTTOM_OFFSET,
  panelSizeLimits?: CopilotPanelSizeLimits,
) {
  const resolvedPanelSizeLimits =
    resolveCopilotPanelSizeLimits(panelSizeLimits);

  if (typeof window === "undefined") {
    return {
      expandedWidth: resolvedPanelSizeLimits.maxWidth,
      expandedHeight: Math.min(
        COPILOT_PANEL_MAX_HEIGHT,
        resolvedPanelSizeLimits.maxHeight,
      ),
      collapsedWidth: COPILOT_COLLAPSED_WIDTH,
      collapsedHeight: COPILOT_COLLAPSED_HEIGHT,
    };
  }

  const viewportInset = getCopilotViewportInset(window.innerWidth);

  return {
    expandedWidth: Math.min(
      resolvedPanelSizeLimits.maxWidth,
      Math.max(0, window.innerWidth - viewportInset * 2),
    ),
    expandedHeight: Math.max(
      0,
      Math.min(
        resolvedPanelSizeLimits.maxHeight,
        window.innerHeight -
          minTopOffset -
          Math.max(minBottomOffset, COPILOT_PANEL_OFFSET),
      ),
    ),
    collapsedWidth: Math.min(
      COPILOT_COLLAPSED_WIDTH,
      Math.max(COPILOT_COLLAPSED_WIDTH, window.innerWidth - viewportInset * 2),
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
  panelSizeLimits?: CopilotPanelSizeLimits;
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
  const dimensions = getCopilotPanelDimensions(
    minY,
    input.minBottomOffset,
    input.panelSizeLimits,
  );
  const width = input.isOpen
    ? dimensions.expandedWidth
    : dimensions.collapsedWidth;
  const height = input.isOpen
    ? dimensions.expandedHeight
    : dimensions.collapsedHeight;
  const maxX = Math.max(
    getCopilotViewportInset(window.innerWidth),
    window.innerWidth - width - getCopilotViewportInset(window.innerWidth),
  );
  const maxY = Math.max(
    minY,
    window.innerHeight -
      height -
      Math.max(input.minBottomOffset, COPILOT_PANEL_OFFSET),
  );

  return {
    x: Math.max(
      getCopilotViewportInset(window.innerWidth),
      Math.min(input.x, maxX),
    ),
    y: Math.max(minY, Math.min(input.y, maxY)),
  };
}
