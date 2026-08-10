import type { App } from "electron";
import { mkdirSync } from "node:fs";
import path from "node:path";

export function configureDesktopUserDataDirectory(
  app: Pick<App, "setPath">,
  configuredDirectory = process.env.UNEMPLOYED_USER_DATA_DIR,
): string | null {
  const requestedDirectory = configuredDirectory?.trim();
  if (!requestedDirectory) {
    return null;
  }

  const resolvedDirectory = path.resolve(requestedDirectory);
  mkdirSync(resolvedDirectory, { recursive: true });
  app.setPath("userData", resolvedDirectory);
  return resolvedDirectory;
}
