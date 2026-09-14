import type {
  ApplyNavigationResult,
  RawApplyControl,
  RawApplyLink,
  RawApplyPage,
} from "@unemployed/contracts";
import { describe, expect, test } from "vitest";

import { findApplyEntry, resolveApplyEntry } from "./apply-entry";
import { buildApplyFormObservation } from "./page-hands";
import type { ApplyFormObservation, ApplyPageHands } from "./types";

/**
 * Getting from a listing to the form.
 *
 * Most boards show the job on one page and take the application on another,
 * often on the employer's own site. These prove the route is read from the
 * words on the page, not from any knowledge of a particular board.
 */

function link(overrides: Partial<RawApplyLink> = {}): RawApplyLink {
  return {
    index: 0,
    label: "Apply now",
    href: "https://employer.example.test/careers/123",
    target: "",
    visible: true,
    topOffset: 200,
    ...overrides,
  };
}

function control(overrides: Partial<RawApplyControl> = {}): RawApplyControl {
  return {
    index: 0,
    tagName: "input",
    inputType: "text",
    role: "",
    id: "f0",
    name: "f0",
    label: "Full name",
    groupLabel: "",
    placeholder: "",
    autocomplete: "",
    required: true,
    invalid: false,
    validationMessage: "",
    disabled: false,
    readOnly: false,
    visible: true,
    value: "",
    checked: false,
    multiple: false,
    options: [],
    selectedOptionLabel: "",
    ...overrides,
  };
}

function observe(overrides: Partial<RawApplyPage> = {}): ApplyFormObservation {
  return buildApplyFormObservation(
    {
      url: "https://board.example.test/job/events-manager",
      title: "Events Manager",
      bodyText: "Events Manager at Northwind Tools",
      controls: [],
      actions: [],
      links: [],
      validationErrors: [],
      stepLabel: null,
      ...overrides,
    },
    "2026-09-14T10:00:00.000Z",
  );
}

describe("finding the way into an application", () => {
  test("a listing with an apply button offers it as the way in", () => {
    const finding = findApplyEntry(
      observe({
        actions: [
          { index: 0, label: "Save job", visible: true, disabled: false },
          { index: 1, label: "Apply now", visible: true, disabled: false },
        ],
      }),
    );

    expect(finding.kind).toBe("follow");
    expect(finding.kind === "follow" && finding.entry.label).toBe("Apply now");
    expect(finding.kind === "follow" && finding.entry.ref).toBe("a1");
  });

  test("an apply link to another site is followed there", () => {
    const finding = findApplyEntry(
      observe({
        links: [
          link({ index: 0, label: "Similar jobs", href: "https://board.example.test/jobs" }),
          link({
            index: 1,
            label: "Apply on company site",
            href: "https://employer.example.test/careers/apply",
          }),
        ],
      }),
    );

    expect(finding.kind).toBe("follow");
    expect(finding.kind === "follow" && finding.entry.host).toBe(
      "employer.example.test",
    );
  });

  test("a page that already asks the application's questions is left alone", () => {
    const finding = findApplyEntry(
      observe({
        controls: [control()],
        links: [link()],
      }),
    );

    expect(finding.kind).toBe("form_present");
  });

  test("a search box on a listing is not mistaken for an application form", () => {
    const finding = findApplyEntry(
      observe({
        controls: [
          control({ label: "Search jobs", required: false, id: "q", name: "q" }),
        ],
        links: [link()],
      }),
    );

    expect(finding.kind).toBe("follow");
  });

  test("a listing with nothing that starts an application says so", () => {
    const finding = findApplyEntry(
      observe({
        links: [
          link({ index: 0, label: "Similar jobs", href: "https://board.example.test/jobs" }),
          link({ index: 1, label: "How to apply", href: "https://board.example.test/help" }),
        ],
      }),
    );

    expect(finding.kind).toBe("none");
  });

  test("an apply control that only offers an account is the person's to take", () => {
    const finding = findApplyEntry(
      observe({
        links: [
          link({
            index: 0,
            label: "Sign in to apply",
            href: "https://board.example.test/login",
          }),
        ],
      }),
    );

    expect(finding.kind).toBe("sign_in");
  });

  test("an apply control that opens its own window is handed to the person", () => {
    const finding = findApplyEntry(
      observe({ links: [link({ target: "_blank" })] }),
    );

    expect(finding.kind).toBe("hand_off");
    expect(finding.kind === "hand_off" && finding.reason).toBe("new_window");
  });

  test("an apply control that opens an email is handed to the person", () => {
    const finding = findApplyEntry(
      observe({
        links: [link({ label: "Apply", href: "mailto:jobs@employer.example.test" })],
      }),
    );

    expect(finding.kind).toBe("hand_off");
    expect(finding.kind === "hand_off" && finding.reason).toBe("email");
  });
});

/** A listing whose apply link leads to the employer's form, one hop away. */
function listingThenForm(): {
  hands: ApplyPageHands;
  followed: string[];
} {
  const followed: string[] = [];
  let onForm = false;
  const hands: ApplyPageHands = {
    observe: () =>
      Promise.resolve(
        onForm
          ? buildApplyFormObservation(
              {
                url: "https://employer.example.test/careers/apply",
                title: "Apply",
                bodyText: "Tell us about yourself",
                controls: [control()],
                actions: [
                  { index: 0, label: "Submit application", visible: true, disabled: false },
                ],
                links: [],
                validationErrors: [],
                stepLabel: null,
              },
              "2026-09-14T10:00:05.000Z",
            )
          : observe({ links: [link()] }),
      ),
    fillText: (_ref, value) => Promise.resolve({ ok: true, observedValue: value }),
    chooseOption: (_ref, option) =>
      Promise.resolve({ ok: true, observedValue: option }),
    setToggle: () => Promise.resolve({ ok: true, observedValue: "checked" }),
    uploadFile: (_ref, file) =>
      Promise.resolve({ ok: true, observedValue: file.name }),
    clickAction: () => Promise.resolve({ ok: true, observedValue: "clicked" }),
    followLink: (ref): Promise<ApplyNavigationResult> => {
      followed.push(ref);
      onForm = true;
      return Promise.resolve({
        ok: true,
        url: "https://employer.example.test/careers/apply",
      });
    },
  };
  return { hands, followed };
}

