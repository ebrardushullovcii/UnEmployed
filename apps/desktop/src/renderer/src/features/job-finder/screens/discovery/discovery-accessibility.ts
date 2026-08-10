export const DISCOVERY_DETAIL_HEADING_ID =
  "discovery-selected-job-heading";
export const DISCOVERY_DETAIL_REGION_ID =
  "discovery-selected-job-detail";

export function focusDiscoveryDetailAfterKeyboardSelection(): void {
  queueMicrotask(() => {
    document.getElementById(DISCOVERY_DETAIL_HEADING_ID)?.focus();
  });
}
