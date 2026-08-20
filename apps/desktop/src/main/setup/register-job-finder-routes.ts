import type { IpcMain } from "electron";
import { registerJobFinderRouteHandlers } from "../routes/job-finder";

export function registerJobFinderDesktopRoutes(ipcMain: IpcMain) {
  registerJobFinderRouteHandlers(ipcMain, { includeBootstrapRoutes: false });
}
