import type {
  ApplyBlockedAttempt,
  ApplyPageSession,
  ApplyRawPageHands,
  ApplyServiceWorkerFinding,
  ApplyUploadFile,
  ApplyWriteResult,
  RawApplyAction,
  RawApplyControl,
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

export async function readRawApplyPage(page: Page): Promise<RawApplyPage> {
  const [controls, actions, bodyText, validationErrors, stepLabel] =
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
            const owned = element.getAttribute("aria-controls");
            const listbox = owned
              ? document.getElementById(owned)
              : element.parentElement?.querySelector("[role='listbox']") ?? null;
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
  const enrichedControls = await Promise.all(
    controls.map(async (control) => {
      const isCustomCombobox =
        control.tagName !== "select" &&
        (control.role === "combobox" || control.inputType === "combobox");
      if (!isCustomCombobox) {
        return control;
      }
      const custom = await readCustomComboboxState(page, control.index);
      const selectedOptionLabel =
        custom.selectedOptionLabel || control.selectedOptionLabel;
      return {
        ...control,
        selectedOptionLabel,
        visible:
          control.visible ||
          (custom.compositeVisible && selectedOptionLabel.trim().length > 0),
      };
    }),
  );

  return {
    url: page.url(),
    title: await page.title().catch(() => null),
    bodyText,
    controls: enrichedControls,
    actions,
    validationErrors,
    stepLabel,
  };
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
async function readCustomComboboxState(
  page: Page,
  index: number,
): Promise<{ selectedOptionLabel: string; compositeVisible: boolean }> {
  return page
    .locator(APPLY_CONTROL_SELECTOR)
    .nth(index)
    .evaluate((element) => {
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
    })
    .catch(() => ({ selectedOptionLabel: "", compositeVisible: false }));
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
        await locator.fill(value, { timeout: 10_000 });
        return {
          ok: true,
          observedValue: await locator.inputValue({ timeout: 5_000 }),
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
        await locator.selectOption({ label: optionLabel }, { timeout: 10_000 });
        return { ok: true, observedValue: optionLabel };
      } catch {
        // A list the page draws itself opens on click and is picked from the
        // options it renders; the same intent, a different mechanism.
        try {
          await locator.click({ timeout: 5_000 });
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
        await locator.setChecked(checked, { timeout: 10_000 });
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
        await locator.click({ timeout: 15_000 });
        return { ok: true, observedValue: "clicked" };
      } catch (error) {
        return {
          ok: false,
          error: describeWriteFailure(error, "The button would not respond."),
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
