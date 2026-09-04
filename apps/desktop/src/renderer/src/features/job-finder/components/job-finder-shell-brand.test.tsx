// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JobFinderShellBrand } from "./job-finder-shell-brand";

afterEach(cleanup);

/**
 * Tailwind v4's arbitrary-property shorthand takes the custom property
 * directly: `text-(--token)`. Wrapping it in `var()` produces `var(var(--x))`
 * and Tailwind emits no rule at all, so the class silently does nothing. These
 * assertions pin the token form for the brand lockup's type styling.
 */
describe("JobFinderShellBrand token classes", () => {
  it("uses the Tailwind v4 custom-property shorthand without a nested var()", () => {
    const { container } = render(<JobFinderShellBrand />);

    const wordmark = container.querySelector("[data-desktop-brand-wordmark]");
    const subtitle = container.querySelector("[data-desktop-brand-subtitle]");

    expect(wordmark).not.toBeNull();
    expect(subtitle).not.toBeNull();

    expect(wordmark?.className).toContain("text-(--headline-primary)");
    expect(subtitle?.className).toContain("tracking-(--tracking-caps)");
    expect(subtitle?.className).toContain("sm:text-(length:--text-tiny)");
  });

  it("ships no var()-wrapped custom-property class on any brand node", () => {
    const { container } = render(<JobFinderShellBrand />);

    const lockup = container.querySelector("[data-desktop-brand-lockup]");
    expect(lockup).not.toBeNull();

    for (const node of [lockup, ...Array.from(lockup?.children ?? [])]) {
      expect(node?.className ?? "").not.toMatch(
        /-\((?:length:|color:)?var\(--/,
      );
    }
  });
});
