import type { IpcMain } from "electron";
import { registerInterviewHelperRouteHandlers } from "../routes/interview-helper";

export function registerInterviewHelperDesktopRoutes(ipcMain: IpcMain) {
  registerInterviewHelperRouteHandlers(ipcMain);
}
