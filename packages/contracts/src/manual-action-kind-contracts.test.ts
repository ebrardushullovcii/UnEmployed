import { describe, expect, it } from "vitest";

import {
  ApplicationAttemptBlockerSchema,
  UserActionRequestSchema,
  userActionRequestKindValues,
} from "./index";

const now = "2026-07-30T10:00:00.000Z";

describe("manual action kind compatibility", () => {
  it("accepts every specific blocker kind without widening authority", () => {
    for (const kind of userActionRequestKindValues) {
      const request = UserActionRequestSchema.parse({
        id: `action-${kind}`,
        dedupeKey: `dedupe-${kind}`,
        revision: 1,
        kind,
        state: "pending",
        scope: {
          type: "application",
          runId: "run-1",
          jobId: "job-1",
          source: "target_site",
        },
        verification: {
          type: "page_blocker_absent",
          blockerFingerprint: `blocker-${kind}`,
        },
        title: "Complete the browser step",
        summary: "Complete this browser-owned step, then return to verify.",
        createdAt: now,
        updatedAt: now,
      });

      expect(request.kind).toBe(kind);
      expect(request).toMatchObject({
        credentialsPolicy: "browser_only",
        submitAuthorized: false,
        accountCreationAuthorized: false,
      });
    }
  });

  it("defaults a legacy request with no kind to other", () => {
    const request = UserActionRequestSchema.parse({
      id: "legacy-action",
      dedupeKey: "legacy-action",
      revision: 1,
      state: "pending",
      scope: {
        type: "discovery_source",
        targetId: "target-1",
        source: "target_site",
      },
      verification: {
        type: "source_access",
        targetId: "target-1",
        blockerFingerprint: "legacy-blocker",
      },
      title: "Complete a browser step",
      summary: "This older request did not retain a specific classification.",
      createdAt: now,
      updatedAt: now,
    });

    expect(request.kind).toBe("other");
    expect(request.submitAuthorized).toBe(false);
    expect(request.accountCreationAuthorized).toBe(false);
  });

  it("preserves an explicit action kind on application blockers and defaults legacy blockers to null", () => {
    for (const kind of userActionRequestKindValues) {
      expect(
        ApplicationAttemptBlockerSchema.parse({
          code: "requires_manual_review",
          userActionKind: kind,
          summary: "A specific manual step is required.",
        }).userActionKind,
      ).toBe(kind);
    }

    expect(
      ApplicationAttemptBlockerSchema.parse({
        code: "requires_manual_review",
        summary: "A legacy generic manual step is required.",
      }).userActionKind,
    ).toBeUndefined();
  });
});
