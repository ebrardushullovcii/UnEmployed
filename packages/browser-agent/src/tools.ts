import type { ToolDefinition } from './types'

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
      const { url, timeout = 30000, waitFor = 'domcontentloaded' } = args as { 
        url: string
        timeout?: number
        waitFor?: 'domcontentloaded' | 'load' | 'networkidle'
      }
      const { page } = context
      const startTime = Date.now()
      
      // Validate URL scheme and hostname
      let parsedUrl: URL
      try {
        parsedUrl = new URL(url)
      } catch {
        return {
          success: false,
          error: `Invalid URL: ${url}`
        }
      }
      
      // Only allow http/https schemes
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return {
          success: false,
          error: `Invalid URL scheme: ${parsedUrl.protocol}. Only http/https allowed.`
        }
      }
      
      // Allowlist of safe hostnames (LinkedIn only for now)
      const allowedHostnames = ['linkedin.com', 'www.linkedin.com']
      const hostname = parsedUrl.hostname.toLowerCase()
      const isAllowed = allowedHostnames.some(allowed => 
        hostname === allowed || hostname.endsWith(`.${allowed}`)
      )
      
      if (!isAllowed) {
        return {
          success: false,
          error: `Navigation to ${hostname} is not allowed. Only LinkedIn is permitted.`
        }
      }
      
      try {
        await page.goto(url, { 
          waitUntil: waitFor,
          timeout 
        })
        
        const loadTime = Date.now() - startTime
        context.state.currentUrl = page.url()
        context.state.visitedUrls.add(page.url())
        
        return {
          success: true,
          data: { 
            url: page.url(), 
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
    description: `Get a list of interactive elements on the page with their accessibility role, name, and reference.

Use this to understand what's clickable, fillable, or scrollable on the page.
Returns elements with role, name, and ref that you can use with click(role, name, ref) or fill(role, name, ref) tools.

Example: { role: 'button', name: 'Apply', ref: 'e5' } can be clicked with click('button', 'Apply', 'e5')

Note: If multiple elements have the same role and name, use the ref to disambiguate.`,
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

You get role, name, and ref from get_interactive_elements().
Use this to click buttons, links, job listings, etc.

If multiple elements have the same role and name, use the ref to disambiguate.

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
        ref: {
          type: 'string',
          description: 'The reference identifier from get_interactive_elements() for disambiguating duplicates (optional)',
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
      const { role, name, ref, retryIfNotVisible = true } = args as { role: string; name: string; ref?: string; retryIfNotVisible?: boolean }
      const { page, state } = context

      try {
        // Use Playwright's accessibility-friendly locator
        let locator = page.getByRole(role as Parameters<typeof page.getByRole>[0], { name })

        // If ref is provided, try to locate by ref attribute first
        if (ref) {
          const refLocator = page.locator(`[ref="${ref}"]`)
          if (await refLocator.isVisible().catch(() => false)) {
            locator = refLocator
          }
        }

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
          state.currentUrl = newUrl
          state.visitedUrls.add(newUrl)
        }

        return {
          success: true,
          data: {
            role,
            name: name.slice(0, 50),
            ref,
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
            ref,
            errorType: error instanceof Error && error.message.includes('timeout') ? 'timeout' : 'click_failed'
          }
        }
      }
    }
  },

  {
    name: 'fill',
    description: `Fill an input field with text by its role and label/name.

You get role, name, and ref from get_interactive_elements().
Use this to fill search boxes, forms, etc.

If multiple elements have the same role and name, use the ref to disambiguate.`,
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
        ref: {
          type: 'string',
          description: 'The reference identifier from get_interactive_elements() for disambiguating duplicates (optional)',
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
      const { role, name, text, ref, submit = false } = args as { role: string; name: string; text: string; ref?: string; submit?: boolean }
      const { page, state } = context

      try {
        // Use Playwright's accessibility-friendly locator
        let locator = page.getByRole(role as Parameters<typeof page.getByRole>[0], { name })

        // If ref is provided, try to locate by ref attribute first
        if (ref) {
          const refLocator = page.locator(`[ref="${ref}"]`)
          if (await refLocator.isVisible().catch(() => false)) {
            locator = refLocator
          }
        }

        await locator.fill(text)

        if (submit) {
          await locator.press('Enter')
          await page.waitForTimeout(1500)

          const newUrl = page.url()
          if (newUrl !== state.currentUrl) {
            state.currentUrl = newUrl
            state.visitedUrls.add(newUrl)
          }
        }

        return {
          success: true,
          data: { role, name: name.slice(0, 30), ref, text: text.slice(0, 50), submitted: submit }
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Fill failed',
          data: { role, name: name.slice(0, 30), ref }
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
      const { amount = 800 } = args as { amount?: number }
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
        state.currentUrl = newUrl
        
        return {
          success: true,
          data: {
            wentBack: true,
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
      const { pageType, maxJobs = 5 } = args as { pageType: string; maxJobs?: number }
      const { page } = context
      
      try {
        // Get page content
        const pageText = await page.locator('body').innerText()
        const pageUrl = page.url()
        const pageTextLength = pageText.length
        
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
        } else if (pageType === 'job_detail') {
          // Job detail pages should have description and requirements
          hasJobContent = ['description', 'requirements', 'qualifications', 'responsibilities'].some(
            keyword => lowerText.includes(keyword)
          ) || lowerText.includes('apply')
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
            pageText,
            pageTextLength,
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
      const { reason } = args as { reason: string }
      
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
