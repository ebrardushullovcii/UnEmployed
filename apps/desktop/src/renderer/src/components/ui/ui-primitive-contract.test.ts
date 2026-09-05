import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The primitive floor, enforced by source scan.
 *
 * Every rule below encodes a defect the consistency audit found repeatedly and
 * that no runtime test can catch, because the symptom is a class string rather
 * than a behaviour:
 *
 * - `disabled-opacity-wash`: a 50% wash is not a state. It leaves border, text
 *   and placeholder on three different effective contrasts depending on the
 *   surface behind the control, so the same disabled control reads differently
 *   on a card and on the page. Disabled binds the shared tokens instead.
 * - `unbound-disabled-token`: a primitive that can be disabled must bind
 *   `--disabled-foreground`, and - if it paints a box - `--disabled-surface`
 *   and `--disabled-border` too, so the disabled treatment is retunable in one
 *   place.
 * - `alpha-focus-ring`: the focus ring is the one non-negotiable
 *   accessibility affordance; diluting `--ring` per component puts different
 *   primitives at different focus contrasts.
 * - `literal-radius`: a literal Tailwind radius silently disagrees with the
 *   radius tokens. `rounded-md` is 0.375rem, larger than `--radius-button`'s
 *   0.34rem, so the smallest buttons were the roundest ones.
 * - `off-scale-height`: control boxes come from the published size scale
 *   (h-8 toolbar, h-9, h-10 default, h-11 field; size-6/8/9/10 icon). Only
 *   bare heights at or above 7 are checked, so ornament heights (badges,
 *   rails, indicators) and prefixed sub-element heights such as `file:h-7`
 *   are out of scope.
 *
 * RESIDUAL_VIOLATIONS is a ratchet, not an exemption. Every entry is a real
 * violation in a file this package does not own; the set may only shrink.
 * Violations are compared as a subset, so a fix elsewhere never breaks this
 * test - the owner fixes the file and the coordinator deletes the entry.
 *
 * It is now EMPTY: every entry it carried has been fixed at source rather than
 * exempted (the `disabled:opacity-50` washes and `ring-ring/NN` rings across
 * checkbox / label / switch / tabs / textarea, `rounded-md` on tooltip.tsx,
 * and `ring-ring/50` on scroll-area.tsx). An empty ratchet means the rules
 * below apply to every file in this directory with no residue, so the next
 * violation of any of them fails immediately instead of being recorded.
 */
const RESIDUAL_VIOLATIONS: Readonly<Record<string, readonly string[]>> = {};

/** Files this package owns. None of them may ever enter the ratchet. */
const OWNED_FILES = [
  "button.tsx",
  "count.tsx",
  "dialog.tsx",
  "disclosure.tsx",
  "eyebrow.tsx",
  "input.tsx",
  "popover.tsx",
  "segmented-control.tsx",
  "select.tsx",
] as const;

const CONTROL_HEIGHT_SCALE = [8, 9, 10, 11];
const ICON_BOX_SCALE = [6, 8, 9, 10];

