import type { App } from "electron";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { configureDesktopUserDataDirectory } from "./user-data-directory";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("configureDesktopUserDataDirectory", () => {
  test.each([undefined, "", "   "])(
    "keeps Electron defaults for %j",
    (configuredDirectory) => {
      const setPath = vi.fn();

      expect(
        configureDesktopUserDataDirectory(
          { setPath } as unknown as Pick<App, "setPath">,
          configuredDirectory,
        ),
      ).toBeNull();
      expect(setPath).not.toHaveBeenCalled();
    },
  );

  test("creates and applies one absolute directory before Electron session startup", () => {
    const parentDirectory = mkdtempSync(
      path.join(os.tmpdir(), "unemployed-user-data-"),
    );
    temporaryDirectories.push(parentDirectory);
    const requestedDirectory = path.join(parentDirectory, "isolated-session");
    const setPath = vi.fn();

    const configuredDirectory = configureDesktopUserDataDirectory(
      { setPath } as unknown as Pick<App, "setPath">,
      `  ${requestedDirectory}  `,
    );

    expect(configuredDirectory).toBe(path.resolve(requestedDirectory));
    expect(setPath).toHaveBeenCalledOnce();
    expect(setPath).toHaveBeenCalledWith("userData", configuredDirectory);
  });
});
