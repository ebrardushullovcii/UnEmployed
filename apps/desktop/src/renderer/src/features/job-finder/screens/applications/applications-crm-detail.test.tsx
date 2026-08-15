// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  ApplicationCrmSettingsSchema,
  ApplicationRecordSchema,
} from "@unemployed/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ApplicationsCrmDetail } from "./applications-crm-detail";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ApplicationsCrmDetail", () => {
  test("sends a revision-bound manual stage mutation and explains the no-submit boundary", async () => {
    Object.defineProperty(window, "unemployed", {
      configurable: true,
      value: {
        jobFinder: {
          listCandidateAssets: vi.fn(() => Promise.resolve({ assets: [] })),
        },
      },
    });
    const record = ApplicationRecordSchema.parse({
      id: "application_1",
      jobId: "job_1",
      title: "Engineer",
      company: "Example",
      status: "approved",
      lastActionLabel: "Prepared",
      nextActionLabel: "Review",
      lastUpdatedAt: "2026-08-15T10:00:00.000Z",
      crm: {
        revision: 3,
        stage: "ready_for_approval",
        stageChangedAt: "2026-08-15T10:00:00.000Z",
      },
    });
    const onMutate = vi.fn(() => Promise.resolve());

    render(
      <ApplicationsCrmDetail
        onExport={vi.fn(() => Promise.resolve())}
        onMutate={onMutate}
        record={record}
        settings={ApplicationCrmSettingsSchema.parse({})}
      />,
    );

    expect(document.body.textContent).toContain(
      "Nothing here contacts the employer or submits an application",
    );
    fireEvent.change(screen.getByLabelText("Stage"), {
      target: { value: "applied" },
    });
    await waitFor(() =>
      expect(onMutate).toHaveBeenCalledWith({
        applicationRecordId: "application_1",
        expectedRevision: 3,
        mutation: {
          type: "set_stage",
          stage: "applied",
          customStageId: null,
          note: null,
        },
      }),
    );
  });
});
