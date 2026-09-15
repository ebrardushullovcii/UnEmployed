import type { LLMClient } from "@unemployed/browser-agent";
import {
  ApplicationAuthorityEnvelopeSchema,
  serializeApplicationAuthorityDecisionPolicyForDigest,
} from "@unemployed/contracts";
import { createHash } from "node:crypto";

import type { ApplySubmissionHandoff } from "./apply-submission-handoff";
import type { ApplyPageSession, RawApplyPage } from "@unemployed/contracts";
import { CandidateProfileSchema, SavedJobSchema } from "@unemployed/contracts";
import type { ExecuteApplicationFlowInput } from "@unemployed/browser-runtime";
import { describe, expect, test, vi } from "vitest";

import {
  buildApplyReviewCard,
  createApplyFormPreparer,
  resolveApplySiteLabel,
  runAgentApplicationPreparation,
} from "./agent-application-preparation";

/**
 * The seam between the apply loop and the record Job Finder keeps.
 *
 * What matters here is that the person's own words survive the trip: the
 * questions that stopped the run, the plain sentence about why, and the one
 * thing they are being asked to do next.
 */

const PAGE_URL = "https://apply.example.test/form";

function envelopeFor(mode: "confirm_before_submit" | "autonomous_submit") {
  const content = {
    version: 1 as const,
    answerPolicy: {
      approvedAnswerSnapshot: { revision: 1, digest: "b".repeat(64) },
      unknownRequiredQuestion: "pause_for_user" as const,
      unknownEligibility: "pause_for_user" as const,
      unknownLegalRequirement: "pause_for_user" as const,
      preApprovedAttestationKinds: [],
      salaryDisclosure: "pause_for_user" as const,
    },
    stopConditions: {
      unavailableCredentials: "pause_for_user" as const,
      loginRequired: "pause_for_user" as const,
      mfaRequired: "pause_for_user" as const,
      captcha: "pause_for_user" as const,
      antiBot: "pause_for_user" as const,
      accountCreation: "pause_for_user" as const,
      staleObservation: "pause_for_user" as const,
      ambiguousFinalControl: "pause_for_user" as const,
      originDrift: "pause_for_user" as const,
      outcomeUncertain: "stop_no_retry" as const,
    },
  };
  return ApplicationAuthorityEnvelopeSchema.parse({
    id: "authority_test",
    mode,
    status: "active",
    revision: 1,
    scope: { campaignId: null, jobIds: ["job_test"] },
    maxApplicationsPerRun: 10,
    maxApplicationsPerLocalDay: 20,
    intermediateMutationsAuthorized: false,
    accountCreationAuthorized: false,
    allowedResumeSha256: ["a".repeat(64)],
    allowedOrigins: ["https://apply.example.test"],
    createdAt: "2026-09-01T10:00:00.000Z",
    expiresAt: "2026-09-20T10:00:00.000Z",
    revokedAt: null,
    decisionPolicy: {
      ...content,
      revision: 1,
      digest: createHash("sha256")
        .update(serializeApplicationAuthorityDecisionPolicyForDigest(content))
        .digest("hex"),
    },
  });
}

function rawPage(bodyText: string): RawApplyPage {
  return {
    url: PAGE_URL,
    title: "Apply",
    bodyText,
    // One ordinary question, so the page reads as the form rather than as a
    // listing the run would have to walk away from first.
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
    actions: [],
    links: [],
    headings: [],
    clickables: [],
    openedTabs: [],
    loading: false,
    validationErrors: [],
    stepLabel: null,
  };
}

