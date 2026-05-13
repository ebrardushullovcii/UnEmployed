import {
  createDeterministicInterviewCueCardProvider,
  createDeterministicInterviewScreenshotVisionProvider,
  createDeterministicInterviewSummaryProvider,
  createDeterministicInterviewTranscriptionProvider,
} from '@unemployed/ai-providers'
import { createFileInterviewHelperRepository } from '@unemployed/db'
import { createInterviewHelperService } from '@unemployed/interview-helper'
import {
  createStaticDesktopAudioCaptureAdapter,
  createStaticProtectedOverlaySurfaceAdapter,
} from '@unemployed/os-integration'
import { createElectronDesktopScreenshotCaptureAdapter } from './electron-screenshot-adapter'
import {
  getInterviewHelperTemporaryScreenshotDirectory,
  getInterviewHelperWorkspaceFilePath,
} from './paths'

let interviewHelperServicePromise:
  | Promise<ReturnType<typeof createInterviewHelperService>>
  | undefined

export function getInterviewHelperService() {
  interviewHelperServicePromise ??= Promise.resolve(
    createInterviewHelperService({
      repository: createFileInterviewHelperRepository({
        filePath: getInterviewHelperWorkspaceFilePath(),
      }),
      audioCaptureAdapter: createStaticDesktopAudioCaptureAdapter(process.platform),
      screenshotCaptureAdapter: createElectronDesktopScreenshotCaptureAdapter({
        directory: getInterviewHelperTemporaryScreenshotDirectory(),
      }),
      protectedSurfaceAdapter: createStaticProtectedOverlaySurfaceAdapter({
        platform: process.platform,
      }),
      cueCardProvider: createDeterministicInterviewCueCardProvider(
        'Desktop uses deterministic cue cards until live Interview providers are configured.',
      ),
      screenshotVisionProvider: createDeterministicInterviewScreenshotVisionProvider(),
      transcriptionProvider: createDeterministicInterviewTranscriptionProvider(),
      summaryProvider: createDeterministicInterviewSummaryProvider(),
    }),
  )

  return interviewHelperServicePromise
}

export async function shutdownInterviewHelperService() {
  const servicePromise = interviewHelperServicePromise
  interviewHelperServicePromise = undefined

  if (!servicePromise) {
    return
  }

  const service = await servicePromise
  await service.close()
}
