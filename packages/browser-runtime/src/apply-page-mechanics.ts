import type {
  ApplyBlockedAttempt,
  ApplyNavigationResult,
  ApplyPageSession,
  ApplyRawPageHands,
  ApplyServiceWorkerFinding,
  ApplyUploadFile,
  ApplyWriteResult,
  RawApplyAction,
  RawApplyControl,
  RawApplyLink,
  RawApplyPage,
} from "@unemployed/contracts";
import type { Locator, Page } from "playwright";

import {
  closePrepareOnlyIntermediateMutationWindow,
  ensurePrepareOnlyMutationGuard,
  getLatestBlockedPrepareOnlyAttempt,
  openPrepareOnlyIntermediateMutationWindow,
  registerPrepareOnlyPreparedValue,
  type ApplicationRunServiceWorkerSentinel,
} from "./playwright-application-flow";

/**
 * Reading and writing an application form, and nothing else.
 *
 * This is the browser half of the apply seam. It knows how to find the
 * controls on a page, report what they say about themselves, and change one of
 * them. It does not know what a resume field is, which control should be
 * touched next, or whether a write is allowed; that is workflow policy and
 * lives above this layer.
 */

export const APPLY_CONTROL_SELECTOR =
  "input:not([type='hidden']):not([type='submit']):not([type='button']), textarea, select, [role='combobox'], [role='checkbox'], [role='radio'], [contenteditable='true']";

export const APPLY_ACTION_SELECTOR =
  "button, input[type='submit'], input[type='button'], [role='button']";

export const APPLY_LINK_SELECTOR = "a[href]";

