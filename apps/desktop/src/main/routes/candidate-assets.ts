import { BrowserWindow, dialog } from "electron";
import type { IpcMain, IpcMainInvokeEvent, OpenDialogOptions } from "electron";
import {
  CandidateAssetDeleteInputSchema,
  CandidateAssetDeleteResultSchema,
  CandidateAssetImportInputSchema,
  CandidateAssetImportResultSchema,
  CandidateAssetListInputSchema,
  CandidateAssetListResultSchema,
  CandidateAssetRestoreInputSchema,
  CandidateAssetRestoreResultSchema,
} from "@unemployed/contracts";
import { CandidateAssetLibraryError } from "../services/job-finder/candidate-asset-library";
import type { CandidateAssetLibrary } from "../services/job-finder/candidate-asset-library";
import { getCandidateAssetLibrary } from "../services/job-finder/candidate-asset-library-instance";

interface CandidateAssetRouteDependencies {
  library: CandidateAssetLibrary;
  selectFile: (event: IpcMainInvokeEvent) => Promise<string | null>;
}

const fileDialogOptions: OpenDialogOptions = {
  title: "Import a document or asset",
  buttonLabel: "Import securely",
  properties: ["openFile"],
  filters: [
    {
      name: "Supported documents and images",
      extensions: [
        "pdf",
        "docx",
        "txt",
        "md",
        "csv",
        "vtt",
        "srt",
        "png",
        "jpg",
        "jpeg",
        "webp",
      ],
    },
  ],
};

async function selectCandidateAssetFile(event: IpcMainInvokeEvent) {
  const parentWindow = BrowserWindow.fromWebContents(event.sender);
  const selection = parentWindow
    ? await dialog.showOpenDialog(parentWindow, fileDialogOptions)
    : await dialog.showOpenDialog(fileDialogOptions);
  return selection.canceled ? null : (selection.filePaths[0] ?? null);
}

async function runAssetOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CandidateAssetLibraryError) throw error;
    throw new CandidateAssetLibraryError(
      "The candidate asset storage operation could not be completed.",
    );
  }
}

export function registerCandidateAssetRouteHandlers(
  ipcMain: IpcMain,
  dependencies: CandidateAssetRouteDependencies = {
    library: getCandidateAssetLibrary(),
    selectFile: selectCandidateAssetFile,
  },
) {
  ipcMain.handle(
    "job-finder:candidate-assets:list",
    async (_event, payload) => {
      const input = CandidateAssetListInputSchema.parse(payload ?? {});
      return runAssetOperation(async () =>
        CandidateAssetListResultSchema.parse(
          await dependencies.library.list(input),
        ),
      );
    },
  );

  ipcMain.handle(
    "job-finder:candidate-assets:import",
    async (event, payload) => {
      const input = CandidateAssetImportInputSchema.parse(payload);
      const sourcePath = await dependencies.selectFile(event);
      if (!sourcePath) {
        return CandidateAssetImportResultSchema.parse({ status: "cancelled" });
      }
      return runAssetOperation(async () =>
        CandidateAssetImportResultSchema.parse(
          await dependencies.library.importFromSourcePath(sourcePath, input),
        ),
      );
    },
  );

  ipcMain.handle(
    "job-finder:candidate-assets:delete",
    async (_event, payload) => {
      const input = CandidateAssetDeleteInputSchema.parse(payload);
      return runAssetOperation(async () =>
        CandidateAssetDeleteResultSchema.parse(
          await dependencies.library.softDelete(input.assetId),
        ),
      );
    },
  );

  ipcMain.handle(
    "job-finder:candidate-assets:restore",
    async (_event, payload) => {
      const input = CandidateAssetRestoreInputSchema.parse(payload);
      return runAssetOperation(async () =>
        CandidateAssetRestoreResultSchema.parse(
          await dependencies.library.restore(input),
        ),
      );
    },
  );
}
