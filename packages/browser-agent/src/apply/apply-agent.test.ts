import { CandidateProfileSchema } from "@unemployed/contracts";
import { describe, expect, test } from "vitest";

import type { LLMClient } from "../agent/contracts";
import { runApplyAgent } from "./apply-agent";
import type { RawApplyControl, RawApplyPage } from "@unemployed/contracts";
import { buildApplyFormObservation } from "./page-hands";
import type { ApplyAgentConfig, ApplyPageHands } from "./types";

/**
 * How the loop ends.
 *
 * There is no step quota: the agent decides when the form is done. What is
 * bounded is going nowhere — a stall gets one warning and then the run stops,
 * and the agent can stop itself by finishing as stuck.
 */

/** One ordinary question, so the page reads as a form rather than a listing. */
function nameControl(): RawApplyControl {
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
  };
}

function page(overrides: Partial<RawApplyPage> = {}): RawApplyPage {
  return {
    url: "https://apply.example.test/form",
    title: "Apply",
    bodyText: "Apply for the role",
    controls: [nameControl()],
    actions: [{ index: 0, label: "Continue", visible: true, disabled: false }],
    links: [],
    headings: [],
    clickables: [],
    openedTabs: [],
    loading: false,
    validationErrors: [],
    stepLabel: null,
    ...overrides,
  };
}

function hands(source: RawApplyPage): ApplyPageHands {
  return {
    observe: () =>
      Promise.resolve(
        buildApplyFormObservation(source, "2026-09-14T10:00:00.000Z"),
      ),
    navigate: () =>
      Promise.resolve({ ok: true, url: "https://apply.example.test/form" }),
    clickElement: () => Promise.resolve({ ok: true, observedValue: "clicked" }),
    scroll: () => Promise.resolve({ ok: true, observedValue: "down" }),
    wait: () => Promise.resolve(),
    goBack: () =>
      Promise.resolve({ ok: true, url: "https://apply.example.test/form" }),
    readText: () => Promise.resolve("Apply for the role"),
    fillText: (_ref, value) =>
      Promise.resolve({ ok: true, observedValue: value }),
    chooseOption: (_ref, option) =>
      Promise.resolve({ ok: true, observedValue: option }),
    setToggle: () => Promise.resolve({ ok: true, observedValue: "checked" }),
    uploadFile: (_ref, file) =>
      Promise.resolve({ ok: true, observedValue: file.name }),
    clickAction: () => Promise.resolve({ ok: true, observedValue: "clicked" }),
    followLink: () =>
      Promise.resolve({ ok: true, url: "https://apply.example.test/form" }),
  };
}

function config(
  source: RawApplyPage,
  overrides: Partial<ApplyAgentConfig> = {},
): ApplyAgentConfig {
  return {
    hands: hands(source),
    authority: {
      mode: "prepare_only",
      submitAuthorized: false,
      preApprovedAttestationKinds: [],
      salaryDisclosure: "pause_for_user",
      allowedOrigins: [],
    },
    sources: {
      profile: CandidateProfileSchema.parse({
        id: "candidate_test",
        firstName: "Robin",
        lastName: "Ashford",
        fullName: "Robin Ashford",
        headline: "Platform engineer",
        summary: "Builds dependable internal tools.",
        currentLocation: "Manchester",
        yearsExperience: 8,
        baseResume: {
          id: "resume_test",
          fileName: "resume.txt",
          uploadedAt: "2026-09-01T09:00:00.000Z",
          textContent: "8 years of platform engineering.",
          textUpdatedAt: "2026-09-01T09:00:00.000Z",
          extractionStatus: "ready",
        },
      }),
      resumeText: null,
      posting: {
        title: "Platform Engineer",
        company: "Northwind Tools",
        location: "Manchester",
        description: "Own the internal platform.",
      },
      reusableAnswers: [],
      documents: [],
    },
    application: {
      jobId: "job_test",
      applicationId: "application_test",
      startingUrl: "https://apply.example.test/form",
    },
    siteLabel: "the careers site",
    now: () => new Date("2026-09-14T10:00:00.000Z"),
    ...overrides,
  };
}