/** One open page that reports a one-question form and accepts every write. */
function session(bodyText = "Apply for the role"): ApplyPageSession {
  return {
    readPage: () => Promise.resolve(rawPage(bodyText)),
    navigate: () => Promise.resolve({ ok: true, url: PAGE_URL }),
    clickElement: () => Promise.resolve({ ok: true, observedValue: "clicked" }),
    scroll: () => Promise.resolve({ ok: true, observedValue: "down" }),
    wait: () => Promise.resolve(),
    goBack: () => Promise.resolve({ ok: true, url: PAGE_URL }),
    readText: () => Promise.resolve(bodyText),
    fillText: (_ref, value) => Promise.resolve({ ok: true, observedValue: value }),
    chooseOption: (_ref, option) =>
      Promise.resolve({ ok: true, observedValue: option }),
    setToggle: () => Promise.resolve({ ok: true, observedValue: "checked" }),
    uploadFile: (_ref, file) =>
      Promise.resolve({ ok: true, observedValue: file.name }),
    clickAction: () => Promise.resolve({ ok: true, observedValue: "clicked" }),
    followLink: () => Promise.resolve({ ok: true, url: PAGE_URL }),
    installPrepareOnlyGuard: () => Promise.resolve(),
    readBlockedAttempt: () => Promise.resolve(null),
    registerPreparedValue: () => Promise.resolve(),
    openIntermediateWriteWindow: () => Promise.resolve(),
    closeIntermediateWriteWindow: () => Promise.resolve(),
    readIntermediateWriteCount: () => 0,
    checkServiceWorker: () => Promise.resolve(null),
  };
}

function testJob() {
  return SavedJobSchema.parse({
    id: "job_test",
    source: "target_site" as const,
    sourceJobId: "job_test",
    discoveryMethod: "catalog_seed" as const,
    collectionMethod: "fallback_search" as const,
    canonicalUrl: "https://apply.example.test/form",
    applicationUrl: "https://apply.example.test/form",
    title: "Senior Engineer",
    company: "Example Co",
    location: "Remote",
    workMode: ["remote" as const],
    applyPath: "external_redirect" as const,
    easyApplyEligible: false,
    postedAt: "2026-03-20T09:00:00.000Z",
    postedAtText: null,
    providerUpdatedAt: null,
    discoveredAt: "2026-03-20T10:00:00.000Z",
    firstSeenAt: null,
    lastSeenAt: null,
    lastVerifiedActiveAt: null,
    salaryText: null,
    normalizedCompensation: {
      currency: null,
      interval: null,
      minAmount: null,
      maxAmount: null,
      minAnnualUsd: null,
      maxAnnualUsd: null,
    },
    detailQuality: "detail_enriched" as const,
    summary: "Build resilient workflows.",
    description: "Upload a resume and review the application.",
    keySkills: ["TypeScript"],
    responsibilities: [],
    minimumQualifications: [],
    preferredQualifications: [],
    seniority: null,
    employmentType: null,
    department: null,
    team: null,
    employerWebsiteUrl: null,
    employerDomain: null,
    atsProvider: null,
    providerKey: null,
    providerBoardToken: null,
    providerIdentifier: null,
    titleTriageOutcome: "pass" as const,
    sourceIntelligence: null,
    screeningHints: {
      sponsorshipText: null,
      requiresSecurityClearance: null,
      relocationText: null,
      travelText: null,
      remoteGeographies: [],
      requiresConsentInterrupt: null,
      requiresConsentInterruptKind: null,
    },
    keywordSignals: [],
    benefits: [],
    status: "approved" as const,
    matchAssessment: {
      score: 91,
      reasons: ["Strong fit"],
      gaps: [],
      recommendation: "review_before_applying" as const,
      recommendationRationale: "Test fixture requires explicit review.",
      requirements: [],
    },
    provenance: [],
  });
}


function executionInput(): Omit<
  ExecuteApplicationFlowInput,
  "prepareApplicationForm"
> {
  return {
    job: testJob(),
    resumeArtifact: {
      id: "resume_artifact_test",
      jobId: "job_test",
      source: "tailored_export",
      sourceDocumentId: null,
      exportArtifactId: "export_test",
      fileName: "robin-ashford-resume.pdf",
      filePath: "/tmp/does-not-need-to-exist.pdf",
      sha256: "b".repeat(64),
      approvedAt: "2026-09-14T09:30:00.000Z",
    },
    profile: CandidateProfileSchema.parse({
      id: "candidate_test",
      firstName: "Robin",
      lastName: "Ashford",
      fullName: "Robin Ashford",
      headline: "Platform engineer",
      summary: "Builds dependable internal tools.",
      currentLocation: "Manchester",
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
    }),
    settings: {
      resumeFormat: "pdf",
      resumeTemplateId: "classic_ats",
      fontPreset: "inter_requisite",
      appearanceTheme: "system",
      humanReviewRequired: true,
      allowAutoSubmitOverride: false,
      keepSessionAlive: false,
      discoveryOnly: false,
    },
    mode: "prepare_only",
  };
}

