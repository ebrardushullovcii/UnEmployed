import { constants } from "node:fs";
import { access } from "node:fs/promises";

import { JobPostingSchema, type JobPosting } from "@unemployed/contracts";

export function uniqueByKey<TValue>(
  values: readonly TValue[],
  getKey: (value: TValue) => string,
): TValue[] {
  const seen = new Set<string>();

  return values.flatMap((value) => {
    const key = getKey(value);

    if (!key || seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [value];
  });
}

export function validateJobPostings(values: readonly JobPosting[], context: string) {
  if (!Array.isArray(values)) {
    console.warn(
      `[BrowserRuntime] Expected an array of job postings from ${context}, received ${typeof values}.`,
    );
    return [];
  }

  return values.flatMap((value) => {
    const parsed = JobPostingSchema.safeParse(value);

    if (!parsed.success) {
      console.warn(
        `[BrowserRuntime] Skipping invalid job posting from ${context}:`,
        parsed.error.flatten(),
      );
      return [];
    }

    return [parsed.data];
  });
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function buildChromeExecutableCandidates(explicitPath?: string): string[] {
  const candidates = explicitPath ? [explicitPath] : [];

  if (process.platform === "win32") {
    const programFiles = process.env.PROGRAMFILES ?? "C:\\Program Files";
    const programFilesX86 =
      process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)";

    candidates.push(
      `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
      `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env.LOCALAPPDATA ?? ""}\\Google\\Chrome\\Application\\chrome.exe`,
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
    );
  }

  return uniqueByKey(
    candidates.map((candidate) => candidate.trim()).filter(Boolean),
    (candidate) => candidate.toLowerCase(),
  );
}

export function buildQuerySummary(
  targetRoles: readonly string[],
  locations: readonly string[],
  siteLabel?: string,
): string {
  const roles = targetRoles.join(", ") || "all roles";
  const preferredLocations = locations.join(", ") || "all locations";
  const target = siteLabel?.trim() || "configured target";
  return `${roles} | ${preferredLocations} | ${target}`;
}
