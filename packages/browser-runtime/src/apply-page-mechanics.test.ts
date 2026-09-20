import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  createPlaywrightApplyPageMechanics,
  readRawApplyPage,
} from "./apply-page-mechanics";

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

  test("one task sees and closes only popups opened by its own page", async () => {
    const context = await browser.newContext();
    const taskPage = await context.newPage();
    const unrelatedTaskPage = await context.newPage();
    await unrelatedTaskPage.setContent("<title>Other task</title>");
    await taskPage.setContent(`
      <title>Current task</title>
      <button id="open">Apply</button>
      <script>
        document.getElementById("open").addEventListener("click", () => {
          const popup = window.open("about:blank", "_blank");
          if (popup) popup.document.title = "Current task popup";
        });
      </script>
    `);

    await taskPage.click("#open");
    await expect.poll(() => context.pages().length).toBe(3);

    const observation = await readRawApplyPage(taskPage);
    expect(observation.openedTabs).toHaveLength(1);
    expect(observation.openedTabs[0]?.title).toBe("Current task popup");

    const mechanics = createPlaywrightApplyPageMechanics(taskPage);
    const adoption = await mechanics.adoptOpenedTab!(0);
    expect(adoption).toEqual({
      ok: false,
      error: "That tab never loaded a web page.",
    });
    expect(unrelatedTaskPage.isClosed()).toBe(false);
    expect(await unrelatedTaskPage.title()).toBe("Other task");

    await context.close();
  }, 60_000);

  test("presses keyboard-only controls on the requested field", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <label for="city">City</label>
      <input id="city" />
      <p id="result">Waiting</p>
      <script>
        document.getElementById("city").addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            document.getElementById("result").textContent = "Accepted";
          }
        });
      </script>
    `);

    const mechanics = createPlaywrightApplyPageMechanics(page);
    expect(await mechanics.pressKey("c0", "Enter")).toEqual({
      ok: true,
      observedValue: "Enter",
    });
    expect(await page.locator("#result").innerText()).toBe("Accepted");

    await page.close();
  });

  test("reads a question wrapped around an otherwise unlabelled select", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <li>
        <div>
          Are you currently authorized to work in this country?
          <div><select required><option>Select...</option><option>Yes</option><option>No</option></select></div>
        </div>
      </li>
    `);

    const observation = await readRawApplyPage(page);
    expect(observation.controls[0]?.label).toBe(
      "Are you currently authorized to work in this country?",
    );

    await page.close();
  });

  test("does not report success when a controlled input clears the value", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <label>Current location <input id="location" /></label>
      <script>
        document.getElementById("location").addEventListener("input", (event) => {
          setTimeout(() => { event.target.value = ""; }, 10);
        });
      </script>
    `);

    const mechanics = createPlaywrightApplyPageMechanics(page);
    await expect(mechanics.fillText("c0", "Pristina")).resolves.toEqual({
      ok: false,
      error:
        "The field cleared the answer instead of keeping it. Leave it for the person or try a different control once.",
    });

    await page.close();
  });

  test("reads and operates accessible shadow-root and iframe forms", async () => {
    const page = await browser.newPage();
    await page.setContent(`
      <h1>Application</h1>
      <div id="shadow-host"></div>
      <iframe id="embedded" srcdoc='
        <label for="email">Email in frame</label>
        <input id="email" type="email" />
        <button id="continue">Continue</button>
      '></iframe>
      <script>
        const root = document.getElementById("shadow-host").attachShadow({ mode: "open" });
        root.innerHTML = '<label for="name">Name in component</label><input id="name" />';
      </script>
    `);
    await expect.poll(() => page.frames().length).toBe(2);
    const childFrame = page
      .frames()
      .find((frame) => frame !== page.mainFrame())!;
    await childFrame.evaluate(() => {
      document.getElementById("continue")?.addEventListener("click", () => {
        document.body.dataset.continued = "yes";
      });
    });

    const mechanics = createPlaywrightApplyPageMechanics(page);
    const observation = await mechanics.readPage();
    const shadowControl = observation.controls.find(
      (control) => control.id === "name",
    );
    const frameControl = observation.controls.find(
      (control) => control.id === "email",
    );
    const frameAction = observation.actions.find(
      (action) => action.label === "Continue",
    );

    const shadowRef = shadowControl?.ref ?? `c${shadowControl?.index}`;
    expect(shadowRef).toMatch(/^c\d+$/u);
    expect(frameControl?.ref).toMatch(/^f0c\d+$/u);
    expect(frameAction?.ref).toMatch(/^f0a\d+$/u);
    expect(observation.bodyText).toContain("Email in frame");

    expect(await mechanics.fillText(shadowRef, "Ada Lovelace")).toEqual({
      ok: true,
      observedValue: "Ada Lovelace",
    });
    expect(
      await mechanics.fillText(frameControl!.ref!, "ada@example.test"),
    ).toEqual({
      ok: true,
      observedValue: "ada@example.test",
    });
    expect(await mechanics.clickAction(frameAction!.ref!)).toEqual({
      ok: true,
      observedValue: "clicked",
    });
    expect(
      await childFrame.locator("body").getAttribute("data-continued"),
    ).toBe("yes");

    await page.close();
  });
});
