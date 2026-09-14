import { CandidateProfileSchema, type CandidateProfile } from "@unemployed/contracts";
import { describe, expect, test, vi } from "vitest";

import {
  buildPendingQuestion,
  createApplyGuardState,
  executeApplyProposal,
} from "./policy-executor";
import type { RawApplyControl, RawApplyPage } from "@unemployed/contracts";
import { buildApplyFormObservation } from "./page-hands";
import { runSubmitPreflight } from "./submit-preflight";
import type {
  ApplyAgentConfig,
  ApplyAuthority,
  ApplyFormObservation,
  ApplyPageHands,
} from "./types";

function rawControl(overrides: Partial<RawApplyControl> & { index: number }): RawApplyControl {
  return {
    tagName: "input",
    inputType: "text",
    role: "",
    id: `field_${overrides.index}`,
    name: `field_${overrides.index}`,
    label: "",
    groupLabel: "",
    placeholder: "",
    autocomplete: "",
    required: false,
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

function rawPage(overrides: Partial<RawApplyPage> = {}): RawApplyPage {
  return {
    url: "https://apply.example.test/form",
    title: "Apply",
    bodyText: "Apply for the role",
    controls: [],
    actions: [],
    links: [],
    validationErrors: [],
    stepLabel: null,
    ...overrides,
  };
}

function observationOf(page: RawApplyPage): ApplyFormObservation {
  return buildApplyFormObservation(page, "2026-09-14T10:00:00.000Z");
}

function profile(): CandidateProfile {
  return CandidateProfileSchema.parse({
    id: "candidate_test",
    firstName: "Robin",
    lastName: "Ashford",
    fullName: "Robin Ashford",
    headline: "Platform engineer",
    summary: "Builds dependable internal tools.",
    currentLocation: "Manchester, United Kingdom",
    yearsExperience: 8,
    email: "robin.ashford@example.test",
    baseResume: {
      id: "resume_test",
      fileName: "resume.txt",
      uploadedAt: "2026-09-01T09:00:00.000Z",
      textContent: "8 years of platform engineering.",
      textUpdatedAt: "2026-09-01T09:00:00.000Z",
      extractionStatus: "ready",
    },
  });
}

function authority(overrides: Partial<ApplyAuthority> = {}): ApplyAuthority {
  return {
    mode: "prepare_only",
    submitAuthorized: false,
    preApprovedAttestationKinds: [],
    salaryDisclosure: "pause_for_user",
    allowedOrigins: [],
    ...overrides,
  };
}

function configFor(
  page: RawApplyPage,
  overrides: {
    authority?: Partial<ApplyAuthority>;
    hands?: Partial<ApplyPageHands>;
  } = {},
): { config: ApplyAgentConfig; hands: ApplyPageHands } {
  const hands: ApplyPageHands = {
    observe: () => Promise.resolve(observationOf(page)),
    fillText: (_ref, value) => Promise.resolve({ ok: true, observedValue: value }),
    chooseOption: (_ref, option) => Promise.resolve({ ok: true, observedValue: option }),
    setToggle: (_ref, checked) =>
      Promise.resolve({
        ok: true,
        observedValue: checked ? "checked" : "unchecked",
      }),
    uploadFile: (_ref, file) => Promise.resolve({ ok: true, observedValue: file.name }),
    clickAction: () => Promise.resolve({ ok: true, observedValue: "clicked" }),
    followLink: () => Promise.resolve({ ok: true, url: "https://apply.example.test/form" }),
    ...overrides.hands,
  };
  return {
    hands,
    config: {
      hands,
      authority: authority(overrides.authority),
      sources: {
        profile: profile(),
        resumeText: "Robin Ashford. 8 years of platform engineering.",
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
    },
  };
}

const now = () => new Date("2026-09-14T10:00:00.000Z");

describe("apply policy executor", () => {
  test("fills a known field from the person's own profile, not from the model", async () => {
    const page = rawPage({
      controls: [rawControl({ index: 0, label: "Email", inputType: "email" })],
    });
    const { config, hands } = configFor(page);
    const fillText = vi.spyOn(hands, "fillText");
    const observation = observationOf(page);

    const outcome = await executeApplyProposal(
      {
        tool: "answer_control",
        ref: "c0",
        freeTextAnswer: "someone.else@example.test",
      },
      observation.signature,
      { config, now, guardState: createApplyGuardState() },
    );

    expect(outcome.kind).toBe("filled");
    expect(fillText).toHaveBeenCalledWith("c0", "robin.ashford@example.test");
  });

  test("a declaration the person has not pre-approved pauses instead of being ticked", async () => {
    const page = rawPage({
      controls: [
        rawControl({
          index: 0,
          inputType: "checkbox",
          label: "I certify that the information I have given is true and complete",
          required: true,
        }),
      ],
    });
    const { config, hands } = configFor(page);
    const setToggle = vi.spyOn(hands, "setToggle");
    const observation = observationOf(page);

    const outcome = await executeApplyProposal(
      { tool: "answer_control", ref: "c0" },
      observation.signature,
      { config, now, guardState: createApplyGuardState() },
    );

    expect(outcome.kind).toBe("needs_you");
    if (outcome.kind === "needs_you") {
      expect(outcome.pause.code).toBe("declaration_needs_you");
      expect(outcome.pause.question?.prompt).toContain("I certify");
    }
    expect(setToggle).not.toHaveBeenCalled();
  });

  test("a declaration the person pre-approved is ticked and recorded as theirs", async () => {
    const page = rawPage({
      controls: [
        rawControl({
          index: 0,
          inputType: "checkbox",
          label: "I certify that the information I have given is true and complete",
        }),
      ],
    });
    const { config } = configFor(page, {
      authority: { preApprovedAttestationKinds: ["truthfulness_certification"] },
    });
    const observation = observationOf(page);

    const outcome = await executeApplyProposal(
      { tool: "answer_control", ref: "c0" },
      observation.signature,
      { config, now, guardState: createApplyGuardState() },
    );

    expect(outcome.kind).toBe("filled");
    if (outcome.kind === "filled") {
      expect(outcome.filled.answer.provenanceLabel).toBe(
        "a declaration you approved in advance",
      );
    }
  });

  test("pay is left to the person unless they said otherwise", async () => {
    const page = rawPage({
      controls: [rawControl({ index: 0, label: "Expected salary", required: true })],
    });
    const { config } = configFor(page);
    const observation = observationOf(page);

    const outcome = await executeApplyProposal(
      { tool: "answer_control", ref: "c0" },
      observation.signature,
      { config, now, guardState: createApplyGuardState() },
    );

    expect(outcome.kind).toBe("needs_you");
    if (outcome.kind === "needs_you") {
      expect(outcome.pause.code).toBe("question_needs_you");
      expect(outcome.pause.summary).toContain("pay");
    }
  });

  test("a question nothing can answer goes to the person with its exact wording", async () => {
    const page = rawPage({
      controls: [
        rawControl({
          index: 0,
          tagName: "select",
          label: "Which of our office locations would you prefer?",
          options: ["Leeds", "Bristol"],
          required: true,
        }),
      ],
    });
    const { config } = configFor(page);
    const observation = observationOf(page);

    const outcome = await executeApplyProposal(
      { tool: "answer_control", ref: "c0" },
      observation.signature,
      { config, now, guardState: createApplyGuardState() },
    );

    expect(outcome.kind).toBe("needs_you");
    if (outcome.kind === "needs_you") {
      expect(outcome.pause.question?.prompt).toBe(
        "Which of our office locations would you prefer?",
      );
      expect(outcome.pause.question?.answerOptions).toEqual(["Leeds", "Bristol"]);
    }
  });

  test("a proposal made against a page that has since changed is refused", async () => {
    const page = rawPage({
      controls: [rawControl({ index: 0, label: "Email", inputType: "email" })],
    });
    const { config, hands } = configFor(page);
    const fillText = vi.spyOn(hands, "fillText");

    const outcome = await executeApplyProposal(
      { tool: "answer_control", ref: "c0" },
      "a-signature-from-an-older-page",
      { config, now, guardState: createApplyGuardState() },
    );

    expect(outcome.kind).toBe("refused");
    expect(fillText).not.toHaveBeenCalled();
  });

  test("a form that moved to another site stops the run", async () => {
    const page = rawPage({
      url: "https://somewhere-else.example.test/form",
      controls: [rawControl({ index: 0, label: "Email", inputType: "email" })],
    });
    const { config } = configFor(page, {
      authority: { allowedOrigins: ["https://apply.example.test"] },
    });
    const observation = observationOf(page);

    const outcome = await executeApplyProposal(
      { tool: "answer_control", ref: "c0" },
      observation.signature,
      { config, now, guardState: createApplyGuardState() },
    );

    expect(outcome.kind).toBe("paused");
    if (outcome.kind === "paused") {
      expect(outcome.pause.summary).toContain("outside what you allowed");
    }
  });

  test("a sign-in wall stops the run without touching anything", async () => {
    const page = rawPage({
      bodyText: "Please sign in to continue with your application",
      controls: [rawControl({ index: 0, label: "Email", inputType: "email" })],
    });
    const { config, hands } = configFor(page);
    const fillText = vi.spyOn(hands, "fillText");
    const observation = observationOf(page);

    const outcome = await executeApplyProposal(
      { tool: "answer_control", ref: "c0" },
      observation.signature,
      { config, now, guardState: createApplyGuardState() },
    );

    expect(outcome.kind).toBe("paused");
    if (outcome.kind === "paused") {
      expect(outcome.pause.blocker?.code).toBe("site_login_required");
    }
    expect(fillText).not.toHaveBeenCalled();
  });

  test("the send button is never pressed when the run may only prepare", async () => {
    const page = rawPage({
      controls: [
        rawControl({ index: 0, label: "Email", inputType: "email", value: "robin@example.test" }),
      ],
      actions: [{ index: 0, label: "Submit application", visible: true, disabled: false }],
    });
    const { config, hands } = configFor(page);
    const clickAction = vi.spyOn(hands, "clickAction");
    const observation = observationOf(page);

    const outcome = await executeApplyProposal(
      { tool: "submit_application", ref: "a0" },
      observation.signature,
      { config, now, guardState: createApplyGuardState() },
    );

    expect(outcome.kind).toBe("refused");
    expect(clickAction).not.toHaveBeenCalled();
  });
});

describe("submit preflight", () => {
  const sendableAuthority = authority({
    mode: "autonomous_submit",
    submitAuthorized: true,
  });

  test("stops when a required answer is still empty", () => {
    const observation = observationOf(
      rawPage({
        controls: [rawControl({ index: 0, label: "Email", required: true })],
        actions: [{ index: 0, label: "Submit application", visible: true, disabled: false }],
      }),
    );

    const result = runSubmitPreflight({
      observation,
      proposedActionRef: "a0",
      authority: sendableAuthority,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Email");
    }
  });

  test("stops when a file the form asks for is not attached", () => {
    const observation = observationOf(
      rawPage({
        controls: [
          rawControl({ index: 0, label: "Email", required: true, value: "robin@example.test" }),
          rawControl({ index: 1, label: "Resume", inputType: "file", required: true }),
        ],
        actions: [{ index: 0, label: "Submit application", visible: true, disabled: false }],
      }),
    );

    const result = runSubmitPreflight({
      observation,
      proposedActionRef: "a0",
      authority: sendableAuthority,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("not attached");
    }
  });

  test("stops when there is still a step after this one", () => {
    const observation = observationOf(
      rawPage({
        stepLabel: "Step 1 of 2",
        controls: [rawControl({ index: 0, label: "Email", required: true, value: "robin@example.test" })],
        actions: [
          { index: 0, label: "Next", visible: true, disabled: false },
          { index: 1, label: "Submit application", visible: true, disabled: false },
        ],
      }),
    );

    const result = runSubmitPreflight({
      observation,
      proposedActionRef: "a1",
      authority: sendableAuthority,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("another step");
    }
  });

  test("passes on a complete final screen with authority", () => {
    const observation = observationOf(
      rawPage({
        stepLabel: "Step 2 of 2",
        controls: [
          rawControl({ index: 0, label: "Email", required: true, value: "robin@example.test" }),
          rawControl({
            index: 1,
            label: "Resume",
            inputType: "file",
            required: true,
            value: "resume.pdf",
          }),
        ],
        actions: [{ index: 0, label: "Submit application", visible: true, disabled: false }],
      }),
    );

    const result = runSubmitPreflight({
      observation,
      proposedActionRef: "a0",
      authority: sendableAuthority,
    });

    expect(result.ok).toBe(true);
  });
});

describe("the letter this application sends", () => {
  const letterText =
    "Dear hiring team, I have spent eight years building internal platforms that other engineers depend on every day, and the work described in this posting is the same shape. I would bring that experience to your team and would welcome the chance to talk it through with you.";

  function lettersFor(document: {
    id: string;
    fileName: string;
    mimeType: string;
    label: string;
    kind: "cover_letter";
    loadBytes: () => Promise<Uint8Array>;
  } | null) {
    return {
      preference: {
        tone: "plain_professional" as const,
        length: "standard" as const,
        language: null,
        sample: null,
      },
      provide: () =>
        Promise.resolve({
          ok: true as const,
          text: letterText,
          document,
        }),
    };
  }

  test("a box asking for a letter gets the letter, recorded as written for this job", async () => {
    const page = rawPage({
      controls: [
        rawControl({
          index: 0,
          tagName: "textarea",
          label: "Why do you want to work here?",
        }),
      ],
    });
    const { config, hands } = configFor(page);
    const fillText = vi.spyOn(hands, "fillText");
    const observation = observationOf(page);

    const outcome = await executeApplyProposal(
      { tool: "answer_control", ref: "c0" },
      observation.signature,
      {
        config: { ...config, letters: lettersFor(null) },
        now,
        guardState: createApplyGuardState(),
      },
    );

    expect(outcome.kind).toBe("filled");
    expect(fillText).toHaveBeenCalledWith("c0", letterText);
    if (outcome.kind === "filled") {
      expect(outcome.filled.questionKind).toBe("cover_letter");
      expect(outcome.filled.answer.provenanceLabel).toBe(
        "the letter written for this application",
      );
      expect(outcome.filled.answer.groundedIn.length).toBeGreaterThan(0);
    }
  });

  test("a file field asking for a letter gets the same letter as a file", async () => {
    const page = rawPage({
      controls: [
        rawControl({ index: 0, inputType: "file", label: "Cover letter" }),
      ],
    });
    const { config, hands } = configFor(page);
    const uploadFile = vi.spyOn(hands, "uploadFile");
    const observation = observationOf(page);

    const outcome = await executeApplyProposal(
      { tool: "answer_control", ref: "c0" },
      observation.signature,
      {
        config: {
          ...config,
          letters: lettersFor({
            id: "document_letter",
            fileName: "letter.pdf",
            mimeType: "application/pdf",
            label: "Cover letter",
            kind: "cover_letter",
            loadBytes: () => Promise.resolve(new Uint8Array([1, 2, 3])),
          }),
        },
        now,
        guardState: createApplyGuardState(),
      },
    );

    expect(outcome.kind).toBe("attached");
    expect(uploadFile).toHaveBeenCalledWith("c0", {
      name: "letter.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([1, 2, 3]),
    });
  });

  test("a file the form insists on that cannot be produced goes to the person", async () => {
    const page = rawPage({
      controls: [
        rawControl({
          index: 0,
          inputType: "file",
          label: "Cover letter (Word document)",
          required: true,
        }),
      ],
    });
    const { config, hands } = configFor(page);
    const uploadFile = vi.spyOn(hands, "uploadFile");
    const observation = observationOf(page);

    const outcome = await executeApplyProposal(
      { tool: "answer_control", ref: "c0" },
      observation.signature,
      {
        config: { ...config, letters: lettersFor(null) },
        now,
        guardState: createApplyGuardState(),
      },
    );

    expect(outcome.kind).toBe("paused");
    if (outcome.kind === "paused") {
      expect(outcome.pause.code).toBe("document_needs_you");
      expect(outcome.pause.summary).toContain("Attach one here and it will be used");
    }
    expect(uploadFile).not.toHaveBeenCalled();
  });
});

describe("being ready to send", () => {
  const completePage = () =>
    rawPage({
      stepLabel: "Step 2 of 2",
      controls: [
        rawControl({
          index: 0,
          label: "Email",
          required: true,
          value: "robin@example.test",
        }),
      ],
      actions: [
        { index: 0, label: "Submit application", visible: true, disabled: false },
      ],
    });

  test("a complete form with authority is reported ready, and nothing is pressed", async () => {
    const page = completePage();
    const { config, hands } = configFor(page, {
      authority: { mode: "autonomous_submit", submitAuthorized: true },
    });
    const clickAction = vi.spyOn(hands, "clickAction");
    const observation = observationOf(page);

    const outcome = await executeApplyProposal(
      { tool: "submit_application", ref: "a0" },
      observation.signature,
      { config, now, guardState: createApplyGuardState() },
    );

    expect(outcome.kind).toBe("ready_to_send");
    if (outcome.kind === "ready_to_send") {
      expect(outcome.finalActionRef).toBe("a0");
      expect(outcome.finalActionLabel).toBe("Submit application");
    }
    // The one irreversible act is not this loop's to take.
    expect(clickAction).not.toHaveBeenCalled();
  });

  test("confirm-first reaches the send button but is never the one to press it", async () => {
    const page = completePage();
    const { config, hands } = configFor(page, {
      authority: { mode: "confirm_before_submit", submitAuthorized: false },
    });
    const clickAction = vi.spyOn(hands, "clickAction");
    const observation = observationOf(page);

    const outcome = await executeApplyProposal(
      { tool: "submit_application", ref: "a0" },
      observation.signature,
      { config, now, guardState: createApplyGuardState() },
    );

    // The form is worked all the way to the button so the person has a
    // complete application to review; pressing it stays theirs.
    expect(outcome.kind).toBe("ready_to_send");
    expect(clickAction).not.toHaveBeenCalled();
  });
});

/**
 * A form that saves each answer as it is typed.
 *
 * The guard refuses every one of those saves, so nothing leaves the page. What
 * changed is what happens next: the run keeps filling and writes the blocked
 * save down, and only stops when the form will not go on without it.
 */
describe("a site that saves as you go", () => {
  const savedAttempt = {
    kind: "fetch" as const,
    method: "POST",
    url: "https://boards.example.test/applications/autosave",
    at: "2026-09-14T10:00:01.000Z",
    carriedPreparedValue: true,
  };

  function safetyThatBlocksOneSave() {
    let handedOut = false;
    return {
      readBlockedAttempt: () => {
        if (handedOut) return Promise.resolve(null);
        handedOut = true;
        return Promise.resolve(savedAttempt);
      },
      registerPreparedValue: () => Promise.resolve(),
      openIntermediateWriteWindow: () => Promise.resolve(),
      closeIntermediateWriteWindow: () => Promise.resolve(),
      checkServiceWorker: () => Promise.resolve(null),
    };
  }

  test("a blocked background save during an answer does not stop the run", async () => {
    // The field keeps the answer, so the blocked save changed nothing.
    const page = rawPage({
      controls: [rawControl({ index: 0, label: "First Name" })],
    });
    const filled = rawPage({
      controls: [
        rawControl({ index: 0, label: "First Name", value: "Robin" }),
      ],
    });
    let reads = 0;
    const { config } = configFor(page, {
      hands: {
        observe: () => {
          reads += 1;
          return Promise.resolve(observationOf(reads === 1 ? page : filled));
        },
      },
    });
    const guardState = createApplyGuardState();

    const outcome = await executeApplyProposal(
      { tool: "answer_control", ref: "c0" },
      observationOf(page).signature,
      {
        config: { ...config, safety: safetyThatBlocksOneSave() },
        now,
        guardState,
      },
    );

    expect(outcome.kind).toBe("filled");
    expect(guardState.notes).toEqual([
      "Blocked a background save to boards.example.test while filling First Name.",
    ]);
    expect(guardState.blockedSaveCount).toBe(1);
  });

  test("a blocked save that stops the form moving on pauses, and names the site", async () => {
    const page = rawPage({
      controls: [rawControl({ index: 0, label: "First Name", value: "Robin" })],
      actions: [{ index: 0, label: "Continue", visible: true, disabled: false }],
    });
    const { config } = configFor(page);
    const guardState = createApplyGuardState();

    const outcome = await executeApplyProposal(
      { tool: "go_to_step", ref: "a0" },
      observationOf(page).signature,
      {
        config: { ...config, safety: safetyThatBlocksOneSave() },
        now,
        guardState,
      },
    );

    expect(outcome.kind).toBe("paused");
    if (outcome.kind === "paused") {
      expect(outcome.pause.blocker?.code).toBe("site_saves_as_you_go");
      expect(outcome.pause.blocker?.summary).toBe(
        "This site saves your answers as you type, and Job Finder is not allowed to let it.",
      );
      expect(outcome.pause.blocker?.nextActionLabel).toBe(
        "Allow saving on this site",
      );
      expect(outcome.pause.blocker?.host).toBe("boards.example.test");
    }
  });

  test("the page sending the form itself still stops everything", async () => {
    const page = rawPage({
      controls: [rawControl({ index: 0, label: "First Name" })],
    });
    const { config } = configFor(page);

    const outcome = await executeApplyProposal(
      { tool: "answer_control", ref: "c0" },
      observationOf(page).signature,
      {
        config: {
          ...config,
          safety: {
            ...safetyThatBlocksOneSave(),
            readBlockedAttempt: () =>
              Promise.resolve({ ...savedAttempt, kind: "form_submit" as const }),
          },
        },
        now,
        guardState: createApplyGuardState(),
      },
    );

    expect(outcome.kind).toBe("paused");
    if (outcome.kind === "paused") {
      expect(outcome.pause.summary).toContain(
        "tried to send the application on its own",
      );
    }
  });
});

/**
 * Two controls that say the same thing are still two questions.
 *
 * A phone number sits beside its country list, and both are labelled Phone.
 * Treating them as one question gave the number field the country's 240
 * choices and stopped the country being answered from the profile at all.
 */
describe("questions keep to their own control", () => {
  const phoneCountry = rawControl({
    index: 0,
    tagName: "select",
    inputType: "select-one",
    label: "Country",
    groupLabel: "Phone",
    options: ["Afghanistan +93", "United Kingdom +44", "United States +1"],
  });
  const phoneNumber = rawControl({
    index: 1,
    inputType: "tel",
    label: "Phone",
    groupLabel: "Phone",
  });
  const yesNo = rawControl({
    index: 2,
    tagName: "select",
    inputType: "select-one",
    label: "Have you previously worked at or consulted for us?*",
    options: ["Yes", "No"],
  });

  test("the phone country and the phone number are two different questions", () => {
    const page = rawPage({ controls: [phoneCountry, phoneNumber, yesNo] });
    const observation = observationOf(page);
    const [country, number, choice] = observation.controls;
    const build = (control: (typeof observation.controls)[number]) =>
      buildPendingQuestion({
        control,
        jobId: "job_test",
        detectedAt: "2026-09-14T10:00:00.000Z",
        suggestion: null,
      });

    const countryQuestion = build(country);
    const numberQuestion = build(number);
    expect(countryQuestion.id).not.toBe(numberQuestion.id);
    // The number field has no choices; the country list's do not leak onto it.
    expect(numberQuestion.answerOptions).toEqual([]);
    expect(countryQuestion.answerOptions).toHaveLength(3);
    // Display still reads as one thing where the group only repeats the label.
    expect(numberQuestion.prompt).toBe("Phone");
    expect(countryQuestion.prompt).toBe("Phone — Country");

    const choiceQuestion = build(choice);
    expect(choiceQuestion.answerOptions).toEqual(["Yes", "No"]);
    expect(choiceQuestion.answerControlType).toBe("single_choice");
  });

  test("the phone country is still answered from the profile", async () => {
    const page = rawPage({ controls: [phoneCountry, phoneNumber] });
    const { config, hands } = configFor(page);
    const chooseOption = vi.spyOn(hands, "chooseOption");
    const withPhone: ApplyAgentConfig = {
      ...config,
      sources: {
        ...config.sources,
        profile: {
          ...config.sources.profile,
          phone: "+44 7700 900000",
          currentCountry: "United Kingdom",
        },
      },
    };

    const outcome = await executeApplyProposal(
      { tool: "answer_control", ref: "c0" },
      observationOf(page).signature,
      { config: withPhone, now, guardState: createApplyGuardState() },
    );

    expect(outcome.kind).toBe("filled");
    if (outcome.kind === "filled") {
      expect(outcome.filled.answer.provenanceLabel).toContain(
        "the country your phone number belongs to",
      );
    }
    expect(chooseOption).toHaveBeenCalled();
  });
});

/**
 * The same question, the same handle, on every run.
 *
 * A retry reads the page fresh and the refs come out renumbered. If the
 * question's identity moved with them, the answer the person gave yesterday
 * belongs to a question nothing recognises today, and they are asked again.
 */
describe("a question keeps its name across runs", () => {
  function askedPage(offset: number): RawApplyPage {
    const before = Array.from({ length: offset }, (_, index) =>
      rawControl({ index, label: `Filler ${index}` }),
    );
    return rawPage({
      controls: [
        ...before,
        rawControl({
          index: offset,
          tagName: "select",
          inputType: "select-one",
          label: "Have you previously worked at or consulted for us?*",
          options: ["Yes", "No"],
          required: true,
        }),
      ],
    });
  }

  test("renumbered refs do not change the question's id", () => {
    const first = observationOf(askedPage(0));
    const second = observationOf(askedPage(3));
    const build = (observation: ApplyFormObservation, ref: string) =>
      buildPendingQuestion({
        control: observation.controls.find((entry) => entry.ref === ref)!,
        siblings: observation.controls,
        jobId: "job_test",
        detectedAt: "2026-09-14T10:00:00.000Z",
        suggestion: null,
      });

    expect(build(first, "c0").id).toBe(build(second, "c3").id);
  });

  test("two controls that say exactly the same thing are still told apart", () => {
    const page = rawPage({
      controls: [
        rawControl({
          index: 0,
          tagName: "select",
          inputType: "select-one",
          label: "Gender",
          options: ["Male", "Female"],
        }),
        rawControl({
          index: 1,
          tagName: "select",
          inputType: "select-one",
          label: "Gender",
          options: ["Male", "Female"],
        }),
      ],
    });
    const observation = observationOf(page);
    const ids = observation.controls.map(
      (control) =>
        buildPendingQuestion({
          control,
          siblings: observation.controls,
          jobId: "job_test",
          detectedAt: "2026-09-14T10:00:00.000Z",
          suggestion: null,
        }).id,
    );

    expect(new Set(ids).size).toBe(2);
  });
});
