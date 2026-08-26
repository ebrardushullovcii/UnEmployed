// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ApplicationPrivacyReceipt } from "@unemployed/contracts";
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
            applicationRecordId: "application-1",
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
          submissionOutcome: null,
        }}
      />,
    );

    expect(screen.getByText("Preparation receipt")).not.toBeNull();
    expect(
      screen.queryByText("Historical application data receipt"),
    ).toBeNull();
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
      screen.getByText(/SHA-256 was not recorded for this preparation/i),
    ).not.toBeNull();
    expect(screen.getByText("Safety record")).not.toBeNull();
    expect(screen.getByText(/Final submit stayed disabled/)).not.toBeNull();
    expect(
      screen.getByText(/No final-submit action was recorded/),
    ).not.toBeNull();
    expect(
      screen.getByText(
        /records what Job Finder stored during this preparation/i,
      ),
    ).not.toBeNull();
    expect(
      screen.getByText(/do not grant or describe current authority/i),
    ).not.toBeNull();
    expect(screen.getByText(/Current product boundary/)).not.toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(
      /No application was submitted/i,
    );
    fireEvent.click(screen.getByRole("button", { name: "Export packet" }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("disables packet export with a plain-language reason when exact application-record lineage is missing", () => {
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
            applicationRecordId: null,
          },
          destination: { origin: "https://example.com", safePath: "/apply" },
          resume: {
            source: "original_upload",
            sourceDocumentId: "document-1",
            exportArtifactId: null,
            fileName: "Ebrar-CV.pdf",
            sha256: null,
          },
          stayedLocal: [],
          modelUse: [],
          externalWrites: [],
          accountCreationAuthorized: false,
          finalSubmitAuthorized: false,
          finalSubmitOccurred: false,
          submissionOutcome: null,
        }}
      />,
    );

    const exportButton = screen.getByRole("button", {
      name: "Export packet",
    });
    if (!(exportButton instanceof HTMLButtonElement)) {
      throw new Error("Export packet control should be a real button element");
    }
    expect(exportButton.disabled).toBe(true);
    fireEvent.click(exportButton);
    expect(onExport).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /This legacy receipt predates exact application-record linking, so Job Finder cannot export its packet/,
      ),
    ).not.toBeNull();
    expect(screen.getByText(/stays visible on this page/)).not.toBeNull();
  });

  it("describes recorded final-submit fields neutrally for a modern lineage-exact receipt", () => {
    render(
      <ApplicationsDetailPanelPrivacyReceiptSection
        onExport={vi.fn()}
        receipt={{
          schemaVersion: 1,
          generatedAt: "2026-07-30T10:00:00.000Z",
          lineage: {
            runId: "run-1",
            jobId: "job-1",
            resultId: "result-1",
            applicationRecordId: "application-1",
          },
          destination: { origin: "https://example.com", safePath: "/apply" },
          resume: {
            source: "tailored_export",
            sourceDocumentId: null,
            exportArtifactId: "export-1",
            fileName: "Tailored-CV.pdf",
            sha256: null,
          },
          stayedLocal: [],
          modelUse: [],
          externalWrites: [],
          accountCreationAuthorized: false,
          finalSubmitAuthorized: true,
          finalSubmitOccurred: true,
          submissionOutcome: null,
        }}
      />,
    );

    expect(
      screen.getByText(
        /This receipt records a final-submit action for this run/,
      ),
    ).not.toBeNull();
    expect(
      screen.getByText(/do not represent a capability in the current product/),
    ).not.toBeNull();
    expect(document.body.textContent ?? "").toMatch(
      /Job Finder cannot submit applications/i,
    );
  });

  it("describes observed preparation writes without claiming submission", () => {
    render(
      <ApplicationsDetailPanelPrivacyReceiptSection
        onExport={vi.fn()}
        receipt={{
          schemaVersion: 1,
          generatedAt: "2026-07-30T10:00:00.000Z",
          lineage: {
            runId: "run-1",
            jobId: "job-1",
            resultId: "result-1",
            applicationRecordId: "application-1",
          },
          destination: { origin: "https://example.com", safePath: "/apply" },
          resume: {
            source: "original_upload",
            sourceDocumentId: "document-1",
            exportArtifactId: null,
            fileName: "Ebrar-CV.pdf",
            sha256: null,
          },
          stayedLocal: [],
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
          submissionOutcome: null,
        }}
      />,
    );

    expect(
      screen.getByText(/Preparation writes Job Finder observed/),
    ).not.toBeNull();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/do not confirm how the site stored the data/);
    expect(text).not.toMatch(/application (?:was|has been) submitted/i);
  });

  it("shows a shortened fingerprint while preserving the full digest as its accessible label", () => {
    const sha256 = "0123456789abcdef".repeat(4);
    render(
      <ApplicationsDetailPanelPrivacyReceiptSection
        onExport={vi.fn()}
        receipt={{
          schemaVersion: 1,
          generatedAt: "2026-07-30T10:00:00.000Z",
          lineage: {
            runId: "run-1",
            jobId: "job-1",
            resultId: "result-1",
            applicationRecordId: "application-1",
          },
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
          submissionOutcome: null,
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

  it("keeps legacy wording exclusive to receipts without exact application-record lineage", () => {
    const baseReceipt: ApplicationPrivacyReceipt = {
      schemaVersion: 1,
      generatedAt: "2026-07-30T10:00:00.000Z",
      lineage: {
        runId: "run-1",
        jobId: "job-1",
        resultId: "result-1",
        applicationRecordId: null,
      },
      destination: { origin: "https://example.com", safePath: "/apply" },
      resume: {
        source: "tailored_export",
        sourceDocumentId: null,
        exportArtifactId: "export-1",
        fileName: "Tailored-CV.pdf",
        sha256: null,
      },
      stayedLocal: [],
      modelUse: [],
      externalWrites: [],
      accountCreationAuthorized: false,
      finalSubmitAuthorized: false,
      finalSubmitOccurred: false,
      submissionOutcome: null,
    };

    const modern = render(
      <ApplicationsDetailPanelPrivacyReceiptSection
        onExport={vi.fn()}
        receipt={{
          ...baseReceipt,
          lineage: { ...baseReceipt.lineage, applicationRecordId: "app-1" },
        }}
      />,
    );
    const modernText = modern.container.textContent ?? "";
    expect(modernText).not.toMatch(/legacy/i);
    expect(screen.getByText("Preparation receipt")).not.toBeNull();
    modern.unmount();

    render(
      <ApplicationsDetailPanelPrivacyReceiptSection
        onExport={vi.fn()}
        receipt={{
          ...baseReceipt,
          lineage: { ...baseReceipt.lineage, applicationRecordId: null },
        }}
      />,
    );
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Historical application data receipt/);
    expect(text).toMatch(
      /This legacy receipt predates exact application-record linking/,
    );
    expect(text).toMatch(/Legacy data marked final submit as disabled/);
  });
});
