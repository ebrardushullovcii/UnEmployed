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
    controls: [],
    actions: [],
    validationErrors: [],
    stepLabel: null,
  };
}

/** One open page that reports an empty form and accepts every write. */
function session(bodyText = "Apply for the role"): ApplyPageSession {
  return {
    readPage: () => Promise.resolve(rawPage(bodyText)),
    fillText: (_ref, value) => Promise.resolve({ ok: true, observedValue: value }),
    chooseOption: (_ref, option) =>
      Promise.resolve({ ok: true, observedValue: option }),
    setToggle: () => Promise.resolve({ ok: true, observedValue: "checked" }),
    uploadFile: (_ref, file) =>
      Promise.resolve({ ok: true, observedValue: file.name }),
    clickAction: () => Promise.resolve({ ok: true, observedValue: "clicked" }),
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

  test("a sign-in wall becomes the blocker the person already understands", async () => {
    const result = await runAgentApplicationPreparation({
      session: session("You must be signed in to apply"),
      executionInput: executionInput(),
      llmClient: modelThatFinishes(),
      startedAt: "2026-09-14T10:00:00.000Z",
      siteLabel: "the careers site",
      now: () => new Date("2026-09-14T10:05:00.000Z"),
    });

    expect(result.blocker?.code).toBe("site_login_required");
    expect(result.nextActionLabel).toBe("Sign in on the site");
    expect(result.summary).toBe("This application needs you");
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
            ? "answer_control"
            : calls === 2
              ? "submit_application"
              : "finish";
        const args =
          name === "answer_control"
            ? { ref: "c0" }
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
