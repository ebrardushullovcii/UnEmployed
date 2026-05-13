import { open, stat } from "node:fs/promises";
import path from "node:path";
import { clipboard, dialog, type IpcMain } from "electron";
import {
  InterviewAudioTranscriptionInputSchema,
  InterviewCaptionFileReadInputSchema,
  InterviewExportSessionInputSchema,
  InterviewPrepArtifactFromCueInputSchema,
  InterviewSessionActionInputSchema,
  InterviewSessionIdInputSchema,
  InterviewTranscriptAnnotationInputSchema,
  InterviewTranscriptSegmentInputSchema,
  SaveInterviewSetupInputSchema,
} from "@unemployed/contracts";
import { getInterviewHelperService } from "../services/interview-helper";
import {
  syncInterviewOverlayWindows,
  verifyInterviewOverlayCaptureProtection,
} from "../setup/interview-overlay-windows";

const MAX_NATIVE_CAPTION_FILE_BYTES = 2 * 1024 * 1024;

async function withSyncedOverlays<
  T extends Awaited<
    ReturnType<
      Awaited<ReturnType<typeof getInterviewHelperService>>["getWorkspace"]
    >
  >,
>(operation: () => Promise<T>) {
  const workspace = await operation();
  syncInterviewOverlayWindows(workspace);
  return workspace;
}

async function readNativeCaptionFileText(filePath: string) {
  const fileStats = await stat(filePath);
  const bytesToRead = Math.min(fileStats.size, MAX_NATIVE_CAPTION_FILE_BYTES);
  const start = Math.max(0, fileStats.size - bytesToRead);
  const buffer = Buffer.alloc(bytesToRead);
  const file = await open(filePath, "r");

  try {
    await file.read(buffer, 0, bytesToRead, start);
  } finally {
    await file.close();
  }

  return {
    selected: true,
    filePath,
    displayName: path.basename(filePath),
    text: buffer.toString("utf8"),
    truncated: fileStats.size > MAX_NATIVE_CAPTION_FILE_BYTES,
  };
}

export function registerInterviewHelperRouteHandlers(ipcMain: IpcMain) {
  ipcMain.handle("interview-helper:get-workspace", async () => {
    const service = await getInterviewHelperService();
    return service.getWorkspace();
  });

  ipcMain.handle(
    "interview-helper:save-setup",
    async (_event, payload: unknown) => {
      const input = SaveInterviewSetupInputSchema.parse(payload);
      const service = await getInterviewHelperService();
      return withSyncedOverlays(() => service.saveSetup(input));
    },
  );

  ipcMain.handle("interview-helper:run-rehearsal", async () => {
    const service = await getInterviewHelperService();
    return withSyncedOverlays(() => service.runRehearsal());
  });

  ipcMain.handle("interview-helper:start-session", async () => {
    const service = await getInterviewHelperService();
    return withSyncedOverlays(() => service.startSession());
  });

  ipcMain.handle("interview-helper:begin-reconfiguration", async () => {
    const service = await getInterviewHelperService();
    return withSyncedOverlays(() => service.beginSessionReconfiguration());
  });

  ipcMain.handle("interview-helper:finish-reconfiguration", async () => {
    const service = await getInterviewHelperService();
    return withSyncedOverlays(() => service.finishSessionReconfiguration());
  });

  ipcMain.handle(
    "interview-helper:perform-action",
    async (_event, payload: unknown) => {
      const input = InterviewSessionActionInputSchema.parse(payload);
      const service = await getInterviewHelperService();
      return withSyncedOverlays(() => service.performAction(input));
    },
  );

  ipcMain.handle(
    "interview-helper:delete-session",
    async (_event, payload: unknown) => {
      const input = InterviewSessionIdInputSchema.parse(payload);
      const service = await getInterviewHelperService();
      return withSyncedOverlays(() => service.deleteSession(input.sessionId));
    },
  );

  ipcMain.handle(
    "interview-helper:save-cue-as-prep-artifact",
    async (_event, payload: unknown) => {
      const input = InterviewPrepArtifactFromCueInputSchema.parse(payload);
      const service = await getInterviewHelperService();
      return withSyncedOverlays(() => service.saveCueAsPrepArtifact(input));
    },
  );

  ipcMain.handle(
    "interview-helper:add-transcript-annotation",
    async (_event, payload: unknown) => {
      const input = InterviewTranscriptAnnotationInputSchema.parse(payload);
      const service = await getInterviewHelperService();
      return withSyncedOverlays(() => service.addTranscriptAnnotation(input));
    },
  );

  ipcMain.handle(
    "interview-helper:add-transcript-segment",
    async (_event, payload: unknown) => {
      const input = InterviewTranscriptSegmentInputSchema.parse(payload);
      const service = await getInterviewHelperService();
      return withSyncedOverlays(() => service.addTranscriptSegment(input));
    },
  );

  ipcMain.handle(
    "interview-helper:transcribe-audio-chunk",
    async (_event, payload: unknown) => {
      const input = InterviewAudioTranscriptionInputSchema.parse(payload);
      const service = await getInterviewHelperService();
      return withSyncedOverlays(() => service.transcribeAudioChunk(input));
    },
  );

  ipcMain.handle("interview-helper:verify-overlay-protection", async () => {
    const protectedSurfaces = await verifyInterviewOverlayCaptureProtection();
    const service = await getInterviewHelperService();
    return withSyncedOverlays(() =>
      service.recordProtectedSurfaceVerification({ protectedSurfaces }),
    );
  });

  ipcMain.handle("interview-helper:reset-overlay-preferences", async () => {
    const service = await getInterviewHelperService();
    return withSyncedOverlays(() => service.resetOverlayPreferences());
  });

  ipcMain.handle("interview-helper:read-clipboard-text", () => ({
    text: clipboard.readText(),
  }));

  ipcMain.handle("interview-helper:select-caption-file", async () => {
    const selection = await dialog.showOpenDialog({
      title: "Select live caption or transcript file",
      properties: ["openFile"],
      filters: [
        {
          name: "Caption and transcript files",
          extensions: ["txt", "vtt", "srt", "json", "md"],
        },
        { name: "All files", extensions: ["*"] },
      ],
    });

    const filePath = selection.filePaths[0];
    if (selection.canceled || !filePath) {
      return {
        selected: false,
        filePath: null,
        displayName: null,
        text: "",
        truncated: false,
      };
    }

    return readNativeCaptionFileText(filePath);
  });

  ipcMain.handle(
    "interview-helper:read-caption-file",
    async (_event, payload: unknown) => {
      const input = InterviewCaptionFileReadInputSchema.parse(payload);
      return readNativeCaptionFileText(input.filePath);
    },
  );

  ipcMain.handle(
    "interview-helper:export-session",
    async (_event, payload: unknown) => {
      const input = InterviewExportSessionInputSchema.parse(payload);
      const service = await getInterviewHelperService();
      return service.exportSession(input);
    },
  );
}
