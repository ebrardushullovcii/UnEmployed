export type JobFinderPlatform = "darwin" | "linux" | "win32";

export type JobFinderShortcutId = "open-global-search" | "toggle-sidebar";

export type JobFinderShortcutCombo = "/" | "mod+b" | "mod+k";

export interface JobFinderShortcutDefinition {
  combo: JobFinderShortcutCombo;
  id: JobFinderShortcutId;
  label: string;
  scope: string;
}

export const JOB_FINDER_SHORTCUTS: readonly JobFinderShortcutDefinition[] = [
  {
    combo: "mod+k",
    id: "open-global-search",
    label: "Search current plan and workspace",
    scope: "Anywhere in Job Finder",
  },
  {
    combo: "/",
    id: "open-global-search",
    label: "Search current plan and workspace",
    scope: "Outside text fields, controls, and dialogs",
  },
  {
    combo: "mod+b",
    id: "toggle-sidebar",
    label: "Show or hide the sidebar",
    // Must mirror useJobFinderShellShortcuts: the combo only fires at the wide
    // layout breakpoint while no overlay or search surface is open and the
    // focus is outside editable fields.
    scope: "Wide layout only, outside overlays, search, and editable fields",
  },
];

export interface JobFinderKeyEventLike {
  altKey: boolean;
  ctrlKey: boolean;
  isComposing?: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

export function eventMatchesJobFinderShortcut(
  event: JobFinderKeyEventLike,
  combo: JobFinderShortcutCombo,
): boolean {
  if (combo === "/") {
    return (
      event.key === "/" && !event.altKey && !event.ctrlKey && !event.metaKey
    );
  }

  const shortcutKey = combo.slice(4);
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === shortcutKey
  );
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  const contenteditable = target.getAttribute("contenteditable");
  return contenteditable !== null && contenteditable !== "false";
}

const INTERACTIVE_SHORTCUT_TARGET_SELECTOR =
  "button, a, select, summary, [role='button'], [role='combobox'], [role='menuitem'], [role='option'], [role='tab']";

export function isInteractiveShortcutTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest(INTERACTIVE_SHORTCUT_TARGET_SELECTOR) !== null;
}

export function isImeComposingEvent(event: {
  isComposing?: boolean;
  keyCode?: number;
}): boolean {
  return Boolean(event.isComposing) || event.keyCode === 229;
}

export function formatJobFinderShortcutCombo(
  combo: JobFinderShortcutCombo,
  platform: JobFinderPlatform,
): string {
  if (combo === "/") {
    return "/";
  }
  const key = combo.slice(4).toUpperCase();
  return platform === "darwin" ? `⌘${key}` : `Ctrl ${key}`;
}

export function getJobFinderAriaKeyshortcuts(
  combo: Exclude<JobFinderShortcutCombo, "/">,
  platform: JobFinderPlatform,
): string {
  return `${platform === "darwin" ? "Meta" : "Control"}+${combo.slice(4)}`;
}

export interface JobFinderShortcutHelpEntry {
  combos: readonly string[];
  id: JobFinderShortcutId;
  label: string;
  scope: string;
}

export function buildJobFinderShortcutHelp(
  platform: JobFinderPlatform,
): readonly JobFinderShortcutHelpEntry[] {
  const entries = new Map<JobFinderShortcutId, JobFinderShortcutHelpEntry>();
  for (const shortcut of JOB_FINDER_SHORTCUTS) {
    const existing = entries.get(shortcut.id);
    const display = formatJobFinderShortcutCombo(shortcut.combo, platform);
    if (existing) {
      existing.combos = [...existing.combos, display];
      // Aliases can carry different scopes (⌘K vs "/"); keep every distinct
      // scope visible instead of letting the first definition win silently.
      if (!existing.scope.includes(shortcut.scope)) {
        existing.scope = `${existing.scope}; ${shortcut.scope}`;
      }
      continue;
    }
    entries.set(shortcut.id, {
      combos: [display],
      id: shortcut.id,
      label: shortcut.label,
      scope: shortcut.scope,
    });
  }
  return [...entries.values()];
}
