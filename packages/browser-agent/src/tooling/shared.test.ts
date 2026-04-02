import type { Page } from "playwright";
import { describe, expect, test, vi } from "vitest";
import { buildComboboxOptionScopes } from "./shared";

describe("buildComboboxOptionScopes", () => {
  test("limits combobox option clicks to the popup when aria-controls is present", () => {
    const locator = vi.fn((selector: string) => ({ selector }) as never);
    const page = { locator } as unknown as Page;

    const scopes = buildComboboxOptionScopes(page, 'popup-"menu"');

    expect(locator).toHaveBeenCalledTimes(1);
    expect(locator).toHaveBeenCalledWith('[id="popup-\\"menu\\""]');
    expect(scopes).toHaveLength(1);
  });

  test("falls back to the body only when no popup id is available", () => {
    const locator = vi.fn((selector: string) => ({ selector }) as never);
    const page = { locator } as unknown as Page;

    const scopes = buildComboboxOptionScopes(page, null);

    expect(locator).toHaveBeenCalledTimes(1);
    expect(locator).toHaveBeenCalledWith("body");
    expect(scopes).toHaveLength(1);
  });
});
