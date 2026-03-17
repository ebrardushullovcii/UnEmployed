export const osIntegrationPackageReady = true

export const appWindowKinds = ['main', 'interview-panel', 'interview-overlay'] as const
export type AppWindowKind = (typeof appWindowKinds)[number]

export const overlayPresentationModes = ['hidden', 'compact', 'expanded'] as const
export type OverlayPresentationMode = (typeof overlayPresentationModes)[number]

export const capturePolicyModes = ['default', 'platform-protected'] as const
export type CapturePolicyMode = (typeof capturePolicyModes)[number]

export interface OverlayWindowState {
  readonly kind: 'interview-overlay'
  readonly mode: OverlayPresentationMode
  readonly visible: boolean
  readonly alwaysOnTop: boolean
  readonly focusable: boolean
  readonly ignoreMouseEvents: boolean
}

export interface OverlayWindowController {
  ensureWindow(kind: AppWindowKind): Promise<void>
  syncOverlayWindow(state: OverlayWindowState): Promise<void>
  closeWindow(kind: AppWindowKind): Promise<void>
}

export interface WindowPolicyAdapter {
  setAlwaysOnTop(input: { kind: AppWindowKind; value: boolean }): Promise<void>
  setFocusable(input: { kind: AppWindowKind; value: boolean }): Promise<void>
  setIgnoreMouseEvents(input: { kind: AppWindowKind; value: boolean }): Promise<void>
}

export interface CapturePolicyAdapter {
  setCapturePolicy(input: { kind: AppWindowKind; mode: CapturePolicyMode }): Promise<void>
}

export interface GlobalShortcutAdapter {
  registerShortcut(accelerator: string, actionId: string): Promise<void>
  unregisterShortcut(accelerator: string): Promise<void>
}
