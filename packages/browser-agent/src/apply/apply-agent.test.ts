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
    validationErrors: [],
    stepLabel: null,
    ...overrides,
  };
}

function hands(source: RawApplyPage): ApplyPageHands {
  return {
    observe: () =>
      Promise.resolve(buildApplyFormObservation(source, "2026-09-14T10:00:00.000Z")),
    fillText: (_ref, value) => Promise.resolve({ ok: true, observedValue: value }),
    chooseOption: (_ref, option) => Promise.resolve({ ok: true, observedValue: option }),
    setToggle: () => Promise.resolve({ ok: true, observedValue: "checked" }),
    uploadFile: (_ref, file) => Promise.resolve({ ok: true, observedValue: file.name }),
    clickAction: () => Promise.resolve({ ok: true, observedValue: "clicked" }),
    followLink: () => Promise.resolve({ ok: true, url: "https://apply.example.test/form" }),
  };
}

function config(source: RawApplyPage, overrides: Partial<ApplyAgentConfig> = {}): ApplyAgentConfig {
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

function repeatingModel(name: string, args: Record<string, unknown>): LLMClient {
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

describe("apply agent run endings", () => {
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
    expect(result.reason).toContain("nothing was sent");
  });

  test("a page that wants a sign-in stops before the loop starts", async () => {
    const result = await runApplyAgent(
      config(page({ bodyText: "You must be signed in to apply" })),
      repeatingModel("inspect_form", {}),
    );

    expect(result.outcome).toBe("paused");
    expect(result.pauses[0]?.blocker?.code).toBe("site_login_required");
    expect(result.steps).toBe(0);
  });

  test("a listing is followed to the form, and the hop is in the trail", async () => {
    let onForm = false;
    const listing: RawApplyPage = page({
      url: "https://board.example.test/job/events-manager",
      controls: [],
      actions: [],
      links: [
        {
          index: 0,
          label: "Apply now",
          href: "https://employer.example.test/careers/apply",
          target: "",
          visible: true,
          topOffset: 180,
        },
      ],
    });
    const form = page({ url: "https://employer.example.test/careers/apply" });
    const source = (): RawApplyPage => (onForm ? form : listing);

    const result = await runApplyAgent(
      config(listing, {
        hands: {
          ...hands(listing),
          observe: () =>
            Promise.resolve(
              buildApplyFormObservation(source(), "2026-09-14T10:00:00.000Z"),
            ),
          followLink: () => {
            onForm = true;
            return Promise.resolve({
              ok: true,
              url: "https://employer.example.test/careers/apply",
            });
          },
        },
      }),
      repeatingModel("finish", { reason: "Nothing left to fill in" }),
    );

    expect(result.outcome).toBe("prepared");
    expect(result.notes[0]).toBe(
      'Followed "Apply now" to employer.example.test.',
    );
    expect(result.finalUrl).toBe("https://employer.example.test/careers/apply");
  });

  test("a listing with no way in stops with a sentence, not a shrug", async () => {
    const result = await runApplyAgent(
      config(page({ controls: [], actions: [], links: [] })),
      repeatingModel("inspect_form", {}),
    );

    expect(result.outcome).toBe("paused");
    expect(result.reason).toBe(
      "This listing has no apply link; the job may be closed or the employer takes applications elsewhere.",
    );
    expect(result.pauses[0]?.blocker?.code).toBe("application_page_unreachable");
    expect(result.steps).toBe(0);
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
describe("questions the person has to answer", () => {
  // A list of choices, so nothing in the profile can answer it and no text
  // can be written for it: exactly the question that needs the person.
  function question(index: number, label: string): RawApplyControl {
    return {
      ...nameControl(),
      index,
      tagName: "select",
      inputType: "select-one",
      id: `q${index}`,
      name: `q${index}`,
      label,
      required: false,
      options: ["Yes", "No"],
    };
  }

  function modelThatAnswersEachThenFinishes(refs: readonly string[]): LLMClient {
    let call = 0;
    return {
      chatWithTools: () => {
        const name = call < refs.length ? "answer_control" : "finish";
        const args =
          call < refs.length
            ? { ref: refs[call] }
            : { reason: "Nothing left to fill in" };
        call += 1;
        return Promise.resolve({
          toolCalls: [
            {
              id: `call_${call}`,
              type: "function" as const,
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        });
      },
    };
  }

  test("three questions nothing can answer come back in one pause", async () => {
    const result = await runApplyAgent(
      config(
        page({
          controls: [
            question(0, "How did you hear about this role?"),
            question(1, "Have you previously worked at or consulted for us?"),
            question(2, "What is your notice period in weeks?"),
          ],
        }),
      ),
      modelThatAnswersEachThenFinishes(["c0", "c1", "c2"]),
    );

    expect(result.outcome).toBe("paused");
    expect(result.pauses).toHaveLength(1);
    const pause = result.pauses[0];
    expect(pause?.questions).toHaveLength(3);
    expect(pause?.questions?.map((entry) => entry.prompt)).toEqual([
      "How did you hear about this role?",
      "Have you previously worked at or consulted for us?",
      "What is your notice period in weeks?",
    ]);
    // The single question is still there for anything that reads one.
    expect(pause?.question?.prompt).toBe("How did you hear about this role?");
    expect(result.reason).toContain("3 questions");
  });

  test("a required question the next screen needs stops the form on its own", async () => {
    const blocking = {
      ...question(1, "Have you previously worked at or consulted for us?"),
      required: true,
    };
    let call = 0;
    const model: LLMClient = {
      chatWithTools: () => {
        call += 1;
        const name = call === 1 ? "answer_control" : "go_to_step";
        const args = call === 1 ? { ref: "c1" } : { ref: "a0" };
        return Promise.resolve({
          toolCalls: [
            {
              id: `call_${call}`,
              type: "function" as const,
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        });
      },
    };

    const result = await runApplyAgent(
      config(
        page({
          controls: [nameControl(), blocking],
          actions: [
            { index: 0, label: "Continue", visible: true, disabled: false },
          ],
          stepLabel: "Step 1 of 3",
        }),
      ),
      model,
    );

    expect(result.outcome).toBe("paused");
    expect(result.pauses).toHaveLength(1);
    expect(result.pauses[0]?.questions).toHaveLength(1);
    expect(result.pauses[0]?.summary).toContain("before this form will go on");
  });
});

/**
 * The form as a live board actually renders it.
 *
 * Read off a real posting: a phone country picker beside a phone number field,
 * both labelled Phone; a file field labelled "Attach"; yes/no questions drawn
 * as comboboxes; country lists; and hidden inputs that belong to the widgets
 * rather than to the person. Ten of these are answered from the person's own
 * profile, so the model is asked about the rest and nothing else.
 */
describe("a form shaped like the real thing", () => {
  function field(
    index: number,
    overrides: Partial<RawApplyControl>,
  ): RawApplyControl {
    return { ...nameControl(), index, id: `f${index}`, name: `f${index}`, ...overrides };
  }

  function realisticPage(): RawApplyPage {
    return page({
      url: "https://apply.example.test/example/jobs/8463917002",
      controls: [
        field(0, { label: "First Name", required: true }),
        field(1, { label: "Last Name", required: true }),
        field(2, { label: "Email", inputType: "email", required: true }),
        field(3, {
          tagName: "input",
          role: "combobox",
          inputType: "combobox",
          label: "Country",
          groupLabel: "Phone",
          options: ["United States +1", "United Kingdom +44"],
        }),
        field(4, {
          tagName: "input",
          role: "combobox",
          inputType: "combobox",
          label: "Search",
          groupLabel: "Phone",
          visible: false,
          options: ["United States +1", "United Kingdom +44"],
        }),
        field(5, { label: "Phone", groupLabel: "Phone", inputType: "tel" }),
        field(6, {
          inputType: "file",
          label: "Attach",
          groupLabel: "Resume/CV*",
        }),
        field(7, { label: "LinkedIn Profile", required: true }),
        field(8, {
          label: "What's the name you'd prefer us to use?",
        }),
        field(9, {
          tagName: "input",
          role: "combobox",
          inputType: "combobox",
          label: "What is your current country of residence?*",
          required: true,
          options: ["United States of America", "United Kingdom"],
        }),
        field(10, {
          tagName: "input",
          role: "combobox",
          inputType: "combobox",
          label: "Have you previously worked at or consulted for us?*",
          required: true,
          options: ["Yes", "No"],
        }),
        field(11, {
          tagName: "input",
          role: "combobox",
          inputType: "combobox",
          label: "Gender",
          options: ["Male", "Female", "Decline To Self Identify"],
        }),
        field(12, {
          tagName: "textarea",
          inputType: "textarea",
          label: "",
          visible: false,
        }),
      ],
      actions: [
        { index: 0, label: "Submit application", visible: true, disabled: false },
      ],
    });
  }

  function countingModel(): { client: LLMClient; turns: () => number } {
    let calls = 0;
    return {
      turns: () => calls,
      client: {
        chatWithTools: () => {
          calls += 1;
          return Promise.resolve({
            toolCalls: [
              {
                id: `call_${calls}`,
                type: "function" as const,
                function: {
                  name: "finish",
                  arguments: JSON.stringify({
                    reason: "Nothing left that I can fill in",
                  }),
                },
              },
            ],
          });
        },
      },
    };
  }

  test("what the profile answers is written without asking the model", async () => {
    const source = realisticPage();
    const model = countingModel();
    const withPhone = config(source);
    const result = await runApplyAgent(
      {
        ...withPhone,
        sources: {
          ...withPhone.sources,
          profile: {
            ...withPhone.sources.profile,
            email: "robin.ashford@example.test",
            phone: "+1 312 555 0100",
            currentCountry: "United States",
          },
        },
      },
      model.client,
    );

    // Names, email, phone country, phone number, preferred name, country of
    // residence: all of them from the person's own profile, no model turn each.
    expect(result.filled.length).toBeGreaterThanOrEqual(6);
    // One turn to decide there is nothing left. Before this pass it was one
    // turn per field.
    expect(model.turns()).toBeLessThanOrEqual(4);
    // The hidden machinery of the widgets is never touched.
    expect(
      result.filled.some((entry) => entry.label.includes("Search")),
    ).toBe(false);
  });
});

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

  test("a choice nothing can answer never costs a model turn", async () => {
    let turns = 0;
    const model: LLMClient = {
      chatWithTools: () => {
        turns += 1;
        return Promise.resolve({
          toolCalls: [
            {
              id: `call_${turns}`,
              type: "function" as const,
              function: {
                name: "finish",
                arguments: JSON.stringify({ reason: "Nothing left" }),
              },
            },
          ],
        });
      },
    };

    const result = await runApplyAgent(
      config(
        page({
          controls: [
            nameControl(),
            {
              ...nameControl(),
              index: 1,
              id: "q1",
              name: "q1",
              tagName: "select",
              inputType: "select-one",
              label: "Have you previously worked at or consulted for us?",
              options: ["Yes", "No"],
            },
            {
              ...nameControl(),
              index: 2,
              id: "q2",
              name: "q2",
              tagName: "select",
              inputType: "select-one",
              label: "Are you located in Bangalore, India?",
              options: ["Yes", "No"],
            },
          ],
        }),
      ),
      model,
    );

    expect(result.outcome).toBe("paused");
    expect(result.pauses[0]?.questions).toHaveLength(2);
    // Both questions were collected deterministically: one turn, to finish.
    expect(turns).toBe(1);
  });
});

/**
 * Who gets asked what.
 *
 * Equal-opportunity and other voluntary declarations are the person's own and
 * optional by the site: they are left blank and said so, never put in front of
 * the person as a question they have to clear.
 */
describe("voluntary declarations", () => {
  function choice(
    index: number,
    label: string,
    required = false,
  ): RawApplyControl {
    return {
      ...nameControl(),
      index,
      id: `q${index}`,
      name: `q${index}`,
      tagName: "select",
      inputType: "select-one",
      label,
      required,
      options: ["Yes", "No", "Decline To Self Identify"],
    };
  }

  test("self-identification questions are left blank, not asked", async () => {
    const result = await runApplyAgent(
      config(
        page({
          controls: [
            nameControl(),
            choice(1, "Gender"),
            choice(2, "Are you Hispanic/Latino?"),
            choice(3, "Veteran Status"),
            choice(4, "Disability Status"),
            choice(5, "Are you located in Bangalore, India?"),
          ],
        }),
      ),
      repeatingModel("finish", { reason: "Nothing left to fill in" }),
    );

    expect(result.outcome).toBe("paused");
    const asked = result.pauses[0]?.questions ?? [];
    expect(asked.map((question) => question.prompt)).toEqual([
      "Are you located in Bangalore, India?",
    ]);
    expect(result.notes).toContain(
      "Left the voluntary self-identification questions blank. They are yours to answer if you want to.",
    );
  });

  test("a required declaration the policy does not cover still stops the run", async () => {
    const result = await runApplyAgent(
      config(
        page({
          controls: [
            nameControl(),
            {
              ...choice(1, "I certify that the information I have given is true", true),
              tagName: "input",
              inputType: "checkbox",
              options: [],
            },
          ],
        }),
      ),
      repeatingModel("finish", { reason: "Nothing left to fill in" }),
    );

    expect(result.outcome).toBe("paused");
    expect(result.pauses[0]?.questions?.[0]?.prompt).toContain("I certify");
  });
});

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
});
