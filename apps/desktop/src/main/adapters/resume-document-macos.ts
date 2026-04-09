import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { existsSync } from "node:fs";
import {
  ResumeDocumentBundleSchema,
  type ResumeDocumentBundle,
} from "@unemployed/contracts";

const execFileAsync = promisify(execFile);

function getSwiftParserScriptPath(): string {
  const builtCandidate = new URL("./scripts/parse_resume.swift", import.meta.url).pathname;
  const repoCandidateA = path.join(
    process.cwd(),
    "src/main/adapters/scripts/parse_resume.swift",
  );
  const repoCandidateB = path.join(
    process.cwd(),
    "../src/main/adapters/scripts/parse_resume.swift",
  );

  const candidates = [builtCandidate, repoCandidateA, repoCandidateB];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Swift parser script not found. Tried: ${candidates.join(", ")}`,
  );
}

export async function extractDocxTextWithTextutil(
  filePath: string,
): Promise<string | null> {
  const { stdout } = await execFileAsync("/usr/bin/textutil", [
    "-convert",
    "txt",
    "-stdout",
    filePath,
  ]);

  const normalized = stdout
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return normalized || null;
}

export async function extractPdfDocumentBundleWithMacOs(
  filePath: string,
  input: {
    bundleId: string;
    runId: string;
    sourceResumeId: string;
  },
): Promise<ResumeDocumentBundle> {
  const { stdout } = await execFileAsync("/usr/bin/swift", [
    getSwiftParserScriptPath(),
    filePath,
    input.bundleId,
    input.runId,
    input.sourceResumeId,
  ]);

  return ResumeDocumentBundleSchema.parse(JSON.parse(stdout) as unknown);
}
