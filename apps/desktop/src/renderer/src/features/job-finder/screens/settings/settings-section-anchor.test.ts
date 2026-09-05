// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { focusSettingsSection } from "./settings-section-anchor";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

it("scrolls only the settings content and leaves room for the sticky navigation", () => {
  document.body.innerHTML =
    '<main class="screen-scroll-area" style="padding-top:12px"><section id="settings-tracker" tabindex="-1" style="scroll-margin-top:65px"></section></main>';
  const main = document.querySelector("main")!;
  const target = document.getElementById("settings-tracker")!;
  main.scrollTop = 200;
  vi.spyOn(main, "getBoundingClientRect").mockReturnValue({
    top: 56,
  } as DOMRect);
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
    top: 900,
  } as DOMRect);
  const scrollIntoView = vi.fn();
  target.scrollIntoView = scrollIntoView;
  const focus = vi.spyOn(target, "focus");
  expect(focusSettingsSection(target.id)).toBe(true);
  expect(main.scrollTop).toBe(967);
  expect(scrollIntoView).not.toHaveBeenCalled();
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
});
