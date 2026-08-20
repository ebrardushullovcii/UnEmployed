import type { IpcMain } from "electron";
import { registerApplicationDocumentRouteHandlers } from "../routes/application-documents";
import { registerCandidateAssetRouteHandlers } from "../routes/candidate-assets";

export function registerJobFinderAssetDesktopRoutes(ipcMain: IpcMain) {
  registerCandidateAssetRouteHandlers(ipcMain);
  registerApplicationDocumentRouteHandlers(ipcMain);
}
