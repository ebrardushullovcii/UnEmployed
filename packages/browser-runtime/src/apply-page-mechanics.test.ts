import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { readRawApplyPage } from "./apply-page-mechanics";

/**
 * Two lists the page draws itself, read one after the other.
 *
 * Shaped after a live board's form: a react-style combobox renders its choices
 * only while it is open, and every open list on the page has options sitting
 * in the DOM. Reading the nearest ones put a country list under a yes/no
 * question, so each control's choices must come from the list that control
 * itself names and only while that control says it is expanded.
 */
const PAGE = `
<!doctype html>
<html><body>
  <label for="agreements">Are you subject to any employment agreements?</label>
  <input id="agreements" role="combobox" aria-expanded="false" aria-controls="agreements-list" readonly />
  <div id="agreements-list" role="listbox" hidden></div>

  <label for="country">What is your current country of residence?</label>
  <input id="country" role="combobox" aria-expanded="false" aria-controls="country-list" readonly />
  <div id="country-list" role="listbox" hidden></div>

  <script>
    const lists = {
      "agreements": ["Yes", "No"],
      "country": ["Afghanistan", "Albania", "Algeria"],
    };
    for (const id of Object.keys(lists)) {
      const input = document.getElementById(id);
      const listbox = document.getElementById(id + "-list");
      input.addEventListener("click", () => {
        const open = input.getAttribute("aria-expanded") === "true";
        if (open) return;
        input.setAttribute("aria-expanded", "true");
        listbox.hidden = false;
        listbox.innerHTML = lists[id]
          .map((option) => '<div role="option">' + option + "</div>")
          .join("");
      });
      document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        input.setAttribute("aria-expanded", "false");
        listbox.hidden = true;
      });
    }
  </script>
</body></html>
`;

describe("reading the choices of lists the page draws itself", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
  });

  test("each control gets its own choices, and keeps them on a second read", async () => {
    const page = await browser.newPage();
    await page.setContent(PAGE);

    const first = await readRawApplyPage(page);
    const agreements = first.controls.find(
      (control) => control.id === "agreements",
    );
    const country = first.controls.find((control) => control.id === "country");

    expect(agreements?.options).toEqual(["Yes", "No"]);
    expect(country?.options).toEqual(["Afghanistan", "Albania", "Algeria"]);

    // A form is read again after every field is filled in; the same choices
    // come back without opening anything a second time.
    const second = await readRawApplyPage(page);
    expect(
      second.controls.find((control) => control.id === "agreements")?.options,
    ).toEqual(["Yes", "No"]);
    expect(
      second.controls.find((control) => control.id === "country")?.options,
    ).toEqual(["Afghanistan", "Albania", "Algeria"]);

    await page.close();
  }, 60_000);
});
