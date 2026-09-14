import { CandidateProfileSchema } from "@unemployed/contracts";
import { describe, expect, test } from "vitest";

import type { LLMClient } from "../agent/contracts";
import { runApplyAgent } from "./apply-agent";
import type { RawApplyPage } from "@unemployed/contracts";
import { buildApplyFormObservation } from "./page-hands";
import type { ApplyAgentConfig, ApplyPageHands } from "./types";

/**
 * How the loop ends.
 *
 * There is no step quota: the agent decides when the form is done. What is
 * bounded is going nowhere — a stall gets one warning and then the run stops,
 * and the agent can stop itself by finishing as stuck.
 */

function page(overrides: Partial<RawApplyPage> = {}): RawApplyPage {
  return {
    url: "https://apply.example.test/form",
    title: "Apply",
    bodyText: "Apply for the role",
    controls: [],
    actions: [{ index: 0, label: "Continue", visible: true, disabled: false }],
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