export async function readRawApplyPage(page: Page): Promise<RawApplyPage> {
  const [controls, actions, links, bodyText, validationErrors, stepLabel] =
    await Promise.all([
      page
        .locator(APPLY_CONTROL_SELECTOR)
        .evaluateAll((elements): RawApplyControl[] => {
          const isVisible = (element: HTMLElement): boolean => {
            if (element.getAttribute("aria-hidden") === "true") {
              return false;
            }
            const style = window.getComputedStyle(element);
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              style.opacity !== "0" &&
              element.getClientRects().length > 0
            );
          };
          const referencedText = (element: Element): string =>
            (element.getAttribute("aria-labelledby") ?? "")
              .split(/\s+/u)
              .filter(Boolean)
              .map((id) => document.getElementById(id)?.textContent ?? "")
              .join(" ")
              .trim();
          const directLabel = (element: Element): string => {
            const aria = element.getAttribute("aria-label")?.trim();
            if (aria) return aria;
            const referenced = referencedText(element);
            if (referenced) return referenced;
            const labelled = element as HTMLInputElement;
            const labels =
              "labels" in labelled && labelled.labels
                ? Array.from(labelled.labels)
                : [];
            const text = labels
              .map((label) => label.innerText.trim())
              .filter(Boolean)
              .join(" ");
            if (text) return text;
            return element.closest("label")?.textContent?.trim() ?? "";
          };
          const groupLabel = (element: Element): string => {
            const legend = element
              .closest("fieldset")
              ?.querySelector(":scope > legend");
            if (legend?.textContent?.trim()) return legend.textContent.trim();
            const group = element.closest("[role='group'], [role='radiogroup']");
            return group
              ? group.getAttribute("aria-label")?.trim() || referencedText(group)
              : "";
          };
          const customOptions = (element: HTMLElement): string[] => {
            // Only a list this control says is its own. Reaching into the
            // nearest listbox in the DOM is how a phone number field ended up
            // carrying the 200 countries belonging to the picker beside it,
            // and then refusing the number as "not one of the choices".
            const owned =
              element.getAttribute("aria-controls") ??
              element.getAttribute("aria-owns");
            const listbox = owned ? document.getElementById(owned) : null;
            if (!listbox) return [];
            return Array.from(listbox.querySelectorAll("[role='option']"))
              .map((option) => option.textContent?.trim() ?? "")
              .filter(Boolean)
              .slice(0, 200);
          };

          return elements.map((element, index) => {
            const html = element as HTMLElement;
            const input = element instanceof HTMLInputElement ? element : null;
            const textarea =
              element instanceof HTMLTextAreaElement ? element : null;
            const select = element instanceof HTMLSelectElement ? element : null;
            const role = element.getAttribute("role")?.toLowerCase() ?? "";
            const tagName = select
              ? "select"
              : textarea
                ? "textarea"
                : input
                  ? "input"
                  : "contenteditable";
            return {
              index,
              tagName,
              inputType: input?.type.toLowerCase() ?? (role || tagName),
              role,
              id: html.id ?? "",
              name: input?.name ?? textarea?.name ?? select?.name ?? "",
              label: directLabel(element),
              groupLabel: groupLabel(element),
              placeholder: input?.placeholder ?? textarea?.placeholder ?? "",
              autocomplete: input?.autocomplete ?? textarea?.autocomplete ?? "",
              required:
                Boolean(
                  input?.required ?? textarea?.required ?? select?.required,
                ) || element.getAttribute("aria-required") === "true",
              invalid: element.getAttribute("aria-invalid") === "true",
              validationMessage:
                input?.validationMessage ??
                textarea?.validationMessage ??
                select?.validationMessage ??
                "",
              disabled:
                Boolean(
                  input?.disabled ?? textarea?.disabled ?? select?.disabled,
                ) || element.getAttribute("aria-disabled") === "true",
              readOnly: Boolean(input?.readOnly ?? textarea?.readOnly),
              visible: isVisible(html),
              value:
                input?.value ??
                textarea?.value ??
                select?.value ??
                html.textContent ??
                "",
              checked:
                input?.checked ?? element.getAttribute("aria-checked") === "true",
              multiple: select?.multiple ?? false,
              options: select
                ? Array.from(select.options)
                    .map((option) => option.label.trim())
                    .filter(Boolean)
                : customOptions(html),
              selectedOptionLabel:
                select?.selectedOptions.item(0)?.label.trim() ??
                element.getAttribute("aria-valuetext")?.trim() ??
                "",
            };
          });
        }),
      page
        .locator(APPLY_ACTION_SELECTOR)
        .evaluateAll((elements): RawApplyAction[] =>
          elements.map((element, index) => {
            const html = element as HTMLElement;
            const input = element instanceof HTMLInputElement ? element : null;
            const button =
              element instanceof HTMLButtonElement ? element : null;
            const style = window.getComputedStyle(html);
            return {
              index,
              label:
                element.getAttribute("aria-label")?.trim() ||
                input?.value.trim() ||
                html.innerText.trim(),
              visible:
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                style.opacity !== "0" &&
                html.getClientRects().length > 0,
              disabled:
                Boolean(input?.disabled ?? button?.disabled) ||
                element.getAttribute("aria-disabled") === "true",
            };
          }),
        ),
      page
        .locator(APPLY_LINK_SELECTOR)
        .evaluateAll((elements): RawApplyLink[] =>
          // More links than this on one page are never the way to a form.
          elements.slice(0, 400).map((element, index) => {
            const html = element as HTMLElement;
            const anchor =
              element instanceof HTMLAnchorElement ? element : null;
            const style = window.getComputedStyle(html);
            const rect = html.getBoundingClientRect();
            return {
              index,
              label:
                element.getAttribute("aria-label")?.trim() ||
                html.innerText.trim() ||
                element.getAttribute("title")?.trim() ||
                "",
              // `href` on the element is already resolved against the page for
              // a web address, and left as written for anything else.
              href: anchor?.href || element.getAttribute("href") || "",
              target: anchor?.target.trim() ?? "",
              visible:
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                style.opacity !== "0" &&
                html.getClientRects().length > 0,
              topOffset: Math.round(rect.top + window.scrollY),
            };
          }),
        )
        .catch(() => [] as RawApplyLink[]),
      page
        .locator("body")
        .innerText({ timeout: 5_000 })
        .then((text) => text.slice(0, 20_000))
        .catch(() => ""),
      page
        .locator("[role='alert'], [aria-live='assertive']")
        .evaluateAll((elements) =>
          elements
            .map((element) => (element as HTMLElement).innerText.trim())
            .filter((text) => text.length > 0 && text.length < 300)
            .slice(0, 12),
        )
        .catch(() => [] as string[]),
      page
        .locator("[role='progressbar'], [aria-label*='step' i]")
        .first()
        .innerText({ timeout: 1_000 })
        .then((text) => text.trim().slice(0, 200))
        .catch(() => null),
    ]);

  // A list the page draws itself does not report its own selection, so it is
  // read separately before anything decides the control is empty.
  // One pass over the page for every list it draws itself, rather than one
  // round trip each: a form with a dozen of them is read after every single
  // field is filled in, and those round trips are the person's time.
  const customIndexes = controls
    .filter(
      (control) =>
        control.tagName !== "select" &&
        (control.role === "combobox" || control.inputType === "combobox"),
    )
    .map((control) => control.index);
  const customStates =
    customIndexes.length > 0
      ? await readCustomComboboxStates(page, customIndexes)
      : new Map<number, { selectedOptionLabel: string; compositeVisible: boolean }>();
  const enrichedControls = controls.map((control) => {
    const custom = customStates.get(control.index);
    if (!custom) {
      return control;
    }
    const selectedOptionLabel =
      custom.selectedOptionLabel || control.selectedOptionLabel;
    return {
      ...control,
      selectedOptionLabel,
      visible:
        control.visible ||
        (custom.compositeVisible && selectedOptionLabel.trim().length > 0),
    };
  });

  // A list the page builds itself renders its choices only while it is open.
  // Closed, the question reaches the person as a bare text box with nothing to
  // pick from, which is no question at all. Opening it is a read: it asks the
  // page to show what it already offers and writes nothing.
  const controlsWithChoices = await readClosedComboboxOptions(
    page,
    enrichedControls,
  );

  return {
    url: page.url(),
    title: await page.title().catch(() => null),
    bodyText,
    controls: controlsWithChoices,
    actions,
    links,
    validationErrors,
    stepLabel,
  };
}

