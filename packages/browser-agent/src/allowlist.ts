// Shared URL allowlist for browser agent
// Only these hostnames are allowed for navigation

export const ALLOWED_HOSTNAMES = ['linkedin.com', 'www.linkedin.com']

export function isAllowedUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsedUrl = new URL(url)
    // Only allow http/https schemes
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return { valid: false, error: `Invalid URL scheme: ${parsedUrl.protocol}` }
    }
    // Check hostname against allowlist
    const hostname = parsedUrl.hostname.toLowerCase()
    const isAllowed = ALLOWED_HOSTNAMES.some(allowed =>
      hostname === allowed || hostname.endsWith(`.${allowed}`)
    )
    if (!isAllowed) {
      return { valid: false, error: `Navigation to ${hostname} is not allowed. Only LinkedIn is permitted.` }
    }
    return { valid: true }
  } catch {
    return { valid: false, error: `Invalid URL format` }
  }
}
