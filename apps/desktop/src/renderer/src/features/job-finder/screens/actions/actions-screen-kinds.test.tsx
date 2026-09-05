// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import {
  UserActionRequestSchema,
  userActionRequestKindValues,
  type UserActionCommandInput,
} from "@unemployed/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActionsScreen, userActionKindPresentations } from "./actions-screen";

afterEach(cleanup);

function createRequest(kind: (typeof userActionRequestKindValues)[number]) {
  return UserActionRequestSchema.parse({
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
    title: `Complete ${kind}`,
    summary: "Complete the exact browser-owned step, then return to verify.",
    actionUrl: "https://jobs.example.com/application",
    displayOrigin: "https://jobs.example.com/",
    createdAt: "2026-07-30T10:00:00.000Z",
    updatedAt: "2026-07-30T10:00:00.000Z",
  });
}

describe("Needs you manual-action presentation matrix", () => {
  it("defines one specific presentation for every contract kind", () => {
    expect(Object.keys(userActionKindPresentations)).toEqual([
      ...userActionRequestKindValues,
    ]);

    for (const kind of userActionRequestKindValues) {
      const presentation = userActionKindPresentations[kind];
      expect(presentation.label).not.toBe("Manual action");
      expect(presentation.openLabel).not.toBe("Open");
      expect(presentation.doneLabel).not.toBe("Done");
      expect(presentation.guidance.length).toBeGreaterThan(10);
    }
  });

  it.each(userActionRequestKindValues)(
    "renders specific %s controls while every command remains non-authorizing",
    (kind) => {
      const onCommand = vi.fn<(command: UserActionCommandInput) => void>();
      const presentation = userActionKindPresentations[kind];
      const screen = render(
        <ActionsScreen
          discoveryJobs={[]}
          isPending={() => false}
          onCommand={onCommand}
          onNavigate={vi.fn()}
          requests={[createRequest(kind)]}
        />,
      );

      // "Other" is not a category the user can act on, so that kind shows
      // only the requirement and state badges; every classified kind keeps
      // its specific label badge.
      if (kind === "other") {
        expect(screen.queryByText(presentation.label)).toBeNull();
      } else {
        expect(screen.getByText(presentation.label)).toBeTruthy();
      }
      expect(
        screen.getByText(new RegExp(presentation.guidance, "i")),
      ).toBeTruthy();
      fireEvent.click(
        screen.getByRole("button", { name: presentation.openLabel }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: presentation.doneLabel }),
      );

      expect(onCommand).toHaveBeenCalledTimes(2);
      for (const [command] of onCommand.mock.calls) {
        expect(command).toMatchObject({
          credentialsPolicy: "browser_only",
          submitAuthorized: false,
          accountCreationAuthorized: false,
        });
      }
      // The boundary is still stated on every card, once, in plain language
      // instead of a boxed footnote in internal wording.
      expect(
        screen.getByText(/cannot create an account or submit an application/i),
      ).toBeTruthy();
    },
  );
});
