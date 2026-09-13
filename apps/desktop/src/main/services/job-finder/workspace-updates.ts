import { BrowserWindow, type WebContents } from "electron";

export const JOB_FINDER_WORKSPACE_UPDATED_CHANNEL =
  "job-finder:workspace-updated";

/** Tells mounted renderers to converge through the existing delta sync. */
export function publishJobFinderWorkspaceUpdate(target?: WebContents): void {
  if (target) {
    const canSend = typeof target.send === "function";
    const isDestroyed =
      typeof target.isDestroyed === "function" && target.isDestroyed();
    if (canSend && !isDestroyed) {
      target.send(JOB_FINDER_WORKSPACE_UPDATED_CHANNEL);
    }
    return;
  }

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(JOB_FINDER_WORKSPACE_UPDATED_CHANNEL);
    }
  }
}
