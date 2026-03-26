import type { ToolDefinition, ToolContext, ToolResult } from './types'

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
    description: `Get a list of interactive elements on the page with their references. 
    
Use this to understand what's clickable, fillable, or scrollable on the page.
Returns elements like buttons, links, inputs with unique reference IDs (e.g., @e5, @e12) that you can use with click() or fill() tools.`,
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
        const elements: Array<{ ref: string; role: string; name: string }> = []
        
        for (const line of lines) {
          // Parse lines like: - button "Apply" [ref=e5]
          const match = line.match(/-\s+(\w+)\s+"([^"]+)"\s+\[ref=([^\]]+)\]/)
          if (match) {
            const role = match[1]
            const name = match[2]
            const ref = match[3]
            if (role && name && ref) {
              elements.push({ ref, role, name })
            }
          }
        }
        
        return {
          success: true,
          data: {
            elementCount: elements.length,
            elements: elements.slice(0, 30), // Limit to first 30 to avoid overwhelming the agent
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
    description: `Click an element by its reference ID. 
    
You get reference IDs from get_interactive_elements(). 
Use this to click buttons, links, job listings, etc.

If the click fails, you'll get details about why so you can decide whether to retry, scroll first, or try a different element.`,
    parameters: {
      type: 'object',
      properties: {
        elementId: {
          type: 'string',
          description: 'The reference ID of the element to click (e.g., @e5)'
        },
        retryIfNotVisible: {
          type: 'boolean',
          description: 'Whether to retry after scrolling if element is not visible (default: true)',
          default: true
        }
      },
      required: ['elementId']
    },
    execute: async (args, context) => {
      const { elementId, retryIfNotVisible = true } = args as { elementId: string; retryIfNotVisible?: boolean }
      const { page, state } = context
      
      try {
        // Try to find and click the element
        const locator = page.locator(`[ref="${elementId.replace('@', '')}"]`)
        
        // Check if element is visible
        const isVisible = await locator.isVisible().catch(() => false)
        
        if (!isVisible && retryIfNotVisible) {
          // Try scrolling to make it visible
          await locator.scrollIntoViewIfNeeded().catch(() => {})
          await page.waitForTimeout(500)
        }
        
        // Get element info before clicking
        const text = await locator.textContent().catch(() => null)
        const href = await locator.getAttribute('href').catch(() => null)
        
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
            elementId,
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
            elementId,
            errorType: error instanceof Error && error.message.includes('timeout') ? 'timeout' : 'click_failed'
          }
        }
      }
    }
  },

  {
    name: 'fill',
    description: `Fill an input field with text by its reference ID.
    
You get reference IDs from get_interactive_elements().
Use this to fill search boxes, forms, etc.`,
    parameters: {
      type: 'object',
      properties: {
        elementId: {
          type: 'string',
          description: 'The reference ID of the input field (e.g., @e3)'
        },
        text: {
          type: 'string',
          description: 'The text to type into the field'
        },
        submit: {
          type: 'boolean',
          description: 'Whether to press Enter after filling (default: false)',
          default: false
        }
      },
      required: ['elementId', 'text']
    },
    execute: async (args, context) => {
      const { elementId, text, submit = false } = args as { elementId: string; text: string; submit?: boolean }
      const { page, state } = context
      
      try {
        const locator = page.locator(`[ref="${elementId.replace('@', '')}"]`)
        
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
          data: { elementId, text: text.slice(0, 50), submitted: submit }
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Fill failed',
          data: { elementId }
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
      const { page, config } = context
      
      try {
        // Get page content
        const pageText = await page.locator('body').innerText()
        const pageUrl = page.url()
        
        return {
          success: true,
          data: {
            pageType,
            pageUrl,
            pageText,
            pageTextLength: pageText.length,
            readyForExtraction: true,
            maxJobs
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