/** A model that looks, then says only the person can go further. */
function modelThatNeedsThePerson(reason: string): LLMClient {
  let calls = 0;
  return {
    chatWithTools: () => {
      calls += 1;
      return Promise.resolve({
        toolCalls: [
          {
            id: `call_${calls}`,
            type: "function" as const,
            function: {
              name: "finish",
              arguments: JSON.stringify({ reason, needsPerson: true }),
            },
          },
        ],
      });
    },
  };
}

function modelThatFinishes(): LLMClient {
  let calls = 0;
  return {
    chatWithTools: () => {
      calls += 1;
      return Promise.resolve({
        toolCalls: [
          {
            id: `call_${calls}`,
            type: "function" as const,
            function: {
              name: "finish",
              arguments: JSON.stringify({ reason: "Nothing left to fill in" }),
            },
          },
        ],
      });
    },
  };
}

describe("agent application preparation seam", () => {
  test("a finished prepare-only run becomes a paused record that says nothing was sent", async () => {
    const openSession = session();
    const installPrepareOnlyGuard = vi.spyOn(
      openSession,
      "installPrepareOnlyGuard",
    );

    const result = await runAgentApplicationPreparation({
      session: openSession,
      executionInput: executionInput(),
      llmClient: modelThatFinishes(),
      startedAt: "2026-09-14T10:00:00.000Z",
      siteLabel: "the careers site",
      now: () => new Date("2026-09-14T10:05:00.000Z"),
    });

    expect(installPrepareOnlyGuard).toHaveBeenCalledWith({
      intermediateMutationsAuthorized: false,
      allowedOrigins: [],
    });
    expect(result.state).toBe("paused");
    expect(result.submittedAt).toBeNull();
    expect(result.outcome).toBeNull();
    expect(result.detail).toContain("nothing was sent");
    expect(result.blocker).toBeNull();
    expect(result.replay.lastUrl).toBe(PAGE_URL);
  });

  test("a sign-in wall the model reports becomes the record's blocker", async () => {
    // The harness is told the page wants a sign-in; deciding what that means
    // is the model's, and what it says is what the person reads.
    const result = await runAgentApplicationPreparation({
      session: session("You must be signed in to apply"),
      executionInput: executionInput(),
      llmClient: modelThatNeedsThePerson(
        "This site wants you signed in before it will show the form",
      ),
      startedAt: "2026-09-14T10:00:00.000Z",
      siteLabel: "the careers site",
      now: () => new Date("2026-09-14T10:05:00.000Z"),
    });

    expect(result.blocker?.code).toBe("site_login_required");
    expect(result.summary).toBe("This application needs you");
    expect(result.detail).toContain("wants you signed in");
  });
});

describe("the preparer the browser layer is handed", () => {
  test("names the site the way the person would", () => {
    expect(
      resolveApplySiteLabel({
        targetLabel: "Northwind careers",
        applicationUrl: PAGE_URL,
      }),
    ).toBe("Northwind careers");
    expect(
      resolveApplySiteLabel({
        targetLabel: null,
        applicationUrl: "https://www.boards.example.test/apply",
      }),
    ).toBe("boards.example.test");
    expect(
      resolveApplySiteLabel({ targetLabel: "  ", applicationUrl: "not a url" }),
    ).toBe("this site");
  });

  test("installs the guard and fills the form in when the assistant is available", async () => {
    const openSession = session();
    const installGuard = vi.spyOn(openSession, "installPrepareOnlyGuard");
    const facts = executionInput();

    const prepare = createApplyFormPreparer({
      executionInput: facts,
      aiClient: { chatWithTools: modelThatFinishes().chatWithTools },
      siteLabel: "the careers site",
      now: () => new Date("2026-09-14T10:05:00.000Z"),
    });

    const result = await prepare({
      session: openSession,
      startedAt: "2026-09-14T10:00:00.000Z",
    });

    expect(installGuard).toHaveBeenCalledWith({
      intermediateMutationsAuthorized: false,
      allowedOrigins: [],
    });
    expect(result.state).toBe("paused");
    expect(result.submittedAt).toBeNull();
    expect(result.detail).toContain("nothing was sent");
  });

  test("a missing assistant is an outage in the copy, never something to set up", async () => {
    const prepare = createApplyFormPreparer({
      executionInput: executionInput(),
      aiClient: {},
      siteLabel: "the careers site",
      now: () => new Date("2026-09-14T10:05:00.000Z"),
    });

    const result = await prepare({
      session: session(),
      startedAt: "2026-09-14T10:00:00.000Z",
    });

    expect(result.state).toBe("paused");
    expect(result.detail).toContain("unavailable right now");
    expect(result.detail).toContain("Nothing was changed on the site");
    expect(result.nextActionLabel).toBe("Try this application again shortly");
    // Nothing here asks the person to configure anything.
    expect(result.detail).not.toMatch(/api key|settings|configure|set up/iu);
  });
});