export function findUiPrimitiveViolations(source: string): string[] {
  const violations: string[] = [];

  for (const match of source.matchAll(
    /disabled:opacity-(?!100\b)[\w./[\]-]+/g,
  )) {
    violations.push(`disabled-opacity-wash:${match[0]}`);
  }

  for (const match of source.matchAll(/ring-ring\/\d+/g)) {
    violations.push(`alpha-focus-ring:${match[0]}`);
  }

  for (const match of source.matchAll(/\brounded-(?:2xl|xl|md|sm)\b/g)) {
    violations.push(`literal-radius:${match[0]}`);
  }

  for (const match of source.matchAll(/(?<![\w:.-])h-(\d+)(?![\w.-])/g)) {
    const height = Number(match[1]);
    if (height >= 7 && !CONTROL_HEIGHT_SCALE.includes(height)) {
      violations.push(`off-scale-height:${match[0]}`);
    }
  }

  for (const match of source.matchAll(/(?<![\w:.-])size-(\d+)(?![\w.-])/g)) {
    const box = Number(match[1]);
    if (box >= 6 && !ICON_BOX_SCALE.includes(box)) {
      violations.push(`off-scale-height:${match[0]}`);
    }
  }

  const canBeDisabled =
    /(disabled:|data-\[disabled\]|group-data-\[disabled)/.test(source);
  if (canBeDisabled) {
    const paintsBox = /\b(?:bg|border)-/.test(source);
    const required = paintsBox
      ? ["--disabled-surface", "--disabled-border", "--disabled-foreground"]
      : ["--disabled-foreground"];
    for (const token of required) {
      if (!source.includes(token)) {
        violations.push(`unbound-disabled-token:${token}`);
      }
    }
  }

  return [...new Set(violations)].sort();
}

const uiDirectory = fileURLToPath(new URL(".", import.meta.url));
const primitiveFiles = readdirSync(uiDirectory)
  .filter((file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"))
  .sort();

describe("ui primitive contract", () => {
  it("scans every primitive in components/ui", () => {
    // A silently empty scan would make every assertion below vacuous.
    expect(primitiveFiles.length).toBeGreaterThan(10);
    for (const owned of OWNED_FILES) {
      expect(primitiveFiles).toContain(owned);
    }
  });

  it("detects each rule it claims to enforce", () => {
    // Each probe carries the disabled foreground token so the wash rule is
    // measured on its own rather than alongside the token rule.
    expect(
      findUiPrimitiveViolations(
        "disabled:opacity-50 disabled:text-(--disabled-foreground)",
      ),
    ).toEqual(["disabled-opacity-wash:disabled:opacity-50"]);
    expect(
      findUiPrimitiveViolations(
        "disabled:opacity-100 disabled:text-(--disabled-foreground)",
      ),
    ).toEqual([]);
    expect(findUiPrimitiveViolations("focus-visible:ring-ring/30")).toEqual([
      "alpha-focus-ring:ring-ring/30",
    ]);
    expect(findUiPrimitiveViolations("rounded-2xl rounded-md")).toEqual([
      "literal-radius:rounded-2xl",
      "literal-radius:rounded-md",
    ]);
    expect(findUiPrimitiveViolations("h-12 h-7 size-12")).toEqual([
      "off-scale-height:h-12",
      "off-scale-height:h-7",
      "off-scale-height:size-12",
    ]);
    // Prefixed sub-element heights and ornaments stay out of scope.
    expect(findUiPrimitiveViolations("file:h-7 h-5 h-0.5 size-4")).toEqual([]);
    expect(
      findUiPrimitiveViolations("bg-input disabled:cursor-not-allowed"),
    ).toEqual([
      "unbound-disabled-token:--disabled-border",
      "unbound-disabled-token:--disabled-foreground",
      "unbound-disabled-token:--disabled-surface",
    ]);
    // A boxless primitive only owes the foreground token.
    expect(
      findUiPrimitiveViolations(
        "underline disabled:text-(--disabled-foreground)",
      ),
    ).toEqual([]);
  });

  it("keeps every primitive inside the contract apart from the recorded residual set", () => {
    const unexpected: Record<string, string[]> = {};

    for (const file of primitiveFiles) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      const residual = RESIDUAL_VIOLATIONS[file] ?? [];
      const remaining = findUiPrimitiveViolations(source).filter(
        (violation) => !residual.includes(violation),
      );
      if (remaining.length > 0) {
        unexpected[file] = remaining;
      }
    }

    expect(unexpected).toEqual({});
  });

  it("never records a residual violation for a file this package owns", () => {
    for (const owned of OWNED_FILES) {
      expect(RESIDUAL_VIOLATIONS[owned]).toBeUndefined();
    }
  });
});
