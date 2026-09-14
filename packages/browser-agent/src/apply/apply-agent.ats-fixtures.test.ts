import { CandidateProfileSchema, type CandidateProfile } from "@unemployed/contracts";
import { describe, expect, test } from "vitest";

import type { LLMClient } from "../agent/contracts";
import type { ToolCall } from "../types";
import { runApplyAgent } from "./apply-agent";
import type { RawApplyControl, RawApplyPage } from "@unemployed/contracts";
import { buildApplyFormObservation } from "./page-hands";
import type { ApplyWriteResult } from "@unemployed/contracts";
import type {
  ApplyAgentConfig,
  ApplyDocument,
  ApplyFormObservation,
  ApplyPageHands,
} from "./types";

/**
 * Five application forms shaped like the families people actually meet.
 *
 * None of these fixtures is wired into shipped code: they exist to prove the
 * loop reads an unfamiliar form, fills it from the person's own facts, moves
 * through several screens, and stops before sending. There is no per-family
 * branch anywhere in the code under test.
 */

interface FixtureControl {
  label: string;
  groupLabel?: string;
  tagName?: "input" | "textarea" | "select" | "contenteditable";
  inputType?: string;
  role?: string;
  required?: boolean;
  options?: string[];
  value?: string;
  checked?: boolean;
}

interface FixtureScreen {
  stepLabel?: string;
  bodyText?: string;
  controls: FixtureControl[];
  actions: string[];
}

interface FixtureForm {
  url: string;
  title: string;
  screens: FixtureScreen[];
}

interface FixtureState {
  screenIndex: number;
  values: Map<string, string>;
  checked: Map<string, boolean>;
  observations: ApplyFormObservation[];
  clicks: string[];
}

function controlKey(screenIndex: number, controlIndex: number): string {
  return `${screenIndex}:${controlIndex}`;
}

function toRawControl(
  control: FixtureControl,
  index: number,
  screenIndex: number,
  state: FixtureState,
): RawApplyControl {
  const key = controlKey(screenIndex, index);
  const tagName = control.tagName ?? "input";
  const value = state.values.get(key) ?? control.value ?? "";
  return {
    index,
    tagName,
    inputType: control.inputType ?? (tagName === "select" ? "select" : "text"),
    role: control.role ?? "",
    id: `field_${index}`,
    name: `field_${index}`,
    label: control.label,
    groupLabel: control.groupLabel ?? "",
    placeholder: "",
    autocomplete: "",
    required: control.required ?? false,
    invalid: false,
    validationMessage: "",
    disabled: false,
    readOnly: false,
    visible: true,
    value,
    checked: state.checked.get(key) ?? control.checked ?? false,
    multiple: false,
    options: control.options ?? [],
    selectedOptionLabel: control.options ? value : "",
  };
}

function buildRawPage(form: FixtureForm, state: FixtureState): RawApplyPage {
  const screen = form.screens[state.screenIndex];
  if (!screen) {
    throw new Error(`Fixture has no screen ${state.screenIndex}`);
  }
  return {
    url: form.url,
    title: form.title,
    bodyText: screen.bodyText ?? `${form.title} ${screen.stepLabel ?? ""}`,
    controls: screen.controls.map((control, index) =>
      toRawControl(control, index, state.screenIndex, state),
    ),
    actions: screen.actions.map((label, index) => ({
      index,
      label,
      visible: true,
      disabled: false,
    })),
    validationErrors: [],
    stepLabel: screen.stepLabel ?? null,
  };
}