/** How many closed lists one page read is willing to open. */
const MAX_OPENED_COMBOBOXES = 16;

/**
 * The choices already read out of one page's lists.
 *
 * Opening a list costs the better part of a second, and a form is read again
 * after every single field is filled in. Reading the same ten lists on every
 * one of those reads was minutes of a person's run spent learning nothing new:
 * the choices a list offers do not change while the form is being filled in.
 * Keyed by the page and by what the control says about itself, so a renumbered
 * control still finds its own choices and a new page starts fresh.
 */
const comboboxOptionMemo = new WeakMap<Page, Map<string, string[]>>();

/**
 * What makes one list that list, on this page and on the next read.
 *
 * Its own words and the kind of field it is — never where it sits in the DOM,
 * and never a listbox id the page mints afresh each time it opens. Position is
 * how the country list ended up answering a yes/no question.
 */
function comboboxMemoKey(url: string, control: RawApplyControl): string {
  const words = `${control.groupLabel} ${control.label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
  return `${url}|${words}|${control.tagName}|${control.inputType}|${control.role}`;
}

/**
 * Fills in the choices of every list that only renders them while open.
 *
 * Bounded on both axes: a few lists per read, a moment each. Anything that
 * will not open is left as it was rather than holding up the read.
 */
async function readClosedComboboxOptions(
  page: Page,
  controls: readonly RawApplyControl[],
): Promise<RawApplyControl[]> {
  const closed = controls.filter(
    (control) =>
      control.visible &&
      !control.disabled &&
      control.tagName !== "select" &&
      (control.role === "combobox" || control.inputType === "combobox") &&
      control.options.length === 0 &&
      // A list that already shows a choice has been answered; opening it
      // tells the person nothing and costs them a second of their run.
      control.selectedOptionLabel.trim().length === 0,
  );
  if (closed.length === 0) {
    return [...controls];
  }

  const url = page.url();
  let memo = comboboxOptionMemo.get(page);
  if (!memo) {
    memo = new Map<string, string[]>();
    comboboxOptionMemo.set(page, memo);
  }

  const optionsByIndex = new Map<number, string[]>();
  const toOpen: RawApplyControl[] = [];
  for (const control of closed) {
    const remembered = memo.get(comboboxMemoKey(url, control));
    if (remembered) {
      if (remembered.length > 0) {
        optionsByIndex.set(control.index, remembered);
      }
      continue;
    }
    toOpen.push(control);
  }

  for (const control of toOpen.slice(0, MAX_OPENED_COMBOBOXES)) {
    const locator = page.locator(APPLY_CONTROL_SELECTOR).nth(control.index);
    try {
      // Whatever the last list left open is closed first: a click that only
      // dismisses someone else's flyout reads as a list with no choices, and
      // the question then reaches the person as a bare text box.
      await page.keyboard.press("Escape").catch(() => undefined);
      await locator.scrollIntoViewIfNeeded({ timeout: 1_500 }).catch(() => undefined);
      // Focus and a down arrow, the way a person opens one of these with the
      // keyboard. A click depends on the window being the one in front, which
      // it is not when the browser is doing this beside the app; the keyboard
      // does not care. The click stays as the fallback.
      await locator.focus({ timeout: 1_500 }).catch(() => undefined);
      await locator.press("ArrowDown", { timeout: 1_500 }).catch(() => undefined);
      if ((await locator.getAttribute("aria-expanded")) !== "true") {
        await locator.click({ timeout: 1_500 });
      }
      // Only the list this control owns. Every open flyout on the page has
      // options in the DOM, and the nearest ones are not necessarily these.
      // Give the list the moment it needs to render its choices.
      await locator
        .evaluate(
          (element) =>
            new Promise<void>((resolve) => {
              const deadline = Date.now() + 600;
              const check = (): void => {
                if (
                  element.getAttribute("aria-expanded") === "true" ||
                  Date.now() > deadline
                ) {
                  resolve();
                  return;
                }
                setTimeout(check, 50);
              };
              check();
            }),
        )
        .catch(() => undefined);
      const options = await locator.evaluate((element) => {
        // Only the list this control opened, proved by the control saying it
        // is expanded and naming the list as its own. Falling back to the
        // nearest container is how one question ends up showing another
        // question's answers.
        if (element.getAttribute("aria-expanded") !== "true") {
          return [] as string[];
        }
        const owned =
          element.getAttribute("aria-controls") ??
          element.getAttribute("aria-owns");
        const listbox = owned ? document.getElementById(owned) : null;
        if (!listbox) return [] as string[];
        return Array.from(listbox.querySelectorAll("[role='option']"))
          .map((option) => (option as HTMLElement).innerText.trim())
          .filter((text) => text.length > 0)
          .slice(0, 200);
      });
      memo.set(comboboxMemoKey(url, control), options);
      if (options.length > 0) {
        optionsByIndex.set(control.index, options);
      }
    } catch {
      // Remembered as "nothing to offer" so the next read does not pay for
      // the same list again.
      memo.set(comboboxMemoKey(url, control), []);
      // A list that will not open tells us nothing; the question still goes
      // to the person, just without its choices.
    }
    await page.keyboard.press("Escape").catch(() => undefined);
  }

  return controls.map((control) => {
    const options = optionsByIndex.get(control.index);
    return options ? { ...control, options } : control;
  });
}

/**
 * What a list the page draws itself is currently showing.
 *
 * A native `select` reports its own selection; a widget built out of divs does
 * not, and reading `value` off it returns nothing useful. This reads the
 * rendered selection instead, including the country a flag stands for, so a
 * pre-filled phone-country or similar picker is not mistaken for empty. It is
 * a widget-shape reading, not a rule about any particular site.
 */
async function readCustomComboboxStates(
  page: Page,
  indexes: readonly number[],
): Promise<
  Map<number, { selectedOptionLabel: string; compositeVisible: boolean }>
> {
  const wanted = new Set(indexes);
  const states = await page
    .locator(APPLY_CONTROL_SELECTOR)
    .evaluateAll((elements, selected: number[]) => {
      const want = new Set(selected);
      const readOne = (
        element: Element,
      ): { selectedOptionLabel: string; compositeVisible: boolean } => {
      const controlRoot =
        element.closest("[class*='__control']") ??
        element.closest("[class*='-control']") ??
        element.closest(".select-shell, [class*='select-shell']");
      const compositeVisible = Boolean(
        controlRoot &&
          controlRoot.getAttribute("aria-hidden") !== "true" &&
          controlRoot.getAttribute("hidden") === null &&
          controlRoot.getClientRects().length > 0,
      );
      const selectedValue = controlRoot?.querySelector<HTMLElement>(
        "[class*='__single-value'], [class*='-singleValue'], [class*='single-value'], [role='option'][aria-selected='true']",
      );
      if (!selectedValue) {
        return { selectedOptionLabel: "", compositeVisible };
      }

      const selectedText = selectedValue.textContent?.trim() ?? "";
      const regionCode = [
        selectedValue,
        ...Array.from(
          controlRoot?.querySelectorAll<HTMLElement>("[class*='iti__']") ?? [],
        ),
        ...Array.from(selectedValue.querySelectorAll<HTMLElement>("[class]")),
      ]
        .flatMap((candidate) =>
          (candidate.getAttribute("class") ?? "").split(/\s+/u),
        )
        .map((className) => /^iti__([a-z]{2})$/iu.exec(className)?.[1] ?? "")
        .find(Boolean);
      if (!regionCode) {
        return { selectedOptionLabel: selectedText, compositeVisible };
      }

      let regionName = "";
      try {
        regionName =
          new Intl.DisplayNames(["en"], { type: "region" }).of(
            regionCode.toUpperCase(),
          ) ?? "";
      } catch {
        // A flag without a verified country name stays insufficient: several
        // countries share a calling code.
      }

        return {
          selectedOptionLabel: [regionName, selectedText]
            .filter(Boolean)
            .join(" ")
            .trim(),
          compositeVisible,
        };
      };

      return elements.map((element, index) =>
        want.has(index)
          ? ([index, readOne(element)] as const)
          : ([index, null] as const),
      );
    }, [...wanted])
    .catch(
      () =>
        [] as ReadonlyArray<
          readonly [
            number,
            { selectedOptionLabel: string; compositeVisible: boolean } | null,
          ]
        >,
    );

  const byIndex = new Map<
    number,
    { selectedOptionLabel: string; compositeVisible: boolean }
  >();
  for (const [index, state] of states) {
    if (state) {
      byIndex.set(index, state);
    }
  }
  return byIndex;
}

function controlLocator(page: Page, ref: string): Locator | null {
  const index = Number.parseInt(ref.replace(/^c/u, ""), 10);
  if (!ref.startsWith("c") || Number.isNaN(index)) {
    return null;
  }
  return page.locator(APPLY_CONTROL_SELECTOR).nth(index);
}

function actionLocator(page: Page, ref: string): Locator | null {
  const index = Number.parseInt(ref.replace(/^a/u, ""), 10);
  if (!ref.startsWith("a") || Number.isNaN(index)) {
    return null;
  }
  return page.locator(APPLY_ACTION_SELECTOR).nth(index);
}

function linkLocator(page: Page, ref: string): Locator | null {
  const index = Number.parseInt(ref.replace(/^l/u, ""), 10);
  if (!ref.startsWith("l") || Number.isNaN(index)) {
    return null;
  }
  return page.locator(APPLY_LINK_SELECTOR).nth(index);
}

function describeWriteFailure(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** The live-page implementation of the apply mechanics. */
export function createPlaywrightApplyPageMechanics(
  page: Page,
): ApplyRawPageHands {
  return {
    readPage: () => readRawApplyPage(page),
    fillText: async (ref, value): Promise<ApplyWriteResult> => {
      const locator = controlLocator(page, ref);
      if (!locator) {
        return { ok: false, error: `No control named ${ref} on this page.` };
      }
      try {
        await locator.fill(value, { timeout: 5_000 });
        return {
          ok: true,
          observedValue: await locator.inputValue({ timeout: 2_000 }),
        };
      } catch (error) {
        return {
          ok: false,
          error: describeWriteFailure(
            error,
            "The field would not accept the answer.",
          ),
        };
      }
    },
    chooseOption: async (ref, optionLabel): Promise<ApplyWriteResult> => {
      const locator = controlLocator(page, ref);
      if (!locator) {
        return { ok: false, error: `No control named ${ref} on this page.` };
      }
      try {
        await locator.selectOption({ label: optionLabel }, { timeout: 5_000 });
        return { ok: true, observedValue: optionLabel };
      } catch {
        // A list the page draws itself opens on click and is picked from the
        // options it renders; the same intent, a different mechanism.
        try {
          // Open it, type enough of the answer for the list to narrow to it,
          // then take the choice that says it. Typing first is what makes a
          // list of two hundred countries usable at all.
          await locator.click({ timeout: 5_000 });
          await locator.fill(optionLabel, { timeout: 2_000 }).catch(async () => {
            await locator.type(optionLabel, { timeout: 2_000 });
          });
          await page
            .getByRole("option", { name: optionLabel, exact: true })
            .first()
            .click({ timeout: 5_000 });
          return { ok: true, observedValue: optionLabel };
        } catch (error) {
          return {
            ok: false,
            error: describeWriteFailure(
              error,
              `The list did not offer "${optionLabel}".`,
            ),
          };
        }
      }
    },
    setToggle: async (ref, checked): Promise<ApplyWriteResult> => {
      const locator = controlLocator(page, ref);
      if (!locator) {
        return { ok: false, error: `No control named ${ref} on this page.` };
      }
      try {
        await locator.setChecked(checked, { timeout: 5_000 });
        return { ok: true, observedValue: checked ? "checked" : "unchecked" };
      } catch (error) {
        return {
          ok: false,
          error: describeWriteFailure(error, "The box would not change."),
        };
      }
    },
    uploadFile: async (ref, file: ApplyUploadFile): Promise<ApplyWriteResult> => {
      const locator = controlLocator(page, ref);
      if (!locator) {
        return { ok: false, error: `No control named ${ref} on this page.` };
      }
      try {
        await locator.setInputFiles(
          {
            name: file.name,
            mimeType: file.mimeType,
            buffer: Buffer.from(file.bytes),
          },
          { timeout: 15_000 },
        );
        return { ok: true, observedValue: file.name };
      } catch (error) {
        return {
          ok: false,
          error: describeWriteFailure(error, "The file would not attach."),
        };
      }
    },
    clickAction: async (ref): Promise<ApplyWriteResult> => {
      const locator = actionLocator(page, ref);
      if (!locator) {
        return { ok: false, error: `No button named ${ref} on this page.` };
      }
      try {
        await locator.click({ timeout: 10_000 });
        return { ok: true, observedValue: "clicked" };
      } catch (error) {
        return {
          ok: false,
          error: describeWriteFailure(error, "The button would not respond."),
        };
      }
    },
    followLink: async (ref): Promise<ApplyNavigationResult> => {
      const locator = linkLocator(page, ref);
      if (!locator) {
        return { ok: false, error: `No link named ${ref} on this page.` };
      }
      let href = "";
      try {
        href = await locator.evaluate(
          (element) =>
            (element as HTMLAnchorElement).href ||
            element.getAttribute("href") ||
            "",
          undefined,
          { timeout: 5_000 },
        );
      } catch (error) {
        return {
          ok: false,
          error: describeWriteFailure(error, "That link is no longer here."),
        };
      }
      let target: URL;
      try {
        target = new URL(href, page.url());
      } catch {
        return { ok: false, error: "That link does not point at a page." };
      }
      if (target.protocol !== "https:" && target.protocol !== "http:") {
        return {
          ok: false,
          error: "That link does not open a web page.",
        };
      }
      try {
        // Asking for the address the link already publishes, rather than
        // clicking it, keeps the hop a plain read: no popup, no script, and
        // nothing the page can turn into a write.
        await page.goto(target.toString(), {
          waitUntil: "domcontentloaded",
          // Short on purpose: a hop that does not answer quickly is a hop
          // that is costing the person their run.
          timeout: 15_000,
        });
        return { ok: true, url: page.url() };
      } catch (error) {
        return {
          ok: false,
          error: describeWriteFailure(error, "That page would not open."),
        };
      }
    },
  };
}


/**
 * One open application page and the safety mechanics that go with it.
 *
 * Everything the workflow layer is allowed to do to this page is here, and
 * nothing here decides anything.
 */
export function createPlaywrightApplyPageSession(input: {
  page: Page;
  sentinel?: ApplicationRunServiceWorkerSentinel;
}): ApplyPageSession {
  const { page } = input;
  const mechanics = createPlaywrightApplyPageMechanics(page);
  let intermediateWriteCount = 0;

  return {
    ...mechanics,
    installPrepareOnlyGuard: async (guardInput) => {
      await ensurePrepareOnlyMutationGuard(
        page,
        guardInput.intermediateMutationsAuthorized,
        guardInput.allowedOrigins,
      );
    },
    readBlockedAttempt: async (): Promise<ApplyBlockedAttempt | null> =>
      (await getLatestBlockedPrepareOnlyAttempt(page)) ?? null,
    registerPreparedValue: (value) =>
      registerPrepareOnlyPreparedValue(page, value),
    openIntermediateWriteWindow: async () => {
      await openPrepareOnlyIntermediateMutationWindow(page);
      intermediateWriteCount += 1;
    },
    closeIntermediateWriteWindow: () =>
      closePrepareOnlyIntermediateMutationWindow(page),
    readIntermediateWriteCount: () => intermediateWriteCount,
    checkServiceWorker: async (): Promise<ApplyServiceWorkerFinding | null> => {
      const finding = await input.sentinel?.check("form_preparation");
      if (!finding) {
        return null;
      }
      return {
        reason: finding.reason,
        summary:
          "A background worker on this site can change the page while Job Finder is on it.",
        detail: finding.detail,
      };
    },
  };
}
