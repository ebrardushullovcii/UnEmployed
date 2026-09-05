import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { getConfiguredDesktopUserDataDirectory } from "../setup/user-data-directory";
import { getJobFinderUserDataDirectory } from "../services/job-finder/paths";

interface LocalResumeExportFileVerifier {
  exists(filePath: string): Promise<boolean>;
  sha256(filePath: string): Promise<string>;
  /**
   * The recovered on-disk path `exists`/`sha256` actually used, or null when
   * no candidate exists. Callers that hand the path to something outside this
   * verifier — the application resume artifact, and through it the browser
   * runtime's own `access()` check — must use this instead of the recorded
   * path, or a recovered stale path passes the gate here and then fails there
   * as `missing_resume`.
   */
  resolvePath(filePath: string): Promise<string | null>;
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
    async resolvePath(filePath: string) {
      return resolveExistingResumeExportPath(filePath);
    },
  };
}