function createFixtureHands(form: FixtureForm): {
  hands: ApplyPageHands;
  state: FixtureState;
} {
  const state: FixtureState = {
    screenIndex: 0,
    values: new Map(),
    checked: new Map(),
    observations: [],
    clicks: [],
  };

  const refIndex = (ref: string): number => Number.parseInt(ref.slice(1), 10);

  const observe = (): Promise<ApplyFormObservation> => {
    const observation = buildApplyFormObservation(
      buildRawPage(form, state),
      "2026-09-14T10:00:00.000Z",
    );
    state.observations.push(observation);
    return Promise.resolve(observation);
  };

  const hands: ApplyPageHands = {
    observe,
    fillText: (ref, value): Promise<ApplyWriteResult> => {
      state.values.set(controlKey(state.screenIndex, refIndex(ref)), value);
      return Promise.resolve({ ok: true, observedValue: value });
    },
    chooseOption: (ref, optionLabel): Promise<ApplyWriteResult> => {
      state.values.set(controlKey(state.screenIndex, refIndex(ref)), optionLabel);
      return Promise.resolve({ ok: true, observedValue: optionLabel });
    },
    setToggle: (ref, checked): Promise<ApplyWriteResult> => {
      state.checked.set(controlKey(state.screenIndex, refIndex(ref)), checked);
      return Promise.resolve({ ok: true, observedValue: checked ? "checked" : "unchecked" });
    },
    uploadFile: (ref, file): Promise<ApplyWriteResult> => {
      state.values.set(controlKey(state.screenIndex, refIndex(ref)), file.name);
      return Promise.resolve({ ok: true, observedValue: file.name });
    },
    clickAction: (ref): Promise<ApplyWriteResult> => {
      const screen = form.screens[state.screenIndex];
      const label = screen?.actions[refIndex(ref)] ?? "";
      state.clicks.push(label);
      if (/next|continue|review|proceed/iu.test(label)) {
        state.screenIndex = Math.min(state.screenIndex + 1, form.screens.length - 1);
      }
      if (/back|previous/iu.test(label)) {
        state.screenIndex = Math.max(state.screenIndex - 1, 0);
      }
      return Promise.resolve({ ok: true, observedValue: "clicked" });
    },
  };

  return { hands, state };
}

/**
 * A stand-in for the model that reads the same observation the real one gets.
 *
 * It does the obvious thing: work through the fields that still need an
 * answer, attach the resume when the form asks for a file, move on when the
 * screen is done, and finish at the end.
 */
function createFixtureModel(state: FixtureState, resumeDocumentId: string): LLMClient {
  let callId = 0;
  const attempted = new Set<string>();

  const nextCall = (name: string, args: Record<string, unknown>): ToolCall => {
    callId += 1;
    return {
      id: `call_${callId}`,
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    };
  };

  const decide = (): { toolCalls: ToolCall[] } => {
      const observation = state.observations.at(-1);
      if (!observation) {
        return { toolCalls: [nextCall("inspect_form", {})] };
      }

      const pending = observation.controls.find(
        (control) =>
          control.visible &&
          !control.disabled &&
          !control.readOnly &&
          !control.answered &&
          !attempted.has(`${observation.signature}:${control.ref}`),
      );
      if (pending) {
        attempted.add(`${observation.signature}:${pending.ref}`);
        if (pending.kind === "file") {
          return {
            toolCalls: [
              nextCall("attach_document", {
                ref: pending.ref,
                documentId: resumeDocumentId,
              }),
            ],
          };
        }
        return {
          toolCalls: [
            nextCall("answer_control", {
              ref: pending.ref,
              freeTextAnswer:
                "I have spent eight years building reliable automation and would bring that to this team.",
              groundedIn: ["the resume sent with this application", "the posting"],
            }),
          ],
        };
      }

      const advance = observation.actions.find(
        (action) => action.kind === "advance" && action.visible && !action.disabled,
      );
      if (advance && !attempted.has(`${observation.signature}:${advance.ref}`)) {
        attempted.add(`${observation.signature}:${advance.ref}`);
        return { toolCalls: [nextCall("go_to_step", { ref: advance.ref })] };
      }

      const send = observation.actions.find((action) => action.kind === "final");
      if (send && !attempted.has(`${observation.signature}:${send.ref}`)) {
        attempted.add(`${observation.signature}:${send.ref}`);
        return { toolCalls: [nextCall("submit_application", { ref: send.ref })] };
      }

    return {
      toolCalls: [
        nextCall("finish", { reason: "Every field on the form has an answer." }),
      ],
    };
  };

  return { chatWithTools: () => Promise.resolve(decide()) };
}

