import { createInterviewHelperProvidersFromEnvironment } from '@unemployed/ai-providers'
import { createFileInterviewHelperRepository } from '@unemployed/db'
import { createInterviewHelperService } from '@unemployed/interview-helper'
import { createStaticProtectedOverlaySurfaceAdapter } from '@unemployed/os-integration'
import { createElectronDesktopAudioCaptureAdapter } from './electron-audio-capture-adapter'
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
    (() => {
      const interviewProviders = createInterviewHelperProvidersFromEnvironment()

      return createInterviewHelperService({
        repository: createFileInterviewHelperRepository({
          filePath: getInterviewHelperWorkspaceFilePath(),
        }),
        audioCaptureAdapter: createElectronDesktopAudioCaptureAdapter({
          platform: process.platform,
        }),
        screenshotCaptureAdapter: createElectronDesktopScreenshotCaptureAdapter({
          directory: getInterviewHelperTemporaryScreenshotDirectory(),
        }),
        protectedSurfaceAdapter: createStaticProtectedOverlaySurfaceAdapter({
          platform: process.platform,
        }),
        cueCardProvider: interviewProviders.cueCardProvider,
        screenshotVisionProvider: interviewProviders.screenshotVisionProvider,
        transcriptionProvider: interviewProviders.transcriptionProvider,
        summaryProvider: interviewProviders.summaryProvider,
      })
    })(),
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
