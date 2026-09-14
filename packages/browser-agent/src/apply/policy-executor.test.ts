import { CandidateProfileSchema, type CandidateProfile } from "@unemployed/contracts";
import { describe, expect, test, vi } from "vitest";

import {
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

    expect(outcome.kind).toBe("paused");
    if (outcome.kind === "paused") {
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

    expect(outcome.kind).toBe("paused");
    if (outcome.kind === "paused") {
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

    expect(outcome.kind).toBe("paused");
    if (outcome.kind === "paused") {
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