function createTestProfile(): CandidateProfile {
  return CandidateProfileSchema.parse({
    id: "candidate_test",
    firstName: "Robin",
    lastName: "Ashford",
    fullName: "Robin Ashford",
    headline: "Platform engineer",
    summary: "Builds dependable internal tools.",
    currentLocation: "Manchester, United Kingdom",
    currentCity: "Manchester",
    currentCountry: "United Kingdom",
    yearsExperience: 8,
    email: "robin.ashford@example.test",
    phone: "+44 7700 900123",
    portfolioUrl: "https://portfolio.example.test/robin",
    baseResume: {
      id: "resume_test",
      fileName: "resume.txt",
      uploadedAt: "2026-09-01T09:00:00.000Z",
      textContent: "8 years of platform engineering.",
      textUpdatedAt: "2026-09-01T09:00:00.000Z",
      extractionStatus: "ready",
    },
    workEligibility: {
      authorizedWorkCountries: ["United Kingdom"],
      requiresVisaSponsorship: false,
      willingToRelocate: true,
      willingToTravel: true,
      noticePeriodDays: 30,
      availableStartDate: "2026-11-01",
    },
    answerBank: {
      workAuthorization: "Yes",
      visaSponsorship: "No",
      relocation: "Yes",
      customAnswers: [
        {
          id: "saved_1",
          kind: "other",
          label: "Why this company",
          question: "Why do you want to work here?",
          answer: "Your platform work is the kind of problem I have spent my career on.",
        },
      ],
    },
  });
}

function createResumeDocument(): ApplyDocument {
  return {
    id: "document_resume",
    fileName: "robin-ashford-resume.pdf",
    mimeType: "application/pdf",
    label: "Your CV",
    kind: "resume",
    loadBytes: () => Promise.resolve(new Uint8Array([37, 80, 68, 70])),
  };
}

function createConfig(form: FixtureForm, siteLabel: string): {
  config: ApplyAgentConfig;
  state: FixtureState;
} {
  const { hands, state } = createFixtureHands(form);
  const config: ApplyAgentConfig = {
    hands,
    authority: {
      mode: "prepare_only",
      submitAuthorized: false,
      preApprovedAttestationKinds: [],
      salaryDisclosure: "pause_for_user",
      allowedOrigins: [],
    },
    sources: {
      profile: createTestProfile(),
      resumeText: "Robin Ashford. 8 years of platform engineering.",
      posting: {
        title: "Platform Engineer",
        company: "Northwind Tools",
        location: "Manchester, United Kingdom",
        description: "Own the internal platform.",
      },
      reusableAnswers: createTestProfile().answerBank.customAnswers,
      documents: [createResumeDocument()],
    },
    application: {
      jobId: "job_test",
      applicationId: "application_test",
      startingUrl: form.url,
    },
    siteLabel,
    runControl: { maxSteps: 60, noProgressStepLimit: 6 },
    now: () => new Date("2026-09-14T10:00:00.000Z"),
  };
  return { config, state };
}

const cardStyleForm: FixtureForm = {
  url: "https://boards.example-greenhouse.test/northwind/jobs/1",
  title: "Platform Engineer — Northwind Tools",
  screens: [
    {
      controls: [
        { label: "First Name", required: true },
        { label: "Last Name", required: true },
        { label: "Email", inputType: "email", required: true },
        { label: "Phone", inputType: "tel" },
        { label: "Resume/CV", inputType: "file", required: true },
        {
          label: "Are you legally authorized to work in the United Kingdom?",
          tagName: "select",
          options: ["Yes", "No"],
          required: true,
        },
        {
          label: "Will you now or in the future require sponsorship?",
          tagName: "select",
          options: ["Yes", "No"],
          required: true,
        },
      ],
      actions: ["Submit Application"],
    },
  ],
};

