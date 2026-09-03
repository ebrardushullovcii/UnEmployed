import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalResumeExportFileVerifier } from "./job-finder-export-file-verifier";

const directories: string[] = [];
const originalUserDataDirectory = process.env.UNEMPLOYED_USER_DATA_DIR;

afterEach(async () => {
  if (originalUserDataDirectory === undefined) {
    delete process.env.UNEMPLOYED_USER_DATA_DIR;
  } else {
    process.env.UNEMPLOYED_USER_DATA_DIR = originalUserDataDirectory;
  }

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

  it("resolves stale absolute export paths via the current user-data generated directory", async () => {
    const userDataDirectory = await mkdtemp(
      path.join(os.tmpdir(), "resume-user-data-"),
    );
    directories.push(userDataDirectory);
    process.env.UNEMPLOYED_USER_DATA_DIR = userDataDirectory;

    const generatedDirectory = path.join(
      userDataDirectory,
      "documents",
      "resumes",
      "generated",
    );
    const fileName = "1787783717451_jordan-hale_partiful_classic-ats.pdf";
    const currentPath = path.join(generatedDirectory, fileName);
    const staleAbsolutePath = `/old/persona/userdata/documents/resumes/generated/${fileName}`;
    const bytes = Buffer.from("approved-tailored-resume");
    await mkdir(generatedDirectory, { recursive: true });
    await writeFile(currentPath, bytes);

    const verifier = createLocalResumeExportFileVerifier();
    expect(await verifier.exists(staleAbsolutePath)).toBe(true);
    expect(await verifier.sha256(staleAbsolutePath)).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
  });
});
