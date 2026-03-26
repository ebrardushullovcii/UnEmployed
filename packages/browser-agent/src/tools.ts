import { z } from 'zod'
import type { ToolDefinition } from './types'

// Helper to validate URLs against allowlist
const ALLOWED_HOSTNAMES = ['linkedin.com', 'www.linkedin.com']

function isAllowedUrl(url: string): { valid: boolean; error?: string } {
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

// Maximum timeout for navigation operations (2 minutes)
export const MAX_NAVIGATION_TIMEOUT = 120_000

// Tool payload schemas
const NavigateSchema = z.object({
  url: z.string().url(),
  timeout: z.number().int().positive().max(MAX_NAVIGATION_TIMEOUT).optional().default(30000),
  waitFor: z.enum(['domcontentloaded', 'load', 'networkidle']).optional().default('domcontentloaded')
})

const ClickSchema = z.object({
  role: z.string().min(1),
  name: z.string().min(1),
  index: z.number().int().nonnegative().optional().default(0),
  retryIfNotVisible: z.boolean().optional().default(true)
})

const FillSchema = z.object({
  role: z.string().min(1),
  name: z.string().min(1),
  text: z.string().min(1),
  index: z.number().int().nonnegative().optional().default(0),
  submit: z.boolean().optional().default(false)
})

const ScrollDownSchema = z.object({
  amount: z.number().int().positive().optional().default(800)
})

const ExtractJobsSchema = z.object({
  pageType: z.enum(['search_results', 'job_detail', 'company_page', 'unknown']),
  maxJobs: z.number().int().positive().optional().default(5)
})

const FinishSchema = z.object({
  reason: z.string().min(1)
})

// Recovery helper for when navigation goes off allowlist
async function recoverFromOffAllowlist(
  page: import('playwright').Page,
  invalidUrl: string,
  previousUrl: string
): Promise<{ recovered: boolean; error: string }> {
  const error = `Navigation went to disallowed URL: ${invalidUrl}`
  
  // Try to go back
  try {
    await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 })
    await page.waitForTimeout(500)
    
    // Check if we're back on an allowed URL
    const currentUrl = page.url()
    const urlCheck = isAllowedUrl(currentUrl)
    if (urlCheck.valid) {
      return { recovered: true, error }
    }
  } catch {
    // goBack failed, try direct navigation
  }
  
  // If still off-allowlist, try to navigate to the previous allowed URL
  if (previousUrl && isAllowedUrl(previousUrl).valid) {
    try {
      await page.goto(previousUrl, { waitUntil: 'domcontentloaded', timeout: 5000 })
      return { recovered: true, error: error + ` (recovered to ${previousUrl})` }
    } catch {
      // Navigation also failed
    }
  }
  
  // Recovery failed
  return { recovered: false, error: error + ' (recovery failed - session may need manual intervention)' }
}