const postingStyleForm: FixtureForm = {
  url: "https://jobs.example-lever.test/northwind/2/apply",
  title: "Apply — Platform Engineer",
  screens: [
    {
      controls: [
        { label: "Full name", required: true },
        { label: "Email", inputType: "email", required: true },
        { label: "Current location", required: true },
        { label: "Resume", inputType: "file", required: true },
        { label: "Portfolio or personal website" },
        {
          label: "Why do you want to work here?",
          tagName: "textarea",
          required: true,
        },
      ],
      actions: ["Submit application"],
    },
  ],
};

const multiScreenForm: FixtureForm = {
  url: "https://northwind.example-workday.test/apply",
  title: "Northwind Careers",
  screens: [
    {
      stepLabel: "Step 1 of 3 — My Information",
      controls: [
        { label: "First Name", required: true },
        { label: "Last Name", required: true },
        { label: "Country", tagName: "select", options: ["United Kingdom", "Ireland"], required: true },
        { label: "City", required: true },
      ],
      actions: ["Back", "Next"],
    },
    {
      stepLabel: "Step 2 of 3 — My Experience",
      controls: [
        { label: "Resume", inputType: "file", required: true },
        { label: "Years of experience", required: true },
        { label: "Are you willing to relocate?", tagName: "select", options: ["Yes", "No"] },
      ],
      actions: ["Back", "Next"],
    },
    {
      stepLabel: "Step 3 of 3 — Review",
      controls: [{ label: "Notice period", required: true }],
      actions: ["Back", "Submit"],
    },
  ],
};

const compactForm: FixtureForm = {
  url: "https://jobs.example-ashby.test/northwind/application",
  title: "Northwind Tools — Application",
  screens: [
    {
      controls: [
        { label: "Name", required: true },
        { label: "Email", inputType: "email", required: true },
        { label: "Resume", inputType: "file", required: true },
        {
          label: "When can you start?",
          required: true,
        },
        {
          label: "Are you authorized to work in the United Kingdom?",
          role: "radio",
          inputType: "radio",
          groupLabel: "Work authorisation",
        },
      ],
      actions: ["Submit application"],
    },
  ],
};

const modalForm: FixtureForm = {
  url: "https://www.example-network.test/jobs/view/3",
  title: "Platform Engineer | Northwind Tools",
  screens: [
    {
      stepLabel: "1/2",
      bodyText: "Apply to Northwind Tools 1/2 Contact info",
      controls: [
        { label: "Email address", inputType: "email", required: true },
        { label: "Mobile phone number", inputType: "tel", required: true },
        { label: "Resume", inputType: "file", required: true },
      ],
      actions: ["Next"],
    },
    {
      stepLabel: "2/2",
      bodyText: "Apply to Northwind Tools 2/2 Additional questions",
      controls: [
        {
          label: "How many years of experience do you have with platform engineering?",
          required: true,
        },
        {
          label: "Are you comfortable with occasional travel?",
          tagName: "select",
          options: ["Yes", "No"],
          required: true,
        },
      ],
      actions: ["Back", "Submit application"],
    },
  ],
};

const FAMILIES: ReadonlyArray<readonly [string, FixtureForm, string]> = [
  ["a card-style board", cardStyleForm, "Greenhouse"],
  ["a posting-style board", postingStyleForm, "Lever"],
  ["a multi-screen career site", multiScreenForm, "the Northwind careers site"],
  ["a compact single-page form", compactForm, "Ashby"],
  ["an in-page modal", modalForm, "the network site"],
];

