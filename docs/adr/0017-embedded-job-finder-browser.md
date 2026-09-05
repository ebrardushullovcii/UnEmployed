# ADR 0017: Embedded Job Finder browser

Status: accepted

## Context

Job Finder previously opened a separate Chrome profile. Users need to see and take over the same pages that the agent operates, without switching windows. Authentication storage must survive closing the browser, while live pages and browser activity must stop.

## Decision

Electron main owns sandboxed `WebContentsView` tabs in the persistent `unemployed-browser` session. The renderer supplies typed commands and viewport geometry through preload; remote pages receive no preload or Node access. A Peek overlay, expanded view and minimized launcher present the same live tabs.

Playwright remains the automation client. A private loopback WebSocket bridge exposes only the owned page targets through their Electron debugger sessions; it does not expose the Electron application or an app-wide debugging port. Browser runtime accepts a generic host interface. Workflow policy and application authority remain in their existing packages (ADRs 0007, 0012 and 0013).

Minimizing preserves pages and automation. Taking control pauses workspace activity, cancels operations and disconnects automation before allowing manual interaction. Existing in-page preparation guards can remain until navigation or reload; the toolbar explains this without reloading and discarding fields automatically. Closing additionally destroys all browser tabs, clears service workers and their caches, and closes network connections, while retaining cookies and site sign-in storage. Workspace cleanup cannot close a page during handover. Automation rejects an already running service worker and pauses if one starts during guarded work.

The browser uses its actual Chromium user agent without app branding. Google and employer sign-in compatibility is site-dependent; reaching a sign-in page is not proof of authentication. Credentials, consent, CAPTCHA and MFA remain user-owned. The app does not bypass provider restrictions.

Users may explicitly select a cookie JSON export and review its site/count summary in a native confirmation dialog. Import reads and writes cookie values only in main, returns counts and generic messages, and leaves activity paused. It does not read other browser profiles, decrypt protected cookies, import passwords, or promise complete session portability. Renderer state, prompts and logs must never contain imported cookie values.

## Consequences

Electron and Playwright upgrades require focused native browser checks, including hidden-page rendering, popups, routing, handover and resource cleanup. The scoped bridge has a deliberately limited CDP surface and is not a general remote debugging service. Existing prepare-only guards remain required; embedding adds no submission authority.

The default live desktop host is embedded. `UNEMPLOYED_BROWSER_HOST=external` retains the dedicated Chrome path for compatibility. Existing deterministic desktop harnesses retain their prior host behavior unless they explicitly select the embedded host. Closing preserves the session partition, not a Chrome profile folder; some imported sessions still need a fresh sign-in.
