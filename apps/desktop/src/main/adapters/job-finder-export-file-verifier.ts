import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { getConfiguredDesktopUserDataDirectory } from "../setup/user-data-directory";
import { getJobFinderUserDataDirectory } from "../services/job-finder/paths";

interface LocalResumeExportFileVerifier {
  exists(filePath: string): Promise<boolean>;
  sha256(filePath: string): Promise<string>;
}

function appendUserDataResumeExportCandidates(
  trimmedPath: string,
  candidates: Set<string>,
): void {
  let userDataDirectory = getConfiguredDesktopUserDataDirectory();
  if (!userDataDirectory) {
    try {
      userDataDirectory = getJobFinderUserDataDirectory();
    } catch {
      return;
    }
  }

  if (!path.isAbsolute(trimmedPath)) {
    candidates.add(path.resolve(userDataDirectory, trimmedPath));
  }

  const documentsMarker = "documents/resumes";
  const markerIndex = trimmedPath.indexOf(documentsMarker);
  if (markerIndex >= 0) {
    candidates.add(
      path.resolve(
        userDataDirectory,
        trimmedPath.slice(markerIndex).replace(/^\/+/, ""),
      ),
    );
  }

  candidates.add(
    path.join(
      userDataDirectory,
      "documents",
      "resumes",
      "generated",
      path.basename(trimmedPath),
    ),
  );
}

function buildResumeExportPathCandidates(filePath: string): string[] {
  const trimmedPath = filePath.trim();
  if (!trimmedPath) {
    return [];
  }

  const candidates = new Set<string>([trimmedPath]);
  appendUserDataResumeExportCandidates(trimmedPath, candidates);

  return [...candidates];
}

async function resolveExistingResumeExportPath(
  filePath: string,
): Promise<string | null> {
  for (const candidate of buildResumeExportPathCandidates(filePath)) {
    try {
      await access(candidate, constants.F_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

export function createLocalResumeExportFileVerifier(): LocalResumeExportFileVerifier {
  return {
    async exists(filePath: string) {
      return (await resolveExistingResumeExportPath(filePath)) !== null;
    },
    async sha256(filePath: string) {
      const resolvedPath = await resolveExistingResumeExportPath(filePath);
      if (!resolvedPath) {
        throw new Error(`Resume export file is missing on disk: ${filePath}`);
      }

      return createHash("sha256")
        .update(await readFile(resolvedPath))
        .digest("hex");
    },
  };
}
