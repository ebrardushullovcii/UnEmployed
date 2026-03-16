import type { DesktopPlatformPing } from '@unemployed/contracts'

declare global {
  interface Window {
    unemployed: {
      ping: () => Promise<DesktopPlatformPing>
    }
  }
}

export {}

