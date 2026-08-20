import { JobFinderWorkspaceSnapshotSchema } from "@unemployed/contracts";
import type { IpcMain } from "electron";
import { getJobFinderWorkspaceService } from "../services/job-finder";

export function registerJobFinderBootstrapDesktopRoutes(ipcMain: IpcMain) {
  ipcMain.handle("job-finder:get-workspace", async () => {
    const workspaceService = await getJobFinderWorkspaceService();
    return workspaceService.getWorkspaceSnapshot();
  });

  ipcMain.handle("job-finder:get-workspace-bootstrap", async () => {
    const workspaceService = await getJobFinderWorkspaceService();
    return JobFinderWorkspaceSnapshotSchema.parse(
      await workspaceService.getWorkspaceBootstrap(),
    );
  });
}
