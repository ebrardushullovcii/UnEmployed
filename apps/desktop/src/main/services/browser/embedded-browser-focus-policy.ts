export type EmbeddedBrowserFocusAction =
  | "none"
  | "resolve_task_attention"
  | "take_global_control";

/**
 * Focusing a parked Needs You tab is task-local help. It must not cancel an
 * unrelated browser operation that happens to be running in another tab.
 */
export function getEmbeddedBrowserFocusAction(input: {
  activeOperationCount: number;
  attentionTabId: string | null;
  focusedTabId: string;
  handoverPending: boolean;
  hasAttention: boolean;
  paused: boolean;
}): EmbeddedBrowserFocusAction {
  if (input.hasAttention && input.attentionTabId === input.focusedTabId) {
    return "resolve_task_attention";
  }
  if (
    input.activeOperationCount > 0 &&
    !input.paused &&
    !input.handoverPending
  ) {
    return "take_global_control";
  }
  if (input.hasAttention && input.activeOperationCount === 0) {
    return "resolve_task_attention";
  }
  return "none";
}
