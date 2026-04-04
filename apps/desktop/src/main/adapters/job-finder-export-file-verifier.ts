import { constants } from "node:fs";
import { access } from "node:fs/promises";

interface LocalResumeExportFileVerifier {
  exists(filePath: string): Promise<boolean>;
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
  };
}
