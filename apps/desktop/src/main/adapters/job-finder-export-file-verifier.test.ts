import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalResumeExportFileVerifier } from "./job-finder-export-file-verifier";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("createLocalResumeExportFileVerifier", () => {
  it("hashes the exact current file bytes", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "resume-integrity-"),
    );
    directories.push(directory);
    const filePath = path.join(directory, "resume.pdf");
    const bytes = Buffer.from([0, 1, 2, 3, 255]);
    await writeFile(filePath, bytes);

    const verifier = createLocalResumeExportFileVerifier();
    expect(await verifier.exists(filePath)).toBe(true);
    expect(await verifier.sha256(filePath)).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );

    await writeFile(filePath, Buffer.from("tampered"));
    expect(await verifier.sha256(filePath)).not.toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
  });
});
