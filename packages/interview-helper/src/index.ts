import type { OverlayWindowState } from '@unemployed/os-integration'

export const interviewHelperPackageReady = true

export const liveCuePriorities = ['low', 'normal', 'high'] as const
export type LiveCuePriority = (typeof liveCuePriorities)[number]

export interface LiveCue {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly priority: LiveCuePriority
}

export interface InterviewOverlayModel {
  readonly visible: boolean
  readonly mode: 'compact' | 'expanded'
  readonly cues: readonly LiveCue[]
}

export function toOverlayWindowState(model: InterviewOverlayModel): OverlayWindowState {
  return {
    kind: 'interview-overlay',
    mode: model.visible ? model.mode : 'hidden',
    visible: model.visible,
    alwaysOnTop: true,
    focusable: false,
    ignoreMouseEvents: model.mode === 'compact'
  }
}
