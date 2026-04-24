import type { Page } from "playwright";
import type { AgentState } from "../types";

export const CLICK_TIMEOUT_MS = 5000;
export const REPEATED_FAILURE_BLOCK_THRESHOLD = 2;

type InteractionKind = "click" | "fill" | "select_option";

type FailedInteractionState = Pick<
  AgentState,
  "failedInteractionAttempts" | "failedInteractionPageStateToken"
>;

export async function readInteractionPageStateToken(page: Page): Promise<string> {
  if (typeof (page as { evaluate?: unknown }).evaluate !== "function") {
    return page.url();
  }

  try {
    const token = await page.evaluate(() => {
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [role="button"], [role="link"], [role="textbox"], [role="checkbox"], [role="menuitem"], [role="option"], [role="tab"], [role="switch"], [role="slider"], [role="combobox"], [contenteditable="true"]',
        ),
      )
        .filter((element) => !element.closest('[aria-hidden="true"], [hidden], template'))
        .slice(0, 80)
        .map((element) => {
          const role =
            element.getAttribute("role")?.trim().toLowerCase() ?? element.tagName.toLowerCase();
          const name =
            [
              element.getAttribute("aria-label"),
              element.getAttribute("placeholder"),
              element.getAttribute("title"),
              element.textContent,
            ].find((value) => typeof value === "string" && value.trim().length > 0) ?? "";

          let state = "";
          if (element instanceof HTMLInputElement) {
            if (element.type === "checkbox" || element.type === "radio") {
              state = element.checked ? "[checked]" : "[unchecked]";
            } else {
              state = `[type:${element.type}]`;
            }
          } else if (element instanceof HTMLTextAreaElement) {
            state = "[textarea]";
          } else if (element instanceof HTMLSelectElement) {
            state = `[select:${element.selectedIndex}]`;
          } else {
            const ariaChecked = element.getAttribute("aria-checked");
            const ariaSelected = element.getAttribute("aria-selected");
            const ariaExpanded = element.getAttribute("aria-expanded");
            const ariaDisabled = element.getAttribute("aria-disabled");
            if (ariaChecked !== null) state += `[aria-checked:${ariaChecked}]`;
            if (ariaSelected !== null) state += `[aria-selected:${ariaSelected}]`;
            if (ariaExpanded !== null) state += `[aria-expanded:${ariaExpanded}]`;
            if (ariaDisabled !== null) state += `[aria-disabled:${ariaDisabled}]`;
          }

          return `${role}:${name.replace(/\s+/g, " ").trim()}${state}`;
        });

      return `${window.location.href}::${document.title}::${elements.join("|")}`;
    });

    return typeof token === "string" && token.trim().length > 0 ? token : page.url();
  } catch {
    return page.url();
  }
}

export async function syncFailedInteractionAttemptsWithPageState(
  page: Page,
  state: FailedInteractionState,
): Promise<void> {
  const nextToken = await readInteractionPageStateToken(page);

  if (
    state.failedInteractionAttempts &&
    state.failedInteractionPageStateToken &&
    state.failedInteractionPageStateToken !== nextToken
  ) {
    state.failedInteractionAttempts.clear();
  }

  state.failedInteractionPageStateToken = nextToken;
}

export function clearFailedInteractionAttemptsAfterNavigation(state: FailedInteractionState) {
  state.failedInteractionAttempts?.clear();
  delete state.failedInteractionPageStateToken;
}

function normalizeInteractionAttemptRole(kind: InteractionKind, role: string): string {
  void kind;
  return role.trim().toLowerCase();
}

function normalizeInteractionAttemptName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\bverified job\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

export function buildInteractionAttemptKey(
  kind: InteractionKind,
  role: string,
  name: string,
  index: number,
  optionText?: string,
): string {
  const baseKey = `${kind}::${normalizeInteractionAttemptRole(kind, role)}::${normalizeInteractionAttemptName(name)}::${index}`;
  if (kind === "select_option" && optionText) {
    const normalized = normalizeInteractionAttemptName(optionText);
    if (normalized) {
      return `${baseKey}::${normalized}`;
    }
  }
  return baseKey;
}

export function shouldTreatAsRepeatedClickFailure(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return (
    (normalized.includes("no ") && normalized.includes(" matched accessible name")) ||
    normalized.includes("intercepts pointer events") ||
    normalized.includes("intercepts direct pointer clicks") ||
    normalized.includes("disallowed url") ||
    normalized.includes("is not allowed") ||
    normalized.includes("invalid url")
  );
}

export function shouldTreatAsRepeatedFillFailure(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return (
    (normalized.includes("no ") && normalized.includes(" matched accessible name")) ||
    normalized.includes("timeout") ||
    normalized.includes("did not receive focus") ||
    normalized.includes("disallowed url")
  );
}

export function shouldTreatAsRepeatedSelectOptionFailure(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return (
    shouldTreatAsRepeatedFillFailure(errorMessage) ||
    normalized.includes("dropdown element not found") ||
    normalized.includes("was not found") ||
    normalized.includes("supports native select elements") ||
    normalized.includes("unsupported")
  );
}

export function summarizeClickFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/intercepts pointer events/i.test(message)) {
    return "The matched control is present, but another visible element intercepts direct pointer clicks.";
  }

  if (/No .* matched accessible name/i.test(message)) {
    return message;
  }

  return message;
}

export function recordFailedInteractionAttempt(
  state: Pick<AgentState, "failedInteractionAttempts">,
  interactionAttemptKey: string,
  priorAttempt: { count: number; lastError: string } | undefined,
  errorMessage: string,
) {
  const nextFailureCount = (priorAttempt?.count ?? 0) + 1;
  state.failedInteractionAttempts?.set(interactionAttemptKey, {
    count: nextFailureCount,
    lastError: errorMessage,
  });
  return nextFailureCount;
}

function normalizeOptionText(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

export function comboboxSelectionMatchesOption(
  selection: { selectedLabel: string | null; selectedValue: string | null },
  optionText: string,
): boolean {
  const normalizedOptionText = normalizeOptionText(optionText);

  if (!normalizedOptionText) {
    return false;
  }

  return [selection.selectedLabel, selection.selectedValue].some(
    (value) => normalizeOptionText(value) === normalizedOptionText,
  );
}