describe("the review card shown before you press send", () => {
  test("shows every answer, where it came from, and what is still waiting on you", () => {
    const card = buildApplyReviewCard({
      preparedAt: "2026-09-14T10:05:00.000Z",
      siteLabel: "Northwind careers",
      result: {
        outcome: "awaiting_your_review",
        reason: "Ready for you to look over and send.",
        steps: 12,
        finalUrl: "https://apply.example.test/form?step=3",
        filled: [
          {
            ref: "c0",
            label: "Email",
            questionKind: "personal_info",
            answer: {
              value: "robin@example.test",
              kind: "personal_info",
              sourceKind: "profile",
              sourceId: "profile.email",
              provenanceLabel: "your email address",
              groundedIn: ["your email address"],
            },
            at: "2026-09-14T10:00:00.000Z",
          },
          {
            ref: "c5",
            label: "Why do you want to work here?",
            questionKind: "cover_letter",
            answer: {
              value: "Dear hiring team, I build platforms.",
              kind: "cover_letter",
              sourceKind: "generated",
              sourceId: "application.letter",
              provenanceLabel: "the letter written for this application",
              groundedIn: ["the resume sent with this application"],
            },
            at: "2026-09-14T10:01:00.000Z",
          },
        ],
        attachments: [
          {
            documentId: "document_resume",
            fileName: "robin-resume.pdf",
            label: "Your CV",
            controlLabel: "Resume/CV",
            at: "2026-09-14T10:02:00.000Z",
          },
        ],
        pauses: [
          {
            code: "question_needs_you",
            summary: "Job Finder stopped on \"Expected salary\".",
            question: null,
            blocker: null,
          },
        ],
        notes: [],
        timeline: [],
        modelTurns: 0,
        readyToSend: null,
      },
    });

    expect(card.siteLabel).toBe("Northwind careers");
    expect(card.pageUrl).toBe("https://apply.example.test/form?step=3");
    expect(card.answers).toHaveLength(2);
    // A stored fact and a written one are distinguishable at a glance.
    expect(card.answers[0]).toMatchObject({
      question: "Email",
      source: "your email address",
      written: false,
    });
    expect(card.answers[1]?.written).toBe(true);
    expect(card.attachments[0]).toMatchObject({
      label: "Your CV",
      field: "Resume/CV",
    });
    expect(card.letter?.text).toContain("I build platforms");
    expect(card.letter?.groundedIn).toContain(
      "the resume sent with this application",
    );
    expect(card.waitingOnYou).toHaveLength(1);
  });

  test("nothing waiting on you means it is ready to send", () => {
    const card = buildApplyReviewCard({
      preparedAt: "2026-09-14T10:05:00.000Z",
      siteLabel: "the careers site",
      result: {
        outcome: "awaiting_your_review",
        reason: "Ready.",
        steps: 4,
        finalUrl: null,
        filled: [],
        attachments: [],
        pauses: [],
        notes: [],
        timeline: [],
        modelTurns: 0,
        readyToSend: null,
      },
    });
    expect(card.waitingOnYou).toHaveLength(0);
    expect(card.letter).toBeNull();
  });
});