describe("walking from a listing to a form", () => {
  test("the run follows the apply link and writes the hop down", async () => {
    const { hands, followed } = listingThenForm();
    const resolution = await resolveApplyEntry({
      hands,
      observation: await hands.observe(),
      now: () => new Date("2026-09-14T10:00:00.000Z"),
    });

    expect(resolution.outcome).toBe("form_reached");
    expect(followed).toEqual(["l0"]);
    expect(resolution.hops).toBe(1);
    expect(resolution.notes).toEqual([
      'Followed "Apply now" to employer.example.test.',
    ]);
  });

  test("a listing with no way in ends with a sentence the person can act on", async () => {
    const observation = observe();
    const hands = listingThenForm().hands;
    const resolution = await resolveApplyEntry({
      hands: { ...hands, observe: () => Promise.resolve(observation) },
      observation,
      now: () => new Date("2026-09-14T10:00:00.000Z"),
    });

    expect(resolution.outcome).toBe("not_found");
    expect(resolution.reason).toBe(
      "This listing has no apply link; the job may be closed or the employer takes applications elsewhere.",
    );
    expect(resolution.blocker?.code).toBe("application_page_unreachable");
  });

  test("a run stops after its hop budget rather than wandering", async () => {
    // Every page offers another apply link and never a form.
    const observation = observe({ links: [link()] });
    const hands: ApplyPageHands = {
      ...listingThenForm().hands,
      observe: () =>
        Promise.resolve(
          buildApplyFormObservation(
            {
              url: `https://hop.example.test/${Math.random()}`,
              title: "Careers",
              bodyText: "Careers",
              controls: [],
              actions: [],
              links: [link()],
              validationErrors: [],
              stepLabel: null,
            },
            "2026-09-14T10:00:01.000Z",
          ),
        ),
      followLink: () =>
        Promise.resolve({ ok: true, url: `https://hop.example.test/next` }),
    };

    const resolution = await resolveApplyEntry({
      hands,
      observation,
      maxHops: 2,
      now: () => new Date("2026-09-14T10:00:00.000Z"),
    });

    expect(resolution.outcome).toBe("not_found");
    expect(resolution.hops).toBe(2);
    expect(resolution.reason).toContain("never reached an application form");
  });

  test("a hop that lands on a login page is a sign-in, not a form", async () => {
    const listing = observe({ links: [link()] });
    const login = buildApplyFormObservation(
      {
        url: "https://board.example.test/auth/login?destination=/job/events-manager",
        title: "Log in",
        bodyText: "Log in to Built to continue",
        controls: [
          control({ index: 0, label: "Email", inputType: "email" }),
          control({ index: 1, label: "Password", inputType: "password" }),
        ],
        actions: [{ index: 0, label: "Log in", visible: true, disabled: false }],
        links: [],
        validationErrors: [],
        stepLabel: null,
      },
      "2026-09-14T10:00:05.000Z",
    );
    const hands: ApplyPageHands = {
      ...listingThenForm().hands,
      observe: () => Promise.resolve(login),
      followLink: () => Promise.resolve({ ok: true, url: login.url ?? "" }),
    };

    const resolution = await resolveApplyEntry({
      hands,
      observation: listing,
      now: () => new Date("2026-09-14T10:00:00.000Z"),
    });

    expect(resolution.outcome).toBe("blocked");
    expect(resolution.blocker?.code).toBe("site_login_required");
    expect(resolution.blocker?.nextActionLabel).toBe("Sign in on the site");
    expect(resolution.observation.url).toBe(login.url);
    // The hop that got here is still in the trail.
    expect(resolution.notes[0]).toBe('Followed "Apply now" to board.example.test.');
  });

  test("a plain application form is still a form", () => {
    expect(
      findApplyEntry(
        observe({
          url: "https://employer.example.test/careers/apply",
          controls: [control()],
          actions: [
            { index: 0, label: "Submit application", visible: true, disabled: false },
          ],
        }),
      ).kind,
    ).toBe("form_present");
  });

  test("a destination that wants a sign-in keeps the sign-in blocker's next action", async () => {
    const listing = observe({ links: [link()] });
    const gate = buildApplyFormObservation(
      {
        url: "https://employer.example.test/login",
        title: "Sign in",
        bodyText: "Please sign in to continue",
        controls: [],
        actions: [],
        links: [],
        validationErrors: [],
        stepLabel: null,
      },
      "2026-09-14T10:00:05.000Z",
    );
    const hands: ApplyPageHands = {
      ...listingThenForm().hands,
      observe: () => Promise.resolve(gate),
      followLink: () =>
        Promise.resolve({ ok: true, url: "https://employer.example.test/login" }),
    };

    const resolution = await resolveApplyEntry({
      hands,
      observation: listing,
      now: () => new Date("2026-09-14T10:00:00.000Z"),
    });

    expect(resolution.outcome).toBe("blocked");
    expect(resolution.blocker?.code).toBe("site_login_required");
    expect(resolution.blocker?.nextActionLabel).toBe("Sign in on the site");
  });
});
