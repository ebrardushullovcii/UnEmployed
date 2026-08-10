import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";

interface LocalResumeExportFileVerifier {
  exists(filePath: string): Promise<boolean>;
  sha256(filePath: string): Promise<string>;
}

export function createLocalResumeExportFileVerifier(): LocalResumeExportFileVerifier {
  return {
    async exists(filePath: string) {
      try {
        await access(filePath, constants.F_OK);
        return true;
      } catch {
        return false;
      }
    },
    async sha256(filePath: string) {
      return createHash("sha256")
        .update(await readFile(filePath))
        .digest("hex");
    },
  };
}