describe("apply agent across application form families", () => {
  for (const [description, form, siteLabel] of FAMILIES) {
    test(`fills ${description} and stops before sending`, async () => {
      const { config, state } = createConfig(form, siteLabel);
      const result = await runApplyAgent(
        config,
        createFixtureModel(state, "document_resume"),
      );

      expect(result.outcome).toBe("prepared");
      expect(result.filled.length).toBeGreaterThan(0);
      expect(result.attachments).toHaveLength(1);
      expect(result.pauses).toHaveLength(0);

      // Nothing that sends the application was ever pressed.
      expect(
        state.clicks.filter((label) => /submit|send/iu.test(label)),
      ).toHaveLength(0);

      // Every answer says where it came from.
      for (const entry of result.filled) {
        expect(entry.answer.provenanceLabel.length).toBeGreaterThan(0);
        expect(entry.answer.groundedIn.length).toBeGreaterThan(0);
      }

      // The final screen has no required field left empty.
      const last = state.observations.at(-1);
      expect(last).toBeDefined();
      expect(
        last?.controls.filter((control) => control.required && !control.answered),
      ).toHaveLength(0);
    });
  }

  test("the multi-screen form is walked screen by screen", async () => {
    const { config, state } = createConfig(multiScreenForm, "the careers site");
    const result = await runApplyAgent(
      config,
      createFixtureModel(state, "document_resume"),
    );

    expect(result.outcome).toBe("prepared");
    expect(state.screenIndex).toBe(2);
    expect(state.clicks.filter((label) => label === "Next")).toHaveLength(2);
  });
});

describe("what each mode does with the same finished form", () => {
  /** A single-screen form that a run can genuinely complete. */
  const completableForm: FixtureForm = {
    url: "https://apply.example.test/northwind/apply",
    title: "Platform Engineer — Northwind Tools",
    screens: [
      {
        controls: [
          { label: "Full name", required: true },
          { label: "Email", inputType: "email", required: true },
          { label: "Resume", inputType: "file", required: true },
        ],
        actions: ["Submit application"],
      },
    ],
  };

  async function runInMode(
    mode: "prepare_only" | "confirm_before_submit" | "autonomous_submit",
  ) {
    const { config, state } = createConfig(completableForm, "Northwind careers");
    const authority: ApplyAgentConfig["authority"] = {
      mode,
      submitAuthorized: mode === "autonomous_submit",
      preApprovedAttestationKinds: [],
      salaryDisclosure: "pause_for_user",
      allowedOrigins: [],
    };
    const result = await runApplyAgent(
      { ...config, authority },
      createFixtureModel(state, "document_resume"),
    );
    return { result, state };
  }

  test("fill-in-only finishes prepared and never finds a send button to press", async () => {
    const { result, state } = await runInMode("prepare_only");
    expect(result.outcome).toBe("prepared");
    expect(result.readyToSend).toBeNull();
    expect(state.clicks).toHaveLength(0);
  });

  test("confirm-first ends waiting for the person, with nothing pressed", async () => {
    const { result, state } = await runInMode("confirm_before_submit");
    expect(result.outcome).toBe("awaiting_your_review");
    expect(result.reason).toContain("ready for you to look over");
    expect(state.clicks).toHaveLength(0);
  });

  test("sending on its own reports the form ready and still presses nothing", async () => {
    const { result, state } = await runInMode("autonomous_submit");
    expect(result.outcome).toBe("ready_to_send");
    expect(result.readyToSend).toEqual({
      actionRef: "a0",
      actionLabel: "Submit application",
    });
    // The loop identifies the button; the submission path is what presses it.
    expect(state.clicks).toHaveLength(0);
  });

  test("every mode filled the same form the same way", async () => {
    const prepared = await runInMode("prepare_only");
    const sending = await runInMode("autonomous_submit");
    expect(prepared.result.filled.map((entry) => entry.label)).toEqual(
      sending.result.filled.map((entry) => entry.label),
    );
    expect(prepared.result.attachments).toHaveLength(1);
    expect(sending.result.attachments).toHaveLength(1);
  });
});