export const browserTools: ToolDefinition[] = [
  {
    name: 'navigate',
    description: `Navigate to a URL. Use this to go to job sites or specific pages.
    
You control the timeout strategy:
- For fast pages: use timeout 5000 (5 seconds)
- For slow pages: use timeout 30000 (30 seconds)  
- If a page times out, you can decide whether to retry, wait longer, or proceed anyway based on the partialLoad info returned.`,
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to'
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000). Use shorter timeouts (5000-10000) for faster navigation, longer (30000+) for heavy pages.',
          default: 30000
        },
        waitFor: {
          type: 'string',
          enum: ['domcontentloaded', 'load', 'networkidle'],
          description: 'What to wait for before considering navigation complete. Use "domcontentloaded" for speed, "networkidle" for full page load.',
          default: 'domcontentloaded'
        }
      },
      required: ['url']
    },
    execute: async (args, context) => {
      // Validate args against schema
      const parseResult = NavigateSchema.safeParse(args)
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid navigate arguments: ${parseResult.error.issues.map(i => i.message).join(', ')}`
        }
      }
      const { url, timeout, waitFor } = parseResult.data
      
      const { page, state } = context
      const startTime = Date.now()
      
      // Validate URL before navigation
      const urlValidation = isAllowedUrl(url)
      if (!urlValidation.valid) {
        return {
          success: false,
          error: urlValidation.error ?? 'URL validation failed'
        }
      }
      
      try {
        await page.goto(url, { 
          waitUntil: waitFor,
          timeout 
        })
        
        const finalUrl = page.url()
        const loadTime = Date.now() - startTime
        
        // Validate final URL after navigation (redirects could escape allowlist)
        const finalUrlValidation = isAllowedUrl(finalUrl)
        if (!finalUrlValidation.valid) {
          // Redirect went off-allowlist - use recovery helper
          const recovery = await recoverFromOffAllowlist(page, finalUrl, url)
          state.currentUrl = page.url() // Update to whatever we recovered to
          return {
            success: false,
            error: recovery.error,
            data: {
              requestedUrl: url,
              finalUrl: finalUrl,
              recovered: recovery.recovered
            }
          }
        }
        
        state.currentUrl = finalUrl
        state.visitedUrls.add(finalUrl)
        
        return {
          success: true,
          data: { 
            url: finalUrl, 
            title: await page.title(),
            loadTimeMs: loadTime,
            waitState: waitFor
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Navigation failed'
        const currentUrl = page.url()
        const isPartialLoad = currentUrl && currentUrl !== 'about:blank' && currentUrl !== url
        
        return {
          success: false,
          error: errorMessage,
          data: {
            requestedUrl: url,
            currentUrl: currentUrl || null,
            partialLoad: isPartialLoad,
            timeElapsed: Date.now() - startTime,
            errorType: errorMessage.includes('timeout') ? 'timeout' : 'navigation_error'
          }
        }
      }
    }
  },

  {
    name: 'get_interactive_elements',
    description: `Get a list of interactive elements on the page with their accessibility role, name, and occurrence index.

Use this to understand what's clickable, fillable, or scrollable on the page.
Returns elements with role, name, and index that you can use with click(role, name, index) or fill(role, name, index) tools.

Example: { role: 'button', name: 'Apply', index: 0 } can be clicked with click('button', 'Apply', 0)

Note: If multiple elements have the same role and name, use the index (0-based) to disambiguate which one to interact with.`,
    parameters: {
      type: 'object',
      properties: {}
    },
    execute: async (_args, context) => {
      const { page } = context

      try {
        // Use ariaSnapshot to get accessible elements
        const snapshot = await page.locator('body').ariaSnapshot()

        // Parse the snapshot to extract interactive elements
        const lines = snapshot.split('\n')
        const elements: Array<{ role: string; name: string; ref: string }> = []

        for (const line of lines) {
          // Parse lines like: - button "Apply" [ref=e5]
          const match = line.match(/-\s+(\w+)\s+"([^"]+)"\s+\[ref=([^\]]+)\]/)
          if (match) {
            const role = match[1]
            const name = match[2]
            const ref = match[3]
            if (role && name && ref) {
              elements.push({ role, name, ref })
            }
          }
        }

        // Calculate occurrence index for duplicate role/name pairs
        const roleNameIndices = new Map<string, number>()
        const elementsWithIndex = elements.map(el => {
          const key = `${el.role}:${el.name}`
          const index = roleNameIndices.get(key) ?? 0
          roleNameIndices.set(key, index + 1)
          return { ...el, index }
        })

        return {
          success: true,
          data: {
            elementCount: elements.length,
            elements: elementsWithIndex.slice(0, 30), // Limit to first 30 to avoid overwhelming the agent
            hasMore: elements.length > 30
          }
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get page elements'
        }
      }
    }
  },

  {
    name: 'click',
    description: `Click an element by its role and name.

You get role, name, and index from get_interactive_elements().
Use this to click buttons, links, job listings, etc.

If multiple elements have the same role and name, use the index to disambiguate (0-based).

If the click fails, you'll get details about why so you can decide whether to retry, scroll first, or try a different element.`,
    parameters: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          description: 'The accessibility role of the element (e.g., button, link)'
        },
        name: {
          type: 'string',
          description: 'The accessible name/text of the element'
        },
        index: {
          type: 'number',
          description: 'The occurrence index for disambiguating duplicates (0-based, optional)',
          default: 0
        },
        retryIfNotVisible: {
          type: 'boolean',
          description: 'Whether to retry after scrolling if element is not visible (default: true)',
          default: true
        }
      },
      required: ['role', 'name']
    },
    execute: async (args, context) => {
      // Validate args against schema
      const parseResult = ClickSchema.safeParse(args)
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid click arguments: ${parseResult.error.issues.map(i => i.message).join(', ')}`
        }
      }
      const { role, name, index, retryIfNotVisible } = parseResult.data

      const { page, state } = context

      try {
        // Use Playwright's accessibility-friendly locator with nth for disambiguation
        const locator = page.getByRole(role as Parameters<typeof page.getByRole>[0], { name }).nth(index)

        // Check if element is visible
        const isVisible = await locator.isVisible().catch(() => false)

        if (!isVisible && retryIfNotVisible) {
          // Try scrolling to make it visible
          await locator.scrollIntoViewIfNeeded().catch(() => {})
          await page.waitForTimeout(500)
        }

        // Get element info before clicking
        const text = await locator.textContent().catch(() => null)

        await locator.click({ timeout: 10000 })
        await page.waitForTimeout(1000) // Brief wait for navigation/state change

        const newUrl = page.url()
        const navigated = newUrl !== state.currentUrl

        if (navigated) {
          // Validate final URL after navigation
          const urlValidation = isAllowedUrl(newUrl)
          if (!urlValidation.valid) {
            // Navigation went to disallowed URL - use recovery helper
            const recovery = await recoverFromOffAllowlist(page, newUrl, state.currentUrl)
            return {
              success: false,
              error: recovery.error,
              data: {
                role,
                name: name.slice(0, 50),
                index,
                invalidUrl: newUrl,
                recovered: recovery.recovered
              }
            }
          }
          
          state.currentUrl = newUrl
          state.visitedUrls.add(newUrl)
        }

        return {
          success: true,
          data: {
            role,
            name: name.slice(0, 50),
            index,
            text: text?.slice(0, 100),
            navigated,
            newUrl: navigated ? newUrl : undefined
          }
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Click failed',
          data: {
            role,
            name: name.slice(0, 50),
            index,
            errorType: error instanceof Error && error.message.includes('timeout') ? 'timeout' : 'click_failed'
          }
        }
      }
    }
  },

  {
    name: 'fill',
    description: `Fill an input field with text by its role and label/name.

You get role, name, and index from get_interactive_elements().
Use this to fill search boxes, forms, etc.

If multiple elements have the same role and name, use the index to disambiguate (0-based).`,
    parameters: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          description: 'The accessibility role of the input (e.g., textbox, searchbox)'
        },
        name: {
          type: 'string',
          description: 'The accessible name/label of the input field'
        },
        text: {
          type: 'string',
          description: 'The text to type into the field'
        },
        index: {
          type: 'number',
          description: 'The occurrence index for disambiguating duplicates (0-based, optional)',
          default: 0
        },
        submit: {
          type: 'boolean',
          description: 'Whether to press Enter after filling (default: false)',
          default: false
        }
      },
      required: ['role', 'name', 'text']
    },
    execute: async (args, context) => {
      // Validate args against schema
      const parseResult = FillSchema.safeParse(args)
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid fill arguments: ${parseResult.error.issues.map(i => i.message).join(', ')}`
        }
      }
      const { role, name, text, index, submit } = parseResult.data

      const { page, state } = context

      try {
        // Use Playwright's accessibility-friendly locator with nth for disambiguation
        const locator = page.getByRole(role as Parameters<typeof page.getByRole>[0], { name }).nth(index)

        await locator.fill(text)

        if (submit) {
          await locator.press('Enter')
          await page.waitForTimeout(1500)

          const newUrl = page.url()
          if (newUrl !== state.currentUrl) {
            // Validate final URL after navigation
            const urlValidation = isAllowedUrl(newUrl)
            if (!urlValidation.valid) {
              // Navigation went to disallowed URL - use recovery helper
              const recovery = await recoverFromOffAllowlist(page, newUrl, state.currentUrl)
              return {
                success: false,
                error: recovery.error,
                data: { role, name: name.slice(0, 30), index, text: text.slice(0, 50), invalidUrl: newUrl, recovered: recovery.recovered }
              }
            }
            
            state.currentUrl = newUrl
            state.visitedUrls.add(newUrl)
          }
        }

        return {
          success: true,
          data: { role, name: name.slice(0, 30), index, text: text.slice(0, 50), submitted: submit }
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Fill failed',
          data: { role, name: name.slice(0, 30), index }
        }
      }
    }
  },

  {
    name: 'scroll_down',
    description: `Scroll down the page to load more content.
    
Use this when you see "load more" buttons or when you need to see more job listings.
Returns information about whether new content was loaded so you can decide whether to continue scrolling.`,
    parameters: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'Pixels to scroll (default: 800, which is about one screen)',
          default: 800
        }
      }
    },
    execute: async (args, context) => {
      // Validate args against schema
      const parseResult = ScrollDownSchema.safeParse(args)
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid scroll_down arguments: ${parseResult.error.issues.map(i => i.message).join(', ')}`
        }
      }
      const { amount } = parseResult.data

      const { page } = context
      
      try {
        // Get current scroll position and page height
        const beforeInfo = await page.evaluate(() => ({
          scrollY: window.scrollY,
          scrollHeight: document.body.scrollHeight,
          clientHeight: window.innerHeight
        }))
        
        // Scroll
        await page.evaluate((scrollAmount) => window.scrollBy(0, scrollAmount), amount)
        await page.waitForTimeout(1000) // Wait for lazy loading
        
        // Get new scroll position
        const afterInfo = await page.evaluate(() => ({
          scrollY: window.scrollY,
          scrollHeight: document.body.scrollHeight,
          clientHeight: window.innerHeight
        }))
        
        const scrolledToBottom = afterInfo.scrollY + afterInfo.clientHeight >= afterInfo.scrollHeight - 100
        const newContentLoaded = afterInfo.scrollHeight > beforeInfo.scrollHeight
        
        return {
          success: true,
          data: {
            scrolledPixels: amount,
            newScrollY: afterInfo.scrollY,
            totalHeight: afterInfo.scrollHeight,
            scrolledToBottom,
            newContentLoaded,
            canScrollMore: !scrolledToBottom
          }
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Scroll failed'
        }
      }
    }
  },

  {
    name: 'go_back',
    description: `Navigate back to the previous page.
    
Use this after viewing a job detail to return to search results.`,
    parameters: {
      type: 'object',
      properties: {}
    },
    execute: async (_args, context) => {
      const { page, state } = context
      
      try {
        const previousUrl = state.currentUrl
        
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 })
        await page.waitForTimeout(1000)
        
        const newUrl = page.url()
        const urlChanged = previousUrl !== newUrl
        
        // Only update state if URL actually changed and is allowed
        if (urlChanged) {
          const urlValidation = isAllowedUrl(newUrl)
          if (!urlValidation.valid) {
            // Back navigation went off-allowlist - use recovery helper
            const recovery = await recoverFromOffAllowlist(page, newUrl, previousUrl)
            state.currentUrl = page.url() // Update to whatever we recovered to
            return {
              success: false,
              error: recovery.error,
              data: {
                wentBack: false,
                previousUrl,
                invalidUrl: newUrl,
                recovered: recovery.recovered
              }
            }
          }
          state.currentUrl = newUrl
        }
        
        return {
          success: true,
          data: {
            wentBack: urlChanged,
            previousUrl,
            currentUrl: newUrl
          }
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Go back failed'
        }
      }
    }
  },

  {
    name: 'extract_jobs',
    description: `Extract job postings from the current page.
    
This analyzes the page content and extracts structured job data including titles, companies, locations, and descriptions.

Use this when you're on:
- Job search results pages
- Company job listing pages
- Individual job detail pages

Returns the extracted jobs and advises whether you should scroll for more or navigate to see details.`,
    parameters: {
      type: 'object',
      properties: {
        pageType: {
          type: 'string',
          enum: ['search_results', 'job_detail', 'company_page', 'unknown'],
          description: 'What type of page you think this is'
        },
        maxJobs: {
          type: 'number',
          description: 'Maximum jobs to extract from this page (default: 5)',
          default: 5
        }
      },
      required: ['pageType']
    },
    execute: async (args, context) => {
      // Validate args against schema
      const parseResult = ExtractJobsSchema.safeParse(args)
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid extract_jobs arguments: ${parseResult.error.issues.map(i => i.message).join(', ')}`
        }
      }
      const { pageType, maxJobs } = parseResult.data

      const { page } = context
      
      try {
        // Get page content
        const pageText = await page.locator('body').innerText()
        const pageUrl = page.url()
        const pageTextLength = pageText.length
        
        // Truncate page text to prevent conversation bloat
        const MAX_PAGE_TEXT_CHARS = 8000
        const pageTextTruncated = pageTextLength > MAX_PAGE_TEXT_CHARS
        const truncatedPageText = pageTextTruncated 
          ? pageText.slice(0, MAX_PAGE_TEXT_CHARS) + '\n... [content truncated]'
          : pageText
        
        // Heuristics to determine if page is ready for extraction
        const hasMinimumContent = pageTextLength > 500
        const hasNoLoadingIndicators = !pageText.toLowerCase().includes('loading') && 
                                       !pageText.toLowerCase().includes('spinner') &&
                                       !pageText.toLowerCase().includes('please wait')
        
        // Check for job-related content based on page type
        const lowerText = pageText.toLowerCase()
        let hasJobContent = false
        
        if (pageType === 'search_results') {
          // Look for job-related keywords common in search results
          hasJobContent = ['job', 'position', 'apply', 'senior', 'engineer', 'developer', 'manager'].some(
            keyword => lowerText.includes(keyword)
          )
        } else if (pageType === 'job_detail' || pageType === 'company_page') {
          // Job detail pages and company pages should have description, requirements, or job listings
          hasJobContent = ['description', 'requirements', 'qualifications', 'responsibilities', 'career', 'openings', 'hiring'].some(
            keyword => lowerText.includes(keyword)
          ) || lowerText.includes('apply') || lowerText.includes('job')
        } else {
          // For unknown types, require substantial content
          hasJobContent = pageTextLength > 1000
        }
        
        const readyForExtraction = hasMinimumContent && hasNoLoadingIndicators && hasJobContent
        
        return {
          success: true,
          data: {
            pageType,
            pageUrl,
            pageText: truncatedPageText,
            pageTextLength,
            pageTextTruncated,
            readyForExtraction,
            maxJobs,
            checks: {
              hasMinimumContent,
              hasNoLoadingIndicators,
              hasJobContent
            }
          }
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to extract jobs'
        }
      }
    }
  },

  {
    name: 'finish',
    description: `Finish the task and return the discovered jobs.
    
Call this when you've found enough jobs or can't find any more relevant positions.`,
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Why you are finishing (e.g., "Found 20 jobs", "No more results", "Reached max steps")'
        }
      },
      required: ['reason']
    },
    execute: async (args) => {
      // Validate args against schema
      const parseResult = FinishSchema.safeParse(args)
      if (!parseResult.success) {
        return {
          success: false,
          error: `Invalid finish arguments: ${parseResult.error.issues.map(i => i.message).join(', ')}`
        }
      }
      const { reason } = parseResult.data
      
      return {
        success: true,
        data: { finished: true, reason }
      }
    }
  }
]

export function getToolDefinitions() {
  return browserTools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }))
}

export function getToolExecutor(name: string) {
  return browserTools.find(tool => tool.name === name)
}
