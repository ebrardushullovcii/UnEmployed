// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationsDetailPanelPrivacyReceiptSection } from "./applications-detail-panel-privacy-receipt-section";

afterEach(cleanup);

describe("ApplicationsDetailPanelPrivacyReceiptSection", () => {
  it("shows the exact destination, CV, data handling, writes, and safety boundary", () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(
      <ApplicationsDetailPanelPrivacyReceiptSection
        onExport={onExport}
        receipt={{
          schemaVersion: 1,
          generatedAt: "2026-07-30T10:00:00.000Z",
          lineage: {
            runId: "run-1",
            jobId: "job-1",
            resultId: "result-1",
          },
          destination: {
            origin: "https://boards.greenhouse.io",
            safePath: "/example/jobs/123",
          },
          resume: {
            source: "original_upload",
            sourceDocumentId: "document-1",
            exportArtifactId: null,
            fileName: "Ebrar-CV.pdf",
            sha256: null,
          },
          stayedLocal: ["job_listing_data", "browser_evidence"],
          modelUse: [],
          externalWrites: [
            {
              category: "resume_attachment",
              fieldLabel: "Resume",
              occurredAt: "2026-07-30T10:00:00.000Z",
              artifactRefId: null,
              verified: true,
            },
          ],
          accountCreationAuthorized: false,
          finalSubmitAuthorized: false,
          finalSubmitOccurred: false,
        }}
      />,
    );

    expect(screen.getByText("Application data receipt")).not.toBeNull();
    expect(
      screen.getByText(
        "https://boards.greenhouse.io/example/jobs/123 · Ebrar-CV.pdf",
      ),
    ).not.toBeNull();
    expect(
      screen.getByText(/contains personal application answers/i),
    ).not.toBeNull();
    expect(screen.getByText("Stayed local")).not.toBeNull();
    expect(screen.getByText("Sent to a model")).not.toBeNull();
    expect(screen.getByText("Written to the site")).not.toBeNull();
    expect(screen.getByText("Resume fingerprint")).not.toBeNull();
    expect(
      screen.getByText(/SHA-256 was not recorded for this legacy receipt/i),
    ).not.toBeNull();
    expect(screen.getByText("Safety boundary")).not.toBeNull();
    expect(screen.getByText(/Final submit was disabled/)).not.toBeNull();
    expect(screen.getByText(/No application was submitted/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Export packet" }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("shows a shortened fingerprint while preserving the full digest as its accessible label", () => {
    const sha256 = "0123456789abcdef".repeat(4);
    render(
      <ApplicationsDetailPanelPrivacyReceiptSection
        onExport={vi.fn()}
        receipt={{
          schemaVersion: 1,
          generatedAt: "2026-07-30T10:00:00.000Z",
          lineage: { runId: "run-1", jobId: "job-1", resultId: "result-1" },
          destination: { origin: "https://example.com", safePath: "/apply" },
          resume: {
            source: "tailored_export",
            sourceDocumentId: null,
            exportArtifactId: "export-1",
            fileName: "Tailored-CV.pdf",
            sha256,
          },
          stayedLocal: [],
          modelUse: [],
          externalWrites: [],
          accountCreationAuthorized: false,
          finalSubmitAuthorized: false,
          finalSubmitOccurred: false,
        }}
      />,
    );

    expect(screen.getByText("Resume fingerprint")).not.toBeNull();
    expect(
      screen.getByText("SHA-256 0123456789ab…456789abcdef"),
    ).not.toBeNull();
    expect(screen.getByLabelText(`Resume SHA-256 ${sha256}`)).not.toBeNull();
    expect(
      screen.getByText(/Confirms the exact resume bytes used/i),
    ).not.toBeNull();
  });

  it("does not render a receipt before one exists", () => {
    const { container } = render(
      <ApplicationsDetailPanelPrivacyReceiptSection
        onExport={vi.fn()}
        receipt={null}
      />,
    );

    expect(container.innerHTML).toBe("");
  });
});