function repeatingModel(
  name: string,
  args: Record<string, unknown>,
): LLMClient {
  let calls = 0;
  return {
    chatWithTools: () => {
      calls += 1;
      return Promise.resolve({
        toolCalls: [
          {
            id: `call_${calls}`,
            type: "function" as const,
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      });
    },
  };
}

function scriptedModel(
  turns: Array<{ name: string; args: Record<string, unknown> }>,
): LLMClient {
  let calls = 0;
  return {
    chatWithTools: () => {
      const turn = turns[Math.min(calls, turns.length - 1)];
      calls += 1;
      return Promise.resolve({
        toolCalls: [
          {
            id: `call_${calls}`,
            type: "function" as const,
            function: { name: turn.name, arguments: JSON.stringify(turn.args) },
          },
        ],
      });
    },
  };
}

test("creates a grounded requested document and attaches the generated file", async () => {
  const source = page({
    controls: [
      {
        ...nameControl(),
        inputType: "file",
        label: "Motivation letter",
      },
    ],
  });
  let capturedGrounding: string[] = [];
  const result = await runApplyAgent(
    config(source, {
      letters: {
        preference: {
          tone: "plain_professional",
          length: "short",
          language: null,
          sample: null,
        },
        provide: (request) => {
          capturedGrounding = request.groundedIn;
          return Promise.resolve({
            ok: true as const,
            text: "Dear Hiring Team,\n\nI am applying for the Platform Engineer role at Northwind Tools. My saved profile and resume show eight years of platform engineering and dependable internal-tool work. That experience aligns with your need for someone to own the internal platform.\n\nSincerely,\nRobin Ashford",
            document: {
              id: "generated_motivation_letter",
              fileName: "motivation-letter.pdf",
              mimeType: "application/pdf",
              label: "Motivation letter",
              kind: "cover_letter" as const,
              loadBytes: () => Promise.resolve(new Uint8Array([1, 2, 3])),
            },
          });
        },
      },
    }),
    scriptedModel([
      {
        name: "create_application_document",
        args: {
          purpose: "motivation_letter",
          instructions: "Explain the supported platform-engineering fit.",
          fileType: "pdf",
        },
      },
      {
        name: "upload",
        args: { ref: "c0", documentId: "generated_motivation_letter" },
      },
      {
        name: "finish",
        args: { reason: "The requested document is attached." },
      },
    ]),
  );

  expect(result.pauses).toEqual([]);
  expect(result).toMatchObject({
    attachments: [
      {
        documentId: "generated_motivation_letter",
        fileName: "motivation-letter.pdf",
        controlLabel: "Motivation letter",
      },
    ],
  });
  expect(result.notes).toContain(
    "Created motivation letter motivation-letter.pdf for this application.",
  );
  expect(capturedGrounding.join("\n")).toContain(
    '"summary": "Builds dependable internal tools."',
  );
  expect(capturedGrounding.join("\n")).toContain(
    "8 years of platform engineering.",
  );
  expect(capturedGrounding.join("\n")).toContain("Own the internal platform.");
});

describe("apply agent run endings", () => {
  test("reports reading and model-turn progress while it works", async () => {
    const progress: string[] = [];
    await runApplyAgent(
      config(page(), {
        onProgress: ({ note }) => {
          progress.push(note);
        },
      }),
      repeatingModel("finish", { reason: "The form is ready for review" }),
    );

    expect(progress[0]).toBe("reading the application form");
    expect(progress).toContain("asking the assistant what to do next");
  });

  test("an agent that keeps doing nothing is warned once and then stopped", async () => {
    const result = await runApplyAgent(
      config(page(), { runControl: { maxSteps: 40, noProgressStepLimit: 3 } }),
      repeatingModel("inspect_form", {}),
    );

    expect(result.outcome).toBe("stuck");
    expect(result.reason).toContain("stopped responding");
    // Stopped well before the ceiling: one warning, then one more idle window.
    expect(result.steps).toBeLessThan(12);
  });

  test("an agent that says it is stuck is believed, and its words reach the person", async () => {
    const result = await runApplyAgent(
      config(page()),
      repeatingModel("finish", {
        reason: "The form will not accept the phone number in any format",
        stuck: true,
      }),
    );

    expect(result.outcome).toBe("stuck");
    expect(result.reason).toBe(
      "Job Finder stopped on the careers site because it got stuck: The form will not accept the phone number in any format.",
    );
  });

  test("finishing normally reports what was filled in, in plain words", async () => {
    const result = await runApplyAgent(
      config(
        page({
          controls: [
            {
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
            },
          ],
        }),
      ),
      repeatingModel("finish", { reason: "Nothing left to fill in" }),
    );

    expect(result.outcome).toBe("prepared");
    expect(result.reason).toContain("Nothing left to fill in");
    expect(result.reason).toContain("nothing was sent");
  });

  test("one failed first read is given to the model and can recover", async () => {
    const source = page();
    const base = hands(source);
    let reads = 0;
    const result = await runApplyAgent(
      config(source, {
        hands: {
          ...base,
          observe: () => {
            reads += 1;
            return reads === 1
              ? Promise.reject(
                  new Error("The page was replaced while it loaded."),
                )
              : base.observe();
          },
        },
      }),
      scriptedModel([
        { name: "observe", args: {} },
        { name: "finish", args: { reason: "The form recovered and is ready" } },
      ]),
    );

    expect(result.outcome).toBe("prepared");
    expect(result.reason).toContain("The form recovered and is ready");
    expect(result.notes.join("\n")).toContain("application page did not open");
  });

  test("a sign-in wall is a fact the model is told, not an automatic stop", async () => {
    // The model is trusted to decide what to do about it — often there is a
    // guest route, and when there is not it finishes and says so.
    const result = await runApplyAgent(
      config(page({ bodyText: "You must be signed in to apply" })),
      repeatingModel("finish", {
        reason: "This site wants you signed in before it will show the form",
        needsPerson: true,
      }),
    );

    expect(result.outcome).toBe("paused");
    expect(result.reason).toContain("wants you signed in");
  });

  test("a run set to confirm first ends waiting for the person", async () => {
    const result = await runApplyAgent(
      config(page(), {
        authority: {
          mode: "confirm_before_submit",
          submitAuthorized: true,
          preApprovedAttestationKinds: [],
          salaryDisclosure: "pause_for_user",
          allowedOrigins: [],
        },
      }),
      repeatingModel("finish", { reason: "Nothing left to fill in" }),
    );

    expect(result.outcome).toBe("awaiting_your_review");
    expect(result.reason).toContain("ready for you to look over");
  });
});

/**
 * Asking once instead of once per field.
 *
 * A form with several questions nobody's profile answers used to stop at the
 * first one; the person answered, waited for a retry, and met the next. The
 * run now works the whole form and comes back with all of them together.
 */

/**
 * The form as a live board actually renders it.
 *
 * Read off a real posting: a phone country picker beside a phone number field,
 * both labelled Phone; a file field labelled "Attach"; yes/no questions drawn
 * as comboboxes; country lists; and hidden inputs that belong to the widgets
 * rather than to the person. Ten of these are answered from the person's own
 * profile, so the model is asked about the rest and nothing else.
 */

/**
 * A run says where its minutes went.
 *
 * Six minutes on a single-page form is the difference between a person using
 * this and not, and it cannot be diagnosed from a record that says only
 * "Filling in the form…".
 */
describe("the run records its own timing", () => {
  test("the trail ends with the phases and the number of model turns", async () => {
    const result = await runApplyAgent(
      config(page()),
      repeatingModel("finish", { reason: "Nothing left to fill in" }),
    );

    const timing = result.notes.at(-1) ?? "";
    expect(timing.startsWith("[apply] timing ")).toBe(true);
    expect(timing).toContain("read=");
    expect(timing).toContain("fill=");
    expect(timing).toMatch(/model=\d+ turns/u);
    expect(timing).toContain("total=");
  });
});

/**
 * Who gets asked what.
 *
 * Equal-opportunity and other voluntary declarations are the person's own and
 * optional by the site: they are left blank and said so, never put in front of
 * the person as a question they have to clear.
 */

/**
 * A field is written once.
 *
 * Thirty-three writes for fourteen fields is the run re-doing work it has
 * already done, and every one of those costs the person a second.
 */
describe("no field is written twice", () => {
  test("a control already holding its sourced answer is left alone", async () => {
    const already = {
      ...nameControl(),
      index: 0,
      label: "First Name",
      value: "Robin",
    };
    const result = await runApplyAgent(
      config(page({ controls: [already] })),
      repeatingModel("finish", { reason: "Nothing left to fill in" }),
    );

    expect(result.filled).toHaveLength(0);
  });

  test("each turn the model takes is written down", async () => {
    const result = await runApplyAgent(
      config(page()),
      repeatingModel("finish", { reason: "Nothing left to fill in" }),
    );

    expect(result.notes.some((note) => note.startsWith("turn 1: "))).toBe(true);
  });

  test("blocks a second successful write to the same control on the same page", async () => {
    const result = await runApplyAgent(
      config(page()),
      scriptedModel([
        { name: "type", args: { ref: "c0", text: "Robin Ashford" } },
        { name: "type", args: { ref: "c0", text: "Robin Ashford" } },
        { name: "finish", args: { reason: "The form is prepared" } },
      ]),
    );

    expect(result.filled).toHaveLength(1);
    expect(result.notes.join("\n")).toContain(
      "That exact field was already completed",
    );
  });
});

describe("only meaningful page movement counts as progress", () => {
  test("repeated scrolling cannot keep a stuck run alive", async () => {
    const result = await runApplyAgent(
      config(page(), {
        runControl: { noProgressStepLimit: 3, maxSteps: 20 },
      }),
      repeatingModel("scroll", { direction: "down" }),
    );

    expect(result.outcome).toBe("stuck");
    expect(result.reason).toContain("nothing new happened");
    expect(result.steps).toBeLessThan(20);
  });
});

describe("the browser failing underneath a step", () => {
  test("one failure is handed back to the model as a fact, and the run carries on", async () => {
    const source = page();
    const base = hands(source);
    let reads = 0;
    const flakyHands: ApplyPageHands = {
      ...base,
      // The very first read after the click dies the way a navigation kills
      // it; the read after that sees the new page.
      observe: () => {
        reads += 1;
        if (reads === 2) {
          return Promise.reject(
            new Error(
              "The page moved to a new address while Job Finder was reading it.",
            ),
          );
        }
        return base.observe();
      },
    };
    const result = await runApplyAgent(
      config(source, { hands: flakyHands }),
      scriptedModel([
        { name: "observe", args: {} },
        {
          name: "finish",
          args: { reason: "The page moved on and the form is here now" },
        },
      ]),
    );

    expect(result.outcome).toBe("prepared");
    expect(result.notes.join("\n")).toContain("browser failure");
    expect(result.notes.join("\n")).toContain("moved to a new address");
  });

  test("the browser failing three times in a row ends the run in plain words", async () => {
    const source = page();
    const base = hands(source);
    let reads = 0;
    const deadHands: ApplyPageHands = {
      ...base,
      observe: () => {
        reads += 1;
        return reads === 1
          ? base.observe()
          : Promise.reject(
              new Error(
                "The browser tab Job Finder was working in was closed.",
              ),
            );
      },
    };
    const result = await runApplyAgent(
      config(source, { hands: deadHands }),
      repeatingModel("observe", {}),
    );

    expect(result.outcome).toBe("stuck");
    expect(result.reason).toContain("the browser page stopped responding");
    expect(result.reason).toContain("was closed");
    expect(result.reason).not.toContain("locator");
  });
});

describe("shared navigation and Apply safety stay in one state", () => {
  test("a send allowlist does not block an employer handoff approved by the move reviewer", async () => {
    const source = page();
    const base = hands(source);
    let navigations = 0;
    let reviews = 0;
    const result = await runApplyAgent(
      config(source, {
        hands: {
          ...base,
          navigate: (url) => {
            navigations += 1;
            return Promise.resolve({ ok: true, url });
          },
        },
        authority: {
          mode: "prepare_only",
          submitAuthorized: false,
          preApprovedAttestationKinds: [],
          salaryDisclosure: "pause_for_user",
          allowedOrigins: ["https://apply.example.test"],
        },
        reviewMove: () => {
          reviews += 1;
          return Promise.resolve({ allowed: true, verdict: "Looks relevant." });
        },
      }),
      scriptedModel([
        {
          name: "navigate",
          args: {
            url: "https://forbidden.example/form",
            reason: "The form is there.",
          },
        },
        { name: "finish", args: { reason: "Stayed on the allowed site" } },
      ]),
    );

    expect(result.outcome).toBe("prepared");
    expect(navigations).toBe(1);
    expect(reviews).toBe(1);
  });

  test("navigate then type uses the page the model just saw and reviews the move once", async () => {
    let current = page();
    let reviews = 0;
    const base = hands(current);
    const dynamicHands: ApplyPageHands = {
      ...base,
      observe: () =>
        Promise.resolve(
          buildApplyFormObservation(current, "2026-09-14T10:00:00.000Z"),
        ),
      navigate: (url) => {
        current = page({ url, title: "External application" });
        return Promise.resolve({ ok: true, url });
      },
    };
    const result = await runApplyAgent(
      config(current, {
        hands: dynamicHands,
        reviewMove: () => {
          reviews += 1;
          return Promise.resolve({
            allowed: true,
            verdict: "This is the employer form.",
          });
        },
      }),
      scriptedModel([
        {
          name: "navigate",
          args: {
            url: "https://employer.example/form",
            reason: "The listing points to the employer application form.",
          },
        },
        { name: "type", args: { ref: "c0", text: "Robin Ashford" } },
        { name: "finish", args: { reason: "The form is prepared" } },
      ]),
    );

    expect(result.outcome).toBe("prepared");
    expect(result.filled).toHaveLength(1);
    expect(result.notes.join("\n")).not.toContain(
      "page changed since you last looked",
    );
    expect(reviews).toBe(1);
  });

  test("a move approved by a guarded click is reused by shared navigation", async () => {
    let current = page({
      actions: [{ index: 0, label: "Apply", visible: true, disabled: false }],
    });
    let reviews = 0;
    const base = hands(current);
    const dynamicHands: ApplyPageHands = {
      ...base,
      observe: () =>
        Promise.resolve(
          buildApplyFormObservation(current, "2026-09-14T10:00:00.000Z"),
        ),
      clickElement: () => {
        current = page({ url: "https://employer.example/form" });
        return Promise.resolve({ ok: true, observedValue: "clicked" });
      },
      navigate: (url) => {
        current = page({ url });
        return Promise.resolve({ ok: true, url });
      },
    };
    const result = await runApplyAgent(
      config(current, {
        hands: dynamicHands,
        reviewMove: () => {
          reviews += 1;
          return Promise.resolve({
            allowed: true,
            verdict: "This is the employer form.",
          });
        },
      }),
      scriptedModel([
        {
          name: "click",
          args: {
            ref: "a0",
            reason: "The listing's Apply button leads to the employer form.",
          },
        },
        {
          name: "navigate",
          args: {
            url: "https://employer.example/form/step-two",
            reason: "The next application step is on the same employer site.",
          },
        },
        { name: "finish", args: { reason: "The employer form is prepared" } },
      ]),
    );

    expect(result.outcome).toBe("prepared");
    expect(reviews).toBe(1);
  });
});
