import type { Page } from "playwright";
import { describe, expect, test, vi } from "vitest";
import { buildComboboxOptionScopes, ClickSchema, FillSchema, SelectOptionSchema } from "./shared";

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

describe("interactive tool schemas", () => {
  test("reject invalid aria roles at the schema boundary", () => {
    expect(ClickSchema.safeParse({ role: "dialog", name: "Open", index: 0 }).success).toBe(false)
    expect(FillSchema.safeParse({ role: "grid", name: "Search", text: "engineer" }).success).toBe(false)
    expect(SelectOptionSchema.safeParse({ role: "button", name: "Location", optionText: "Remote" }).success).toBe(true)
  })
})
