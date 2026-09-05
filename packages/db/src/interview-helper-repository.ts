import {
  InterviewWorkspaceSnapshotSchema,
  type InterviewWorkspaceSnapshot,
} from "@unemployed/contracts";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface InterviewHelperRepository {
  load(): Promise<InterviewWorkspaceSnapshot | null>;
  save(snapshot: InterviewWorkspaceSnapshot): Promise<void>;
  close(): Promise<void>;
}

export interface FileInterviewHelperRepositoryOptions {
  filePath: string;
}

export function createFileInterviewHelperRepository(
  options: FileInterviewHelperRepositoryOptions,
): InterviewHelperRepository {
  return {
    async load() {
      try {
        const raw = await readFile(options.filePath, "utf8");
        return InterviewWorkspaceSnapshotSchema.parse(
          JSON.parse(raw) as unknown,
        );
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return null;
        }

        throw error;
      }
    },
    async save(snapshot) {
      const normalizedSnapshot = InterviewWorkspaceSnapshotSchema.parse(
        snapshot,
      );
      await mkdir(path.dirname(options.filePath), { recursive: true });
      await writeFile(
        options.filePath,
        `${JSON.stringify(normalizedSnapshot, null, 2)}\n`,
        "utf8",
      );
    },
    close() {
      return Promise.resolve();
    },
  };
}
