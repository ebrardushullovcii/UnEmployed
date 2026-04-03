import type { Page } from 'playwright'
import type { AgentState } from '../types'
import { appendPhaseEvidence, sanitizeUrl } from './evidence'

function is404LikeUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    return /(^|\/)(404|not-found)(\/|$)/i.test(parsedUrl.pathname)
  } catch {
    return false
  }
}

function is404LikeTitle(title: string): boolean {
  return /\b(404|not found|page not found)\b/i.test(title)
}

export async function recoverFrom404LikeSurface(page: Page, state: AgentState): Promise<void> {
  const currentUrl = page.url()
  const pageTitle = await page.title().catch(() => '')
  const is404Like = is404LikeUrl(currentUrl) || is404LikeTitle(pageTitle)

  if (!is404Like) {
    if (currentUrl) {
      state.lastStableUrl = currentUrl
    }
    return
  }

  if (!state.lastStableUrl || state.lastStableUrl === currentUrl) {
    return
  }

  try {
    await page.goto(state.lastStableUrl, { waitUntil: 'domcontentloaded', timeout: 5000 })
    await page.waitForTimeout(500)
    state.currentUrl = page.url()
    state.visitedUrls.add(state.currentUrl)
    appendPhaseEvidence(state, 'routeSignals', [
      sanitizeUrl(state.currentUrl)
        ? `Recovered to the last known jobs surface after a not-found route: ${sanitizeUrl(state.currentUrl)}`
        : null
    ])
  } catch {
    // Ignore recovery evidence when the fallback navigation fails.
  }
}
