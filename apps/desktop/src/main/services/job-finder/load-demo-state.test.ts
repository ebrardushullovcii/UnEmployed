import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  JOB_FINDER_DEMO_CONSENT_RESUME_PATH,
  JOB_FINDER_DEMO_EXPORT_RESUME_CONTENT,
  JOB_FINDER_DEMO_EXPORT_RESUME_SHA256,
  JOB_FINDER_DEMO_READY_RESUME_PATH,
  JOB_FINDER_DEMO_RESUME_FORMAT,
  JOB_FINDER_DEMO_SOURCE_RESUME_CONTENT,
  JOB_FINDER_DEMO_SOURCE_RESUME_PATH,
  JOB_FINDER_DEMO_SOURCE_RESUME_SHA256,
} from "../../adapters/job-finder-demo-resume-files";
import {
  createApplyQueueDemoState,
  createResumeWorkspaceDemoState,
} from "../../adapters/job-finder-demo-state";
import { ensureDemoResumeFiles } from "./load-demo-state";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Job Finder demo resume integrity", () => {
  it("writes exact source and export bytes that match their recorded digests", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "job-finder-demo-integrity-"),
    );
    directories.push(directory);
    const sourcePath = path.join(directory, "source.pdf");
    const exportPaths = [
      path.join(directory, "ready.pdf"),
      path.join(directory, "consent.pdf"),
    ];

    await ensureDemoResumeFiles(sourcePath, exportPaths);

    const sourceBytes = await readFile(sourcePath);
    expect(sourceBytes.toString("utf8")).toBe(
      JOB_FINDER_DEMO_SOURCE_RESUME_CONTENT,
    );
    expect(createHash("sha256").update(sourceBytes).digest("hex")).toBe(
      JOB_FINDER_DEMO_SOURCE_RESUME_SHA256,
    );

    for (const exportPath of exportPaths) {
      const exportBytes = await readFile(exportPath);
      expect(exportBytes.toString("utf8")).toBe(
        JOB_FINDER_DEMO_EXPORT_RESUME_CONTENT,
      );
      expect(createHash("sha256").update(exportBytes).digest("hex")).toBe(
        JOB_FINDER_DEMO_EXPORT_RESUME_SHA256,
      );
    }
  });

  it("wires the exact digests and format into both demo states", () => {
    const resumeState = createResumeWorkspaceDemoState();
    const applyState = createApplyQueueDemoState();

    expect(resumeState.profile.baseResume.sha256).toBe(
      JOB_FINDER_DEMO_SOURCE_RESUME_SHA256,
    );
    expect(applyState.profile.baseResume.sha256).toBe(
      JOB_FINDER_DEMO_SOURCE_RESUME_SHA256,
    );
    expect(applyState.resumeExportArtifacts).toHaveLength(2);
    expect(resumeState.profile.baseResume.storagePath).toBe(
      JOB_FINDER_DEMO_SOURCE_RESUME_PATH,
    );
    expect(
      applyState.resumeExportArtifacts.map((artifact) => artifact.filePath),
    ).toEqual([
      JOB_FINDER_DEMO_READY_RESUME_PATH,
      JOB_FINDER_DEMO_CONSENT_RESUME_PATH,
    ]);
    for (const artifact of applyState.resumeExportArtifacts) {
      expect(artifact.format).toBe(JOB_FINDER_DEMO_RESUME_FORMAT);
      expect(artifact.sha256).toBe(JOB_FINDER_DEMO_EXPORT_RESUME_SHA256);
      expect(artifact.pageCount).toBe(1);
    }
  });
});