describe("each mode, end to end through the seam", () => {
  const ORIGIN = "https://apply.example.test";

  function completableSession(): ApplyPageSession {
    const filled = new Map<string, string>();
    return {
      readPage: () =>
        Promise.resolve({
          url: PAGE_URL,
          title: "Apply",
          bodyText: "Apply for the role",
          controls: [
            {
              index: 0,
              tagName: "input",
              inputType: "email",
              role: "",
              id: "email",
              name: "email",
              label: "Email",
              groupLabel: "",
              placeholder: "",
              autocomplete: "",
              required: true,
              invalid: false,
              validationMessage: "",
              disabled: false,
              readOnly: false,
              visible: true,
              value: filled.get("c0") ?? "",
              checked: false,
              multiple: false,
              options: [],
              selectedOptionLabel: "",
            },
          ],
          actions: [
            { index: 0, label: "Submit application", visible: true, disabled: false },
          ],
          links: [],
          headings: [],
          clickables: [],
          openedTabs: [],
          loading: false,
          validationErrors: [],
          stepLabel: null,
        }),
      fillText: (ref, value) => {
        filled.set(ref, value);
        return Promise.resolve({ ok: true, observedValue: value });
      },
      chooseOption: (_ref, option) =>
        Promise.resolve({ ok: true, observedValue: option }),
      setToggle: () => Promise.resolve({ ok: true, observedValue: "checked" }),
      uploadFile: (_ref, file) =>
        Promise.resolve({ ok: true, observedValue: file.name }),
      clickAction: () => Promise.resolve({ ok: true, observedValue: "clicked" }),
      navigate: () => Promise.resolve({ ok: true, url: PAGE_URL }),
      clickElement: () => Promise.resolve({ ok: true, observedValue: "clicked" }),
      scroll: () => Promise.resolve({ ok: true, observedValue: "down" }),
      wait: () => Promise.resolve(),
      goBack: () => Promise.resolve({ ok: true, url: PAGE_URL }),
      readText: () => Promise.resolve("Apply for the role"),
      followLink: () => Promise.resolve({ ok: true, url: PAGE_URL }),
      installPrepareOnlyGuard: () => Promise.resolve(),
      readBlockedAttempt: () => Promise.resolve(null),
      registerPreparedValue: () => Promise.resolve(),
      openIntermediateWriteWindow: () => Promise.resolve(),
      closeIntermediateWriteWindow: () => Promise.resolve(),
      readIntermediateWriteCount: () => 0,
      checkServiceWorker: () => Promise.resolve(null),
    };
  }

  /** Works the form, then asks to send once nothing is left. */
  function completingModel(): LLMClient {
    let calls = 0;
    return {
      chatWithTools: () => {
        calls += 1;
        // Answer the one field, say the form is complete, then finish.
        const name =
          calls === 1
            ? "type"
            : calls === 2
              ? "submit_application"
              : "finish";
        const args =
          name === "type"
            ? { ref: "c0", text: "robin.ashford@example.test" }
            : name === "submit_application"
              ? { ref: "a0" }
              : { reason: "Nothing left to fill in" };
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

  async function runInMode(
    mode: "prepare_only" | "confirm_before_submit" | "autonomous_submit",
  ) {
    const facts = executionInput();
    let handoff: ApplySubmissionHandoff | null = null;
    const clicks: string[] = [];
    const session = completableSession();
    const watched: ApplyPageSession = {
      ...session,
      clickAction: (ref) => {
        clicks.push(ref);
        return session.clickAction(ref);
      },
    };

    await runAgentApplicationPreparation({
      session: watched,
      executionInput: {
        ...facts,
        mode: mode === "autonomous_submit" ? "submit_when_ready" : "prepare_only",
        applyAutomationMode: mode,
        submitAuthorized: mode === "autonomous_submit",
        applyAllowedOrigins: [ORIGIN],
      },
      ...(mode === "prepare_only" ? {} : { envelope: envelopeFor(mode) }),
      llmClient: completingModel(),
      startedAt: "2026-09-14T10:00:00.000Z",
      siteLabel: "the careers site",
      onPrepared: (outcome) => {
        handoff = outcome.handoff;
      },
      now: () => new Date("2026-09-14T10:05:00.000Z"),
    });

    return { handoff: handoff as ApplySubmissionHandoff | null, clicks };
  }

  test("fill-in-only never becomes a send, and presses nothing", async () => {
    const { handoff, clicks } = await runInMode("prepare_only");
    expect(handoff?.status).toBe("not_ready");
    expect(clicks).toHaveLength(0);
  });

  test("confirm-first stops with the send button found and nothing pressed", async () => {
    const { handoff, clicks } = await runInMode("confirm_before_submit");
    expect(handoff?.status).toBe("awaiting_your_review");
    if (handoff?.status === "awaiting_your_review") {
      expect(handoff.finalAction.actionLabel).toBe("Submit application");
    }
    expect(clicks).toHaveLength(0);
  });

  test("sending on its own hands over to the submission path, still pressing nothing here", async () => {
    const { handoff, clicks } = await runInMode("autonomous_submit");
    expect(handoff?.status).toBe("send_now");
    // Preparation never clicks the send button; the submission path does.
    expect(clicks).toHaveLength(0);
  });
});

/**
 * A form with several questions comes back once, with all of them.
 *
 * The record is what the person acts on, so every question the run could not
 * answer has to survive the trip from the loop to the record — choices and
 * all — and a run that throws has to end as something they can see rather
 * than as a record that says it is still going.
 */
describe("questions and failures reaching the record", () => {
  function questionPage(): RawApplyPage {
    return {
      ...rawPage("Apply for the role"),
      controls: [
        {
          index: 0,
          tagName: "select",
          inputType: "select-one",
          role: "",
          id: "q0",
          name: "q0",
          label: "Have you previously worked at or consulted for us?",
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
          // A list's blank first choice is not an answer anyone could give.
          options: ["", "Yes", "No"],
          selectedOptionLabel: "",
        },
        {
          index: 1,
          tagName: "select",
          inputType: "select-one",
          role: "",
          id: "q1",
          name: "q1",
          label: "What are your salary expectations?",
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
          options: ["", "Up to 50k", "50k to 70k"],
          selectedOptionLabel: "",
        },
      ],
    };
  }

  function modelThatTriesBothThenFinishes(): LLMClient {
    let calls = 0;
    return {
      chatWithTools: () => {
        calls += 1;
        const name = calls <= 2 ? "suggest_answer" : "finish";
        const args =
          calls === 1
            ? { ref: "c0" }
            : calls === 2
              ? { ref: "c1" }
              : { reason: "Nothing left to fill in" };
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

  test("two unanswered questions both become pending question records", async () => {
    const page = questionPage();
    const openSession: ApplyPageSession = {
      ...session(),
      readPage: () => Promise.resolve(page),
    };

    const result = await runAgentApplicationPreparation({
      session: openSession,
      executionInput: executionInput(),
      llmClient: modelThatTriesBothThenFinishes(),
      startedAt: "2026-09-14T10:00:00.000Z",
      siteLabel: "the careers site",
      now: () => new Date("2026-09-14T10:05:00.000Z"),
    });

    expect(result.questions).toHaveLength(2);
    expect(result.questions.map((question) => question.prompt)).toEqual([
      "Have you previously worked at or consulted for us?",
      "What are your salary expectations?",
    ]);
    // The choices travel with the question, and the blank one does not.
    expect(result.questions[0]?.answerOptions).toEqual(["Yes", "No"]);
    expect(result.questions[1]?.answerOptions).toEqual([
      "Up to 50k",
      "50k to 70k",
    ]);
    // ADR 0022: unanswered questions are handed over, never a blocking task.
    expect(result.blocker).toBeNull();
    expect(result.summary).toBe("Filled in what it could; 2 questions left for you");
    expect(result.nextActionLabel).toBe("Open the Job Finder browser and finish it");
  });

  test("a run that throws is recorded as stopped, in words the person can read", async () => {
    const page = questionPage();
    const openSession: ApplyPageSession = {
      ...session(),
      readPage: () => Promise.resolve(page),
    };

    const result = await runAgentApplicationPreparation({
      session: openSession,
      executionInput: executionInput(),
      llmClient: {
        chatWithTools: () =>
          Promise.reject(new Error("the assistant went away mid-form")),
      },
      startedAt: "2026-09-14T10:00:00.000Z",
      siteLabel: "the careers site",
      now: () => new Date("2026-09-14T10:05:00.000Z"),
    });

    expect(result.state).toBe("paused");
    expect(result.detail).toContain("the careers site");
    expect(result.blocker).not.toBeNull();
  });
});


/**
 * The form the person actually met.
 *
 * Names, a phone split into a country list of 240 entries and a number, a
 * file, a URL, a yes/no question whose label carries the site's required star,
 * lists whose first choice is a placeholder, two controls with the same label,
 * and free text. Every one of these has to survive the trip into the record.
 */
describe("a real application form reaching the record", () => {
  function rawControlOf(
    index: number,
    overrides: Record<string, unknown>,
  ): RawApplyPage["controls"][number] {
    return {
      index,
      tagName: "input",
      inputType: "text",
      role: "",
      id: `f${index}`,
      name: `f${index}`,
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
    } as RawApplyPage["controls"][number];
  }

  function realisticPage(): RawApplyPage {
    const countries = Array.from({ length: 240 }, (_, index) =>
      index === 0 ? "Select..." : `Country ${index}`,
    );
    return {
      ...rawPage("Apply for this job"),
      controls: [
        rawControlOf(0, { label: "First Name", required: true }),
        rawControlOf(1, { label: "Last Name", required: true }),
        rawControlOf(2, { label: "Email", inputType: "email", required: true }),
        rawControlOf(3, {
          tagName: "select",
          inputType: "select-one",
          label: "Phone",
          groupLabel: "Phone",
          options: countries,
          required: true,
        }),
        rawControlOf(4, { label: "Phone", groupLabel: "Phone", required: true }),
        rawControlOf(5, { inputType: "file", label: "Resume/CV", required: true }),
        rawControlOf(6, { label: "LinkedIn Profile", inputType: "url" }),
        rawControlOf(7, {
          tagName: "select",
          inputType: "select-one",
          label: "Have you previously worked at or consulted for GitLab?*",
          options: ["Select...", "Yes", "No"],
          required: true,
        }),
        rawControlOf(8, {
          tagName: "select",
          inputType: "select-one",
          label: "Gender",
          groupLabel: "U.S. Equal Employment Opportunity information",
          options: ["Select...", "Male", "Female", "Decline To Self Identify"],
        }),
        rawControlOf(9, {
          tagName: "select",
          inputType: "select-one",
          label: "Gender",
          groupLabel: "Voluntary Self-Identification",
          options: ["Select...", "Male", "Female", " "],
        }),
        rawControlOf(10, {
          tagName: "textarea",
          inputType: "textarea",
          label: "Why do you want to work here?",
        }),
      ],
      actions: [
        { index: 0, label: "Submit application", visible: true, disabled: false },
      ],
    };
  }

  /** Works every control in turn, then finishes: what the model really does. */
  function modelThatWorksEveryControl(count: number): LLMClient {
    let calls = 0;
    return {
      chatWithTools: () => {
        const name = calls < count ? "answer_control" : "finish";
        const args =
          calls < count
            ? { ref: `c${calls}`, freeTextAnswer: "Because the work matters." }
            : { reason: "Nothing left to fill in" };
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

  test("every question survives the trip into the record", async () => {
    const page = realisticPage();
    const openSession: ApplyPageSession = {
      ...session(),
      readPage: () => Promise.resolve(page),
    };

    const result = await runAgentApplicationPreparation({
      session: openSession,
      executionInput: executionInput(),
      llmClient: modelThatWorksEveryControl(11),
      startedAt: "2026-09-14T10:00:00.000Z",
      siteLabel: "the careers site",
      now: () => new Date("2026-09-14T10:05:00.000Z"),
    });

    expect(result.state).toBe("paused");
    for (const question of result.questions) {
      expect(question.prompt.trim().length).toBeGreaterThan(0);
      expect(question.id.trim().length).toBeGreaterThan(0);
      for (const option of question.answerOptions) {
        expect(option.trim().length).toBeGreaterThan(0);
      }
    }
    // Two controls sharing a label must not produce two records with one id.
    const ids = result.questions.map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
