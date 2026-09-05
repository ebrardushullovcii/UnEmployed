import { createHash } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SavedJobSchema,
  type ApplyExecutionResult,
  type CandidateProfile,
} from "@unemployed/contracts";
import { chromium, type Browser, type BrowserContext } from "playwright";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  closePrepareOnlyIntermediateMutationWindow,
  createApplicationRunServiceWorkerSentinel,
  ensurePrepareOnlyMutationGuard,
  getLatestBlockedPrepareOnlyAttempt,
  openPrepareOnlyIntermediateMutationWindow,
  readServiceWorkerRegisterGuardInPage,
  runGenericApplicationPreparation,
} from "./playwright-application-flow";
import type { ExecuteApplicationFlowInput } from "./runtime-types";

interface FixtureHit {
  kind: "request" | "upgrade";
  method: string;
  path: string;
  query: string;
  body: string;
}

interface FixtureServer {
  port: number;
  baseUrl: string;
  hits: FixtureHit[];
  registerHtml: (path: string, html: string) => void;
  registerScript: (path: string, js: string) => void;
  registerAttachment: (path: string, content: string) => void;
  close: () => Promise<void>;
}

function startFixtureServer(): Promise<FixtureServer> {
  const hits: FixtureHit[] = [];
  const htmlRoutes = new Map<string, string>();
  const scriptRoutes = new Map<string, string>();
  const attachmentRoutes = new Map<string, string>();
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      hits.push({
        kind: "request",
        method: request.method ?? "GET",
        path: url.pathname,
        query: url.search,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      const html = htmlRoutes.get(url.pathname);
      if (html !== undefined) {
        response.writeHead(200, { "content-type": "text/html" });
        response.end(html);
        return;
      }
      const script = scriptRoutes.get(url.pathname);
      if (script !== undefined) {
        response.writeHead(200, { "content-type": "text/javascript" });
        response.end(script);
        return;
      }
      const attachment = attachmentRoutes.get(url.pathname);
      if (attachment !== undefined) {
        response.writeHead(200, {
          "content-type": "text/plain",
          "content-disposition": 'attachment; filename="report.txt"',
        });
        response.end(attachment);
        return;
      }
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("fixture-ok");
    });
  });
  server.on("upgrade", (request) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    hits.push({
      kind: "upgrade",
      method: "GET",
      path: url.pathname,
      query: url.search,
      body: "",
    });
    request.destroy();
  });

  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolvePromise({
        port: address.port,
        baseUrl: `http://127.0.0.1:${address.port}`,
        hits,
        registerHtml: (path, html) => {
          htmlRoutes.set(path, html);
        },
        registerScript: (path, js) => {
          scriptRoutes.set(path, js);
        },
        registerAttachment: (path, content) => {
          attachmentRoutes.set(path, content);
        },
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((error) =>
              error ? rejectClose(error) : resolveClose(),
            );
          }),
      });
    });
  });
}

const activeServers: FixtureServer[] = [];
const activeContexts: BrowserContext[] = [];

async function startTrackedServer(): Promise<FixtureServer> {
  const server = await startFixtureServer();
  activeServers.push(server);
  return server;
}

let browser: Browser | null = null;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
}, 120_000);

afterEach(async () => {
  while (activeContexts.length > 0) {
    const context = activeContexts.pop();
    await context?.close().catch(() => undefined);
  }
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    await server?.close().catch(() => undefined);
  }
});

afterAll(async () => {
  await browser?.close().catch(() => undefined);
  browser = null;
}, 120_000);

async function newGuardedPage(): Promise<{
  page: Awaited<ReturnType<BrowserContext["newPage"]>>;
}> {
  if (!browser) {
    throw new Error("The fixture browser is not running.");
  }
  const context = await browser.newContext();
  activeContexts.push(context);
  const page = await context.newPage();
  // The guard must exist before the first document script runs so early
  // native captures are denied inside the page itself.
  await ensurePrepareOnlyMutationGuard(page, false);
  return { page };
}

const requestHitsFor = (
  hits: readonly FixtureHit[],
  path: string,
): FixtureHit[] =>
  hits.filter((hit) => hit.kind === "request" && hit.path === path);

describe("Prepare-only guard real-Chromium fixtures", () => {
  test(
    "denies an early-captured native submit that runs before post-load install",
    { timeout: 60_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerHtml(
        "/early-submit",
        `<form id="f" action="/record-submit" method="post"><input name="a" value="x"></form>
         <script>document.getElementById('f').submit();</script>`,
      );
      const { page } = await newGuardedPage();

      await page.goto(`${app.baseUrl}/early-submit`);
      await page.waitForTimeout(500);

      expect(requestHitsFor(app.hits, "/record-submit")).toHaveLength(0);
      expect(app.hits.filter((hit) => hit.method === "POST")).toHaveLength(0);
      const latestAttempt = await getLatestBlockedPrepareOnlyAttempt(page);
      expect(latestAttempt).toMatchObject({
        kind: "form_submit",
        method: "POST",
      });
      expect(latestAttempt?.url ?? "").toContain("/record-submit");
    },
  );

  test(
    "denies an onchange fetch POST fired by filling an application field",
    { timeout: 60_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerHtml(
        "/change-post",
        `<label for="email">Email address</label><input id="email">
         <script>
         document.getElementById('email').addEventListener('change', function () {
           fetch('/autosave-post', { method: 'POST', body: 'candidate-data' });
         });
         </script>`,
      );
      const { page } = await newGuardedPage();
      await page.goto(`${app.baseUrl}/change-post`);
      await ensurePrepareOnlyMutationGuard(page, false);

      await page.fill("#email", "alex@example.com");
      await page.locator("#email").blur();
      await page.waitForTimeout(600);

      expect(requestHitsFor(app.hits, "/autosave-post")).toHaveLength(0);
      const latestAttempt = await getLatestBlockedPrepareOnlyAttempt(page);
      expect(latestAttempt).toMatchObject({
        kind: "fetch",
        method: "POST",
      });
      expect(latestAttempt?.url ?? "").toContain("/autosave-post");
    },
  );

  test(
    "allows one bounded same-origin autosave but still blocks final-submit traffic",
    { timeout: 60_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerHtml(
        "/bounded-autosave",
        `<label for="email">Email address</label><input id="email">
         <button id="submit" type="button">Submit application</button>
         <script>
         document.getElementById('email').addEventListener('change', function () {
           fetch('/api/application/autosave-field', {
             method: 'PATCH',
             body: JSON.stringify({ operationName: 'UpdateApplicationFormAnswer' })
           });
         });
         document.getElementById('submit').addEventListener('click', function () {
           fetch('/api/application/submit', {
             method: 'POST',
             body: JSON.stringify({ operationName: 'SubmitApplication' })
           });
         });
         </script>`,
      );
      const { page } = await newGuardedPage();
      await page.goto(`${app.baseUrl}/bounded-autosave`);
      await ensurePrepareOnlyMutationGuard(page, true, [
        "https://outside-authority.example",
      ]);
      await expect(
        openPrepareOnlyIntermediateMutationWindow(page),
      ).rejects.toThrow(
        /outside the explicit intermediate-mutation authority/i,
      );
      await ensurePrepareOnlyMutationGuard(page, true, [
        new URL(app.baseUrl).origin,
      ]);

      await openPrepareOnlyIntermediateMutationWindow(page);
      await page.fill("#email", "synthetic@example.com");
      await page.locator("#email").blur();
      await page.waitForTimeout(400);
      await closePrepareOnlyIntermediateMutationWindow(page);

      expect(
        requestHitsFor(app.hits, "/api/application/autosave-field"),
      ).toHaveLength(1);

      await openPrepareOnlyIntermediateMutationWindow(page);
      await page.click("#submit");
      await page.waitForTimeout(400);
      await closePrepareOnlyIntermediateMutationWindow(page);

      expect(requestHitsFor(app.hits, "/api/application/submit")).toHaveLength(
        0,
      );
      const latestAttempt = await getLatestBlockedPrepareOnlyAttempt(page);
      expect(latestAttempt).toMatchObject({
        method: "POST",
      });
      expect(latestAttempt?.url ?? "").toContain("/api/application/submit");
    },
  );

  test(
    "denies a GET image query beacon while allowing a queryless static image",
    { timeout: 60_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerHtml(
        "/image-beacon",
        `<button id="beacon" type="button">beacon</button>
         <button id="logo" type="button">logo</button>
         <script>
         document.getElementById('beacon').addEventListener('click', function () {
           var img = new Image();
           img.src = '/pixel-track?data=alex%40example.com';
           document.body.appendChild(img);
         });
         document.getElementById('logo').addEventListener('click', function () {
           var logo = document.createElement('img');
           logo.src = '/logo.png';
           document.body.appendChild(logo);
         });
         </script>`,
      );
      const { page } = await newGuardedPage();
      await page.goto(`${app.baseUrl}/image-beacon`);
      await ensurePrepareOnlyMutationGuard(page, false);

      await page.click("#beacon");
      await page.waitForTimeout(700);

      expect(requestHitsFor(app.hits, "/pixel-track")).toHaveLength(0);
      const snapshotAfterBeacon = await ensurePrepareOnlyMutationGuard(
        page,
        false,
      );
      const beaconNetworkAttempt = snapshotAfterBeacon.blockedAttempts.find(
        (attempt) =>
          attempt.kind === "network_request" &&
          (attempt.url ?? "").includes("/pixel-track"),
      );
      expect(beaconNetworkAttempt).toBeDefined();

      await page.click("#logo");
      await page.waitForTimeout(500);

      expect(requestHitsFor(app.hits, "/logo.png")).toHaveLength(1);
      expect(requestHitsFor(app.hits, "/pixel-track")).toHaveLength(0);
    },
  );

  test(
    "blocks a page-initiated WebSocket connection before the handshake",
    { timeout: 60_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerHtml(
        "/ws-page",
        `<button id="open-ws" type="button">open</button>
         <script>
         document.getElementById('open-ws').addEventListener('click', function () {
           try {
             window.__ws = new WebSocket(
               'ws://127.0.0.1:' + window.location.port + '/realtime'
             );
             window.__wsError = null;
           } catch (error) {
             window.__wsError = String(error);
           }
         });
         </script>`,
      );
      const { page } = await newGuardedPage();
      await page.goto(`${app.baseUrl}/ws-page`);
      await ensurePrepareOnlyMutationGuard(page, false);

      await page.click("#open-ws");
      await page.waitForTimeout(400);

      expect(app.hits.filter((hit) => hit.kind === "upgrade")).toHaveLength(0);
      const wsError = await page.evaluate(
        () => (window as unknown as Record<string, unknown>)["__wsError"],
      );
      expect(String(wsError)).toContain("AbortError");
      const latestAttempt = await getLatestBlockedPrepareOnlyAttempt(page);
      expect(latestAttempt).toMatchObject({ kind: "websocket" });
      expect(latestAttempt?.url ?? "").toContain("/realtime");
    },
  );

  test(
    "verifies and enforces the guard in same-origin and cross-origin iframes",
    { timeout: 60_000 },
    async () => {
      const originApp = await startTrackedServer();
      const crossOriginApp = await startTrackedServer();
      const autoSubmitFrame = (targetPath: string): string =>
        `<form action="${targetPath}" method="post"><input name="secret" value="x"></form>
         <script>document.forms[0].requestSubmit();</script>`;
      originApp.registerHtml("/frame-a", autoSubmitFrame("/leak-a"));
      crossOriginApp.registerHtml("/frame-b", autoSubmitFrame("/leak-b"));
      originApp.registerHtml(
        "/iframe-host",
        `<iframe src="/frame-a" title="same origin"></iframe>
         <iframe src="${crossOriginApp.baseUrl}/frame-b" title="cross origin"></iframe>`,
      );
      const { page } = await newGuardedPage();

      await page.goto(`${originApp.baseUrl}/iframe-host`);
      await page.waitForLoadState("load");
      await page.waitForTimeout(800);

      expect(requestHitsFor(originApp.hits, "/leak-a")).toHaveLength(0);
      expect(requestHitsFor(crossOriginApp.hits, "/leak-b")).toHaveLength(0);

      const snapshot = await ensurePrepareOnlyMutationGuard(page, false);
      expect(snapshot.installed).toBe(true);
      const attemptUrls = snapshot.blockedAttempts.map(
        (attempt) => attempt.url ?? "",
      );
      expect(attemptUrls.some((url) => url.includes("/leak-a"))).toBe(true);
      expect(attemptUrls.some((url) => url.includes("/leak-b"))).toBe(true);
      expect(
        snapshot.blockedAttempts.some(
          (attempt) => attempt.kind === "form_request_submit",
        ),
      ).toBe(true);
    },
  );

  test(
    "catches a delayed timer write after the settle window and prevents success",
    { timeout: 60_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerHtml(
        "/delayed-write",
        `<button id="start" type="button">start</button>
         <script>
         document.getElementById('start').addEventListener('click', function () {
           window.setTimeout(function () {
             fetch('/late-write', { method: 'POST', body: 'late' });
           }, 650);
         });
         </script>`,
      );
      const { page } = await newGuardedPage();
      await page.goto(`${app.baseUrl}/delayed-write`);
      await ensurePrepareOnlyMutationGuard(page, false);

      await page.click("#start");

      let delayedAttempt = null;
      for (let poll = 0; poll < 30 && delayedAttempt === null; poll += 1) {
        await page.waitForTimeout(150);
        delayedAttempt = await getLatestBlockedPrepareOnlyAttempt(page);
      }

      expect(delayedAttempt).toMatchObject({
        kind: "fetch",
        method: "POST",
      });
      expect(delayedAttempt?.url ?? "").toContain("/late-write");
      expect(requestHitsFor(app.hits, "/late-write")).toHaveLength(0);

      // A final-checkpoint success gate re-reads blocked attempts immediately
      // before returning; the delayed attempt must make that gate fail.
      const successGateAttempt = await getLatestBlockedPrepareOnlyAttempt(page);
      expect(successGateAttempt).not.toBeNull();
    },
  );

  test(
    "keeps only the minimum GET navigation window open across redirects",
    { timeout: 60_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerHtml(
        "/redirect-src",
        "<script>window.location.href = '/redirect-dst';</script>",
      );
      app.registerHtml("/redirect-dst", "<h1>next step</h1>");
      const { page } = await newGuardedPage();

      await page.goto(`${app.baseUrl}/redirect-src`);
      await page.waitForURL("**/redirect-dst");
      await page.waitForLoadState("load");
      await ensurePrepareOnlyMutationGuard(page, false);

      expect(requestHitsFor(app.hits, "/redirect-src")).toHaveLength(1);
      expect(requestHitsFor(app.hits, "/redirect-dst")).toHaveLength(1);
      expect(app.hits.filter((hit) => hit.method !== "GET")).toHaveLength(0);

      await expect(
        page.evaluate(() =>
          fetch("/after-redirect-post", { method: "POST", body: "x" }),
        ),
      ).rejects.toThrow(/Prepare-only mode blocked a new network request/u);
      expect(requestHitsFor(app.hits, "/after-redirect-post")).toHaveLength(0);
      const latestAttempt = await getLatestBlockedPrepareOnlyAttempt(page);
      expect(latestAttempt).toMatchObject({
        kind: "fetch",
        method: "POST",
      });
      expect(latestAttempt?.url ?? "").toContain("/after-redirect-post");
    },
  );

  test(
    "runGenericApplicationPreparation stops truthfully when the site autosaves on change",
    { timeout: 90_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerHtml(
        "/e2e-apply",
        `<form><label for="email">Email address</label>
         <input id="email" autocomplete="email"></form>
         <button type="button">Next</button>
         <script>
         document.getElementById('email').addEventListener('change', function () {
           fetch('/autosave-e2e', { method: 'POST', body: 'candidate-data' });
         });
         </script>`,
      );
      const userDataDir = await mkdtemp(
        join(tmpdir(), "unemployed-guard-e2e-"),
      );
      try {
        const resumeFilePath = join(userDataDir, "approved-resume.pdf");
        await writeFile(resumeFilePath, "approved resume", "utf8");
        const executionInput: ExecuteApplicationFlowInput = {
          job: createFixtureJob(`${app.baseUrl}/e2e-apply`),
          resumeArtifact: {
            id: "application_resume_guard_fixture",
            jobId: "job_guard_fixture",
            source: "tailored_export",
            sourceDocumentId: null,
            exportArtifactId: "resume_export_guard_fixture",
            fileName: "resume.pdf",
            filePath: resumeFilePath,
            sha256: createHash("sha256")
              .update("approved resume", "utf8")
              .digest("hex"),
            approvedAt: "2026-03-20T10:00:00.000Z",
          },
          profile: createFixtureProfile(),
          settings: {
            resumeFormat: "pdf",
            resumeTemplateId: "classic_ats",
            fontPreset: "inter_requisite",
            appearanceTheme: "system",
            humanReviewRequired: true,
            allowAutoSubmitOverride: false,
            keepSessionAlive: false,
            discoveryOnly: false,
          },
          mode: "prepare_only",
          submitAuthorized: false,
          intermediateMutationsAuthorized: false,
        };

        if (!browser) {
          throw new Error("The fixture browser is not running.");
        }
        const context = await browser.newContext();
        activeContexts.push(context);
        const page = await context.newPage();
        await page.goto(`${app.baseUrl}/e2e-apply`);

        let result: ApplyExecutionResult | null = null;
        let preparationError: unknown = null;
        try {
          result = await runGenericApplicationPreparation({
            context,
            page,
            executionInput,
            startedAt: new Date().toISOString(),
          });
        } catch (error) {
          preparationError = error;
        }

        expect(preparationError).toBeNull();
        expect(result).not.toBeNull();
        const pausedResult = result as ApplyExecutionResult;
        expect(pausedResult.submittedAt).toBeNull();
        expect(pausedResult.outcome).toBeNull();
        expect(pausedResult.state).toBe("paused");
        expect(pausedResult.summary).toBe(
          "The application page could not safely save a prepared field",
        );
        expect(pausedResult.blocker?.code).toBe("requires_manual_review");
        expect(pausedResult.checkpoints.at(-1)?.label).toBe(
          "Paused before the application field could be saved",
        );
        // The local email fill is not external persistence proof; the site's
        // autosave was blocked and therefore no verified external write exists.
        expect(pausedResult.externalWrites).toEqual([]);

        expect(requestHitsFor(app.hits, "/autosave-e2e")).toHaveLength(0);
        expect(app.hits.filter((hit) => hit.method !== "GET")).toHaveLength(0);
      } finally {
        await rm(userDataDir, { recursive: true, force: true });
      }
    },
  );

  test(
    "runGenericApplicationPreparation stops truthfully when the site autosaves during resume attachment",
    { timeout: 90_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerHtml(
        "/e2e-apply-resume",
        `<form><label for="resume">Resume</label>
         <input id="resume" type="file"></form>
         <button type="button">Next</button>
         <script>
         document.getElementById('resume').addEventListener('change', function () {
           fetch('/autosave-resume-e2e', { method: 'POST', body: 'resume-bytes' });
         });
         </script>`,
      );
      const { directory, filePath } = await writeApprovedResume();
      try {
        if (!browser) {
          throw new Error("The fixture browser is not running.");
        }
        const context = await browser.newContext();
        activeContexts.push(context);
        const page = await context.newPage();
        await page.goto(`${app.baseUrl}/e2e-apply-resume`);

        const result = await runGenericApplicationPreparation({
          context,
          page,
          executionInput: createPreparationExecutionInput(
            `${app.baseUrl}/e2e-apply-resume`,
            filePath,
          ),
          startedAt: new Date().toISOString(),
        });

        expect(result.state).toBe("paused");
        expect(result.submittedAt).toBeNull();
        expect(result.outcome).toBeNull();
        expect(result.summary).toBe("Resume attachment needs your help");
        expect(result.checkpoints.at(-1)?.label).toBe(
          "Paused before the resume could be attached",
        );

        // Honest user-owned next action: no approval toggle and no retry
        // promise that production's always-false authorization would repeat.
        const nextAction = result.nextActionLabel ?? "";
        expect(nextAction).toBe(
          "Complete the resume step manually in the open application, or cancel",
        );
        expect(nextAction).not.toMatch(/approv|retry/i);
        expect(result.blocker?.detail).toContain(
          "did not have permission for that external save",
        );
        expect(result.blocker?.detail).toContain("transmitted nothing");
        expect(result.blocker?.detail).toContain("or cancel");
        expect(result.blocker?.detail).not.toContain("Approve");

        // The site-side write stays unclaimed: nothing was transmitted, and
        // the result records no receipt and no answered resume question.
        expect(requestHitsFor(app.hits, "/autosave-resume-e2e")).toHaveLength(
          0,
        );
        expect(app.hits.filter((hit) => hit.method !== "GET")).toHaveLength(0);
        expect(result.externalWrites ?? []).toHaveLength(0);
        expect(
          result.questions.some((question) => question.status === "answered"),
        ).toBe(false);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  test(
    "runGenericApplicationPreparation records only a successful authorized autosave as an external write",
    { timeout: 90_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerHtml(
        "/e2e-authorized-autosave",
        `<form><label for="email">Email address</label>
         <input id="email" autocomplete="email"></form>
         <button type="submit">Submit application</button>
         <script>
         document.getElementById('email').addEventListener('input', function () {
           fetch('/api/application/autosave-field', {
             method: 'PATCH',
             body: JSON.stringify({ operationName: 'UpdateApplicationFormAnswer' })
           });
         });
         </script>`,
      );
      const { directory, filePath } = await writeApprovedResume();
      try {
        if (!browser) {
          throw new Error("The fixture browser is not running.");
        }
        const context = await browser.newContext();
        activeContexts.push(context);
        const page = await context.newPage();
        const applicationUrl = `${app.baseUrl}/e2e-authorized-autosave`;
        await page.goto(applicationUrl);
        const origin = new URL(applicationUrl).origin;
        const recheck = vi.fn((observedOrigin: string) =>
          Promise.resolve(observedOrigin === origin),
        );
        const result = await runGenericApplicationPreparation({
          context,
          page,
          executionInput: {
            ...createPreparationExecutionInput(applicationUrl, filePath),
            intermediateMutationsAuthorized: true,
            intermediateMutationAllowedOrigins: [origin],
            recheckIntermediateMutationAuthority: recheck,
          },
          startedAt: new Date().toISOString(),
        });

        expect(
          requestHitsFor(app.hits, "/api/application/autosave-field"),
        ).toHaveLength(1);
        expect(recheck).toHaveBeenCalledWith(origin);
        expect(result.externalWrites).toEqual([
          expect.objectContaining({
            category: "profile_field",
            fieldLabel: "Email address",
            verified: true,
          }),
        ]);
        expect(result.submittedAt).toBeNull();
        expect(result.outcome).toBeNull();
        expect(result.checkpoints.at(-1)?.label).toMatch(/final control/i);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});

function createFixtureJob(applicationUrl: string) {
  return SavedJobSchema.parse({
    id: "job_guard_fixture",
    source: "target_site" as const,
    sourceJobId: "job_guard_fixture",
    discoveryMethod: "catalog_seed" as const,
    collectionMethod: "fallback_search" as const,
    canonicalUrl: `${applicationUrl}`,
    applicationUrl,
    title: "Senior Engineer",
    company: "Example Co",
    location: "Remote",
    workMode: ["remote" as const],
    applyPath: "external_redirect" as const,
    easyApplyEligible: false,
    postedAt: "2026-03-20T09:00:00.000Z",
    postedAtText: null,
    providerUpdatedAt: null,
    discoveredAt: "2026-03-20T10:00:00.000Z",
    firstSeenAt: null,
    lastSeenAt: null,
    lastVerifiedActiveAt: null,
    salaryText: null,
    normalizedCompensation: {
      currency: null,
      interval: null,
      minAmount: null,
      maxAmount: null,
      minAnnualUsd: null,
      maxAnnualUsd: null,
    },
    detailQuality: "detail_enriched" as const,
    summary: "Build resilient workflows.",
    description: "Upload a resume and review the application.",
    keySkills: ["TypeScript"],
    responsibilities: [],
    minimumQualifications: [],
    preferredQualifications: [],
    seniority: null,
    employmentType: null,
    department: null,
    team: null,
    employerWebsiteUrl: null,
    employerDomain: null,
    atsProvider: null,
    providerKey: null,
    providerBoardToken: null,
    providerIdentifier: null,
    titleTriageOutcome: "pass" as const,
    sourceIntelligence: null,
    screeningHints: {
      sponsorshipText: null,
      requiresSecurityClearance: null,
      relocationText: null,
      travelText: null,
      remoteGeographies: [],
      requiresConsentInterrupt: null,
      requiresConsentInterruptKind: null,
    },
    keywordSignals: [],
    benefits: [],
    status: "approved" as const,
    matchAssessment: {
      score: 91,
      reasons: ["Strong fit"],
      gaps: [],
      recommendation: "review_before_applying" as const,
      recommendationRationale: "Test fixture requires explicit review.",
      requirements: [],
    },
    provenance: [],
  });
}

function createFixtureProfile(): CandidateProfile {
  return {
    id: "candidate_guard_fixture",
    firstName: "Alex",
    lastName: "Vanguard",
    middleName: null,
    fullName: "Alex Vanguard",
    preferredDisplayName: null,
    headline: "Senior systems designer",
    summary: "Builds resilient workflows.",
    currentLocation: "Budapest, Hungary",
    currentCity: "Budapest",
    currentRegion: null,
    currentCountry: "Hungary",
    timeZone: null,
    yearsExperience: 10,
    email: "alex@example.com",
    secondaryEmail: null,
    phone: "+36 30 123 4567",
    portfolioUrl: null,
    linkedinUrl: null,
    githubUrl: null,
    personalWebsiteUrl: null,
    narrative: {
      professionalStory: "Builds resilient workflows.",
      nextChapterSummary: "Open to workflow roles.",
      careerTransitionSummary: null,
      differentiators: [],
      motivationThemes: [],
    },
    proofBank: [],
    answerBank: {
      workAuthorization: null,
      visaSponsorship: null,
      relocation: null,
      travel: null,
      noticePeriod: null,
      availability: null,
      salaryExpectations: null,
      selfIntroduction: null,
      careerTransition: null,
      customAnswers: [],
    },
    applicationIdentity: {
      preferredEmail: "alex@example.com",
      preferredPhone: "+36 30 123 4567",
      preferredLinkIds: [],
    },
    baseResume: {
      id: "resume_guard_fixture",
      fileName: "alex-vanguard.pdf",
      uploadedAt: "2026-03-20T10:00:00.000Z",
      storagePath: null,
      textContent: null,
      textUpdatedAt: null,
      extractionStatus: "not_started" as const,
      lastAnalyzedAt: null,
      analysisProviderKind: null,
      analysisProviderLabel: null,
      analysisWarnings: [],
    },
    workEligibility: {
      authorizedWorkCountries: [],
      requiresVisaSponsorship: null,
      willingToRelocate: null,
      preferredRelocationRegions: [],
      willingToTravel: null,
      remoteEligible: null,
      noticePeriodDays: null,
      availableStartDate: null,
      securityClearance: null,
    },
    professionalSummary: {
      shortValueProposition: null,
      fullSummary: null,
      careerThemes: [],
      leadershipSummary: null,
      domainFocusSummary: null,
      strengths: [],
    },
    skillGroups: {
      coreSkills: [],
      tools: [],
      languagesAndFrameworks: [],
      softSkills: [],
      highlightedSkills: [],
    },
    targetRoles: [],
    locations: [],
    skills: [],
    experiences: [],
    education: [],
    certifications: [],
    links: [],
    projects: [],
    spokenLanguages: [],
  };
}

const SERVICE_WORKER_STOP_SUMMARY =
  "A service worker can influence this application origin";

async function waitForCondition(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs = 250,
): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return Boolean(await predicate());
}

function createPreparationExecutionInput(
  applicationUrl: string,
  resumeFilePath: string,
): ExecuteApplicationFlowInput {
  return {
    job: createFixtureJob(applicationUrl),
    resumeArtifact: {
      id: "application_resume_sw_fixture",
      jobId: "job_guard_fixture",
      source: "tailored_export",
      sourceDocumentId: null,
      exportArtifactId: "resume_export_sw_fixture",
      fileName: "resume.pdf",
      filePath: resumeFilePath,
      sha256: createHash("sha256")
        .update("approved resume", "utf8")
        .digest("hex"),
      approvedAt: "2026-03-20T10:00:00.000Z",
    },
    profile: createFixtureProfile(),
    settings: {
      resumeFormat: "pdf",
      resumeTemplateId: "classic_ats",
      fontPreset: "inter_requisite",
      appearanceTheme: "system",
      humanReviewRequired: true,
      allowAutoSubmitOverride: false,
      keepSessionAlive: false,
      discoveryOnly: false,
    },
    mode: "prepare_only",
    submitAuthorized: false,
    intermediateMutationsAuthorized: false,
  };
}

async function writeApprovedResume(): Promise<{
  directory: string;
  filePath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "unemployed-sw-guard-"));
  const filePath = join(directory, "approved-resume.pdf");
  await writeFile(filePath, "approved resume", "utf8");
  return { directory, filePath };
}

describe("Service worker activation containment real-Chromium fixtures", () => {
  test(
    "register guard survives delete, shadow, prototype restore, and foreign-realm restoration attempts; registration rejects and the ledger stays clean",
    { timeout: 60_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerHtml(
        "/sw-hostile",
        `<h1>hostile</h1>
         <script>
         window.__bypass = [];
         var container = navigator.serviceWorker;
         var proto = Object.getPrototypeOf(container);
         try {
           var deleted = delete proto.register;
           window.__bypass.push(deleted ? 'delete-ok' : 'delete-false');
         } catch (e) { window.__bypass.push('delete-threw'); }
         try {
           Object.defineProperty(container, 'register', {
             value: function () { return Promise.resolve(); },
           });
           window.__bypass.push('shadow-ok');
         } catch (e) { window.__bypass.push('shadow-' + e.name); }
         try {
           Object.defineProperty(proto, 'register', {
             value: function () { return Promise.resolve(); },
           });
           window.__bypass.push('restore-ok');
         } catch (e) { window.__bypass.push('restore-' + e.name); }
         try {
           var frame = document.createElement('iframe');
           document.body.appendChild(frame);
           var foreignRegister =
             frame.contentWindow.navigator.serviceWorker.constructor.prototype.register;
           foreignRegister.call(container, '/hostile-sw.js').then(
             function () { window.__foreign = 'resolved'; },
             function (e) { window.__foreign = 'rejected-' + e.name; },
           );
         } catch (e) { window.__foreign = 'threw-' + e.name; }
         container.register('/hostile-sw.js').then(
           function () { window.__direct = 'resolved'; },
           function (e) { window.__direct = 'rejected-' + e.name; },
         );
         </script>`,
      );
      const { page } = await newGuardedPage();

      await page.goto(`${app.baseUrl}/sw-hostile`);
      await page.waitForTimeout(700);

      expect(
        await page.evaluate(
          () => (window as unknown as Record<string, unknown>)["__direct"],
        ),
      ).toBe("rejected-NotAllowedError");
      expect(
        await page.evaluate(
          () => (window as unknown as Record<string, unknown>)["__foreign"],
        ),
      ).toBe("rejected-NotAllowedError");
      expect(
        await page.evaluate(
          () => (window as unknown as Record<string, unknown>)["__bypass"],
        ),
      ).toEqual(["delete-false", "shadow-TypeError", "restore-TypeError"]);
      expect(requestHitsFor(app.hits, "/hostile-sw.js")).toHaveLength(0);
      expect(app.hits.filter((hit) => hit.method !== "GET")).toHaveLength(0);

      const guardStatus = await page.evaluate(
        readServiceWorkerRegisterGuardInPage,
      );
      expect(guardStatus.supported).toBe(true);
      expect(guardStatus.prototypeGuardInstalled).toBe(true);
      expect(guardStatus.instanceGuardInstalled).toBe(true);
      expect(guardStatus.integrityVerified).toBe(true);
      expect(guardStatus.blockedRegistrationAttempts).toBeGreaterThanOrEqual(1);

      const blankStatus = await page
        .context()
        .newPage()
        .then(async (blankPage) => {
          await blankPage.goto("about:blank");
          const status = await blankPage.evaluate(
            readServiceWorkerRegisterGuardInPage,
          );
          await blankPage.close();
          return status;
        });
      if (!blankStatus.supported) {
        expect(blankStatus.integrityVerified).toBe(true);
      } else {
        expect(blankStatus.integrityVerified).toBe(false);
      }
    },
  );

  test(
    "an already-active same-origin service worker stops preparation before any field action",
    { timeout: 90_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerScript(
        "/active-sw.js",
        "self.addEventListener('install', function () { self.skipWaiting(); }); self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });",
      );
      app.registerHtml(
        "/active-apply",
        `<label for="email">Email address</label><input id="email" autocomplete="email">
         <script>navigator.serviceWorker.register('/active-sw.js');</script>`,
      );
      const context = await browser!.newContext();
      activeContexts.push(context);
      const seedPage = await context.newPage();
      await seedPage.goto(`${app.baseUrl}/active-apply`);
      await seedPage.evaluate(() =>
        navigator.serviceWorker.register("/active-sw.js"),
      );
      const seededActive = await waitForCondition(
        () => context.serviceWorkers().length > 0,
        20_000,
        250,
      );
      expect(seededActive).toBe(true);

      const { directory, filePath } = await writeApprovedResume();
      try {
        const applyPage = await context.newPage();
        await applyPage.goto(`${app.baseUrl}/active-apply`);
        const result = await runGenericApplicationPreparation({
          context,
          page: applyPage,
          executionInput: createPreparationExecutionInput(
            `${app.baseUrl}/active-apply`,
            filePath,
          ),
          startedAt: new Date().toISOString(),
        });

        expect(result.state).toBe("paused");
        expect(result.summary).toBe(SERVICE_WORKER_STOP_SUMMARY);
        expect(result.blocker?.detail).toContain("/active-sw.js");
        expect(result.checkpoints.at(-1)?.label).toBe(
          "Paused for an application-origin service worker",
        );
        expect(
          result.questions.every((question) => question.status === "detected"),
        ).toBe(true);
        expect(result.externalWrites ?? []).toHaveLength(0);
        expect(app.hits.filter((hit) => hit.method !== "GET")).toHaveLength(0);
        expect(
          await applyPage.evaluate(
            () =>
              document.querySelector<HTMLInputElement>("#email")?.value ?? null,
          ),
        ).toBe("");
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  test(
    "a registration seeded before the run stops preparation even when the creation event was missed",
    { timeout: 120_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerScript(
        "/dormant-sw.js",
        "self.addEventListener('install', function () { self.skipWaiting(); }); self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });",
      );
      app.registerHtml(
        "/seed-page",
        "<script>navigator.serviceWorker.register('/dormant-sw.js');</script>",
      );
      app.registerHtml(
        "/dormant-apply",
        `<label for="email">Email address</label><input id="email" autocomplete="email">`,
      );
      const context = await browser!.newContext();
      activeContexts.push(context);

      try {
        // Seed the registration with no sentinel subscribed, then close every
        // client. The sentinel below therefore starts with an empty event
        // queue: detection must come from the enumeration or page-scan layer,
        // never from the creation event.
        const seedPage = await context.newPage();
        await seedPage.goto(`${app.baseUrl}/seed-page`);
        await seedPage.evaluate(() =>
          navigator.serviceWorker.register("/dormant-sw.js"),
        );
        const seeded = await waitForCondition(
          () => context.serviceWorkers().length > 0,
          20_000,
          250,
        );
        expect(seeded).toBe(true);
        for (const openPage of context.pages()) {
          await openPage.close().catch(() => undefined);
        }

        const sentinel = createApplicationRunServiceWorkerSentinel({
          context,
          targetUrl: `${app.baseUrl}/dormant-apply`,
        });
        const { directory, filePath } = await writeApprovedResume();
        try {
          expect(sentinel.pendingWorkerEventCount()).toBe(0);
          const applyPage = await context.newPage();
          sentinel.attachPage(applyPage);
          await applyPage.goto(`${app.baseUrl}/dormant-apply`);
          const result = await runGenericApplicationPreparation({
            context,
            page: applyPage,
            executionInput: createPreparationExecutionInput(
              `${app.baseUrl}/dormant-apply`,
              filePath,
            ),
            startedAt: new Date().toISOString(),
            sentinel,
          });

          expect(result.state).toBe("paused");
          expect(result.summary).toBe(SERVICE_WORKER_STOP_SUMMARY);
          expect(result.blocker?.detail).toContain("/dormant-sw.js");
          expect(result.blocker?.detail).toMatch(
            /context_service_workers_enumeration|page_service_worker_scan/u,
          );
          expect(result.blocker?.detail).not.toContain(
            "context_serviceworker_event",
          );
          expect(app.hits.filter((hit) => hit.method !== "GET")).toHaveLength(
            0,
          );
          expect(
            await applyPage.evaluate(
              () =>
                document.querySelector<HTMLInputElement>("#email")?.value ??
                null,
            ),
          ).toBe("");
        } finally {
          sentinel.detach();
          await rm(directory, { recursive: true, force: true });
        }
      } finally {
        // Context cleanup happens in afterEach.
      }
    },
  );

  test(
    "a hostile page that registers and claims a worker during settle never lands its mutation attempt",
    { timeout: 90_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerScript(
        "/claim-sw.js",
        `self.addEventListener('install', function () { self.skipWaiting(); fetch('/claim-probe'); });
         self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });
         self.addEventListener('message', function (event) {
           if (event.data === 'exfiltrate') {
             fetch('/claim-mutate', { method: 'POST', body: 'exfil' });
           }
         });`,
      );
      app.registerHtml(
        "/claim-apply",
        `<label for="email">Email address</label><input id="email" autocomplete="email">
         <button id="send" type="button">send</button>
         <script>
         navigator.serviceWorker.register('/claim-sw.js').then(function (registration) {
           window.__claimed = false;
           navigator.serviceWorker.ready.then(function () {
             window.__claimed = true;
           });
           document.getElementById('send').addEventListener('click', function () {
             registration.active.postMessage('exfiltrate');
           });
         });
         </script>`,
      );
      const context = await browser!.newContext();
      activeContexts.push(context);
      const sentinel = createApplicationRunServiceWorkerSentinel({
        context,
        targetUrl: `${app.baseUrl}/claim-apply`,
      });
      const { directory, filePath } = await writeApprovedResume();

      try {
        const page = await context.newPage();
        sentinel.attachPage(page);
        await page.goto(`${app.baseUrl}/claim-apply`);
        const result = await runGenericApplicationPreparation({
          context,
          page,
          executionInput: createPreparationExecutionInput(
            `${app.baseUrl}/claim-apply`,
            filePath,
          ),
          startedAt: new Date().toISOString(),
          sentinel,
        });

        expect(result.state).toBe("paused");
        expect(result.summary).toBe(SERVICE_WORKER_STOP_SUMMARY);
        expect(result.blocker?.detail).toContain("/claim-sw.js");
        expect(requestHitsFor(app.hits, "/claim-mutate")).toHaveLength(0);
        expect(app.hits.filter((hit) => hit.method !== "GET")).toHaveLength(0);
        const probeHits = requestHitsFor(app.hits, "/claim-probe");
        expect(probeHits.length).toBeLessThanOrEqual(1);
        for (const hit of probeHits) {
          expect(hit.query).toBe("");
        }
        const claimed = await waitForCondition(
          () =>
            page.evaluate(
              () =>
                (window as unknown as Record<string, unknown>)["__claimed"] ===
                true,
            ),
          5_000,
          100,
        );
        if (claimed) {
          const controllerUrl = await page.evaluate(
            () => window.navigator.serviceWorker.controller?.scriptURL ?? null,
          );
          expect(controllerUrl).toContain("/claim-sw.js");
        }
      } finally {
        sentinel.detach();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  test(
    "an active cross-origin worker in an embedded frame does not block or stop application preparation",
    { timeout: 90_000 },
    async () => {
      const originApp = await startTrackedServer();
      const crossOriginApp = await startTrackedServer();
      crossOriginApp.registerScript(
        "/b-sw.js",
        "self.addEventListener('install', function () { self.skipWaiting(); });",
      );
      crossOriginApp.registerHtml(
        "/b-host",
        "<script>navigator.serviceWorker.register('/b-sw.js').then(function () { return navigator.serviceWorker.ready; });</script>",
      );
      originApp.registerHtml(
        "/iframe-worker-host",
        `<label for="email">Email address</label><input id="email" autocomplete="email">
         <iframe src="${crossOriginApp.baseUrl}/b-host" title="cross origin"></iframe>`,
      );
      const context = await browser!.newContext();
      activeContexts.push(context);
      const sentinel = createApplicationRunServiceWorkerSentinel({
        context,
        targetUrl: `${originApp.baseUrl}/iframe-worker-host`,
      });
      const { directory, filePath } = await writeApprovedResume();

      try {
        const page = await context.newPage();
        sentinel.attachPage(page);
        await page.goto(`${originApp.baseUrl}/iframe-worker-host`);
        await page.waitForLoadState("load");
        const result = await runGenericApplicationPreparation({
          context,
          page,
          executionInput: createPreparationExecutionInput(
            `${originApp.baseUrl}/iframe-worker-host`,
            filePath,
          ),
          startedAt: new Date().toISOString(),
          sentinel,
        });

        expect(result.summary).not.toBe(SERVICE_WORKER_STOP_SUMMARY);
        expect(result.submittedAt).toBeNull();
        const crossOriginWorkers = context
          .serviceWorkers()
          .filter((worker) => worker.url().startsWith(crossOriginApp.baseUrl));
        expect(crossOriginWorkers.length).toBeGreaterThan(0);
        expect(
          result.blocker === null ||
            !(result.blocker.detail ?? "").includes(crossOriginApp.baseUrl),
        ).toBe(true);
      } finally {
        sentinel.detach();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  test(
    "an application popup is blocked in-page, and a trusted target=_blank popup is closed immediately with a recorded interruption",
    { timeout: 90_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerHtml(
        "/popup-opener",
        `<label for="email">Email address</label><input id="email" autocomplete="email">
         <script>
         window.setTimeout(function () {
           window.open('/popup-target', '_blank');
         }, 300);
         </script>`,
      );
      app.registerHtml(
        "/unguarded-opener",
        `<button id="open" type="button">open</button>
         <script>
         document.getElementById('open').addEventListener('click', function () {
           window.open('/popup-target', '_blank');
         });
         </script>`,
      );
      const context = await browser!.newContext();
      activeContexts.push(context);
      const sentinel = createApplicationRunServiceWorkerSentinel({
        context,
        targetUrl: `${app.baseUrl}/popup-opener`,
      });
      const { directory, filePath } = await writeApprovedResume();

      try {
        const page = await context.newPage();
        sentinel.attachPage(page);
        await page.goto(`${app.baseUrl}/popup-opener`);

        // Phase one: the in-page window.open wrapper blocks the timer-driven
        // popup and the next verification gate stops the run.
        const result = await runGenericApplicationPreparation({
          context,
          page,
          executionInput: createPreparationExecutionInput(
            `${app.baseUrl}/popup-opener`,
            filePath,
          ),
          startedAt: new Date().toISOString(),
          sentinel,
        });

        expect(result.state).toBe("paused");
        expect(result.summary).toBe(
          "The application page attempted to open an unexpected popup",
        );
        expect(result.blocker?.detail).toContain("popup");
        const windowOpenAttempt =
          await getLatestBlockedPrepareOnlyAttempt(page);
        expect(windowOpenAttempt).toMatchObject({ kind: "window_open" });
        expect(windowOpenAttempt?.url ?? "").toContain("/popup-target");
        expect(context.pages().length).toBe(1);

        // Phase two: a page without the in-page guard (the wrapper above
        // already proved it blocks window.open on the application page) opens
        // a real tab via a trusted click; the context-level containment must
        // close it and record the interruption into the application ledger.
        const unguardedPage = await context.newPage();
        await unguardedPage.goto(`${app.baseUrl}/unguarded-opener`);
        await unguardedPage.click("#open");
        const popupRecorded = await waitForCondition(
          async () => {
            const snapshot = await ensurePrepareOnlyMutationGuard(page, false);
            return snapshot.blockedAttempts.some(
              (attempt) => attempt.kind === "popup_open",
            );
          },
          5_000,
          150,
        );
        expect(popupRecorded).toBe(true);
        const popupAttemptAfterContainment = (
          await ensurePrepareOnlyMutationGuard(page, false)
        ).blockedAttempts.find((attempt) => attempt.kind === "popup_open");
        expect(popupAttemptAfterContainment).toBeDefined();
        expect(popupAttemptAfterContainment?.url ?? "").toContain(
          "/popup-target",
        );
        await unguardedPage.close().catch(() => undefined);
      } finally {
        sentinel.detach();
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  test(
    "an application download is canceled, recorded in the guard ledger, and stops the flow before further actions",
    { timeout: 90_000 },
    async () => {
      const app = await startTrackedServer();
      // A Content-Disposition attachment is the standard way application
      // origins force a real download; unlike an anchor download attribute it
      // travels through the normal network path, so both the transport hit and
      // the Playwright download event are observable.
      app.registerAttachment("/force-download", "attachment-payload");
      app.registerHtml(
        "/download-apply",
        `<label for="email">Email address</label><input id="email" autocomplete="email">
         <a id="grab" href="/force-download">download</a>`,
      );
      const context = await browser!.newContext();
      activeContexts.push(context);
      const sentinel = createApplicationRunServiceWorkerSentinel({
        context,
        targetUrl: `${app.baseUrl}/download-apply`,
      });

      try {
        const page = await context.newPage();
        sentinel.attachPage(page);
        await ensurePrepareOnlyMutationGuard(page, false).catch(
          () => undefined,
        );
        await page.goto(`${app.baseUrl}/download-apply`);
        const transportAttempts: string[] = [];
        page.on("request", (request) => {
          if (request.url().includes("/force-download")) {
            transportAttempts.push(request.url());
          }
        });

        await page.click("#grab");

        // The anchor's download attribute makes Chromium treat the queryless
        // GET as a real download, so the sentinel observes it exactly once,
        // cancels it before anything is written outside the managed browser,
        // and records it into the guard ledger.
        const recordedDownload = await waitForCondition(
          async () => {
            const attempt = await getLatestBlockedPrepareOnlyAttempt(page);
            return attempt?.kind === "download";
          },
          5_000,
          100,
        );
        expect(recordedDownload).toBe(true);

        expect(transportAttempts).toHaveLength(1);
        expect(
          app.hits.filter((hit) => hit.path === "/force-download"),
        ).toHaveLength(1);
        expect(
          app.hits.filter((hit) => hit.path === "/force-download")[0]?.method,
        ).toBe("GET");
        expect(
          app.hits.filter((hit) => hit.path === "/force-download")[0]?.query,
        ).toBe("");
        expect(
          requestHitsFor(app.hits, "/force-download").every(
            (hit) => hit.body === "",
          ),
        ).toBe(true);
        const latestAttempt = await getLatestBlockedPrepareOnlyAttempt(page);
        expect(latestAttempt).toMatchObject({ kind: "download" });
        expect(latestAttempt?.url ?? "").toContain("/force-download");
        expect(app.hits.filter((hit) => hit.method !== "GET")).toHaveLength(0);
        expect(page.url()).toContain("/download-apply");
      } finally {
        sentinel.detach();
      }
    },
  );

  test(
    "sentinel listeners are fully detached so post-run workers, popups, and requests are no longer contained",
    { timeout: 90_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerScript(
        "/cleanup-sw.js",
        "self.addEventListener('install', function () { self.skipWaiting(); });",
      );
      app.registerHtml(
        "/cleanup-host",
        `<button id="open-popup" type="button">popup</button>
         <script>
         document.getElementById('open-popup').addEventListener('click', function () {
           fetch('/after-detach-post', { method: 'POST', body: 'x' }).catch(function () {});
           window.open('/popup-after-detach', '_blank');
           navigator.serviceWorker.register('/cleanup-sw.js');
         });
         </script>`,
      );
      const context = await browser!.newContext();
      activeContexts.push(context);
      const sentinel = createApplicationRunServiceWorkerSentinel({
        context,
        targetUrl: `${app.baseUrl}/cleanup-host`,
      });
      const page = await context.newPage();
      sentinel.attachPage(page);
      await page.goto(`${app.baseUrl}/cleanup-host`);
      sentinel.detach();

      await page.click("#open-popup");
      await page.waitForTimeout(800);

      expect(sentinel.pendingWorkerEventCount()).toBe(0);
      const pagesAfter = context.pages();
      expect(
        pagesAfter.some((candidate) =>
          candidate.url().includes("/popup-after-detach"),
        ),
      ).toBe(true);
      expect(requestHitsFor(app.hits, "/after-detach-post")).toHaveLength(1);
      expect(context.serviceWorkers().length).toBeGreaterThan(0);
      for (const candidate of pagesAfter) {
        if (candidate !== page) {
          await candidate.close().catch(() => undefined);
        }
      }
    },
  );

  test(
    "tampering with the register-guard state flips verification and fails preparation closed",
    { timeout: 90_000 },
    async () => {
      const app = await startTrackedServer();
      app.registerHtml(
        "/tamper-apply",
        `<label for="email">Email address</label><input id="email" autocomplete="email">
         <script>
         var state = window['__unemployedServiceWorkerRegisterGuardV1'];
         if (state) { state.integrityVerified = false; }
         </script>`,
      );
      const { page } = await newGuardedPage();
      const { directory, filePath } = await writeApprovedResume();

      try {
        await page.goto(`${app.baseUrl}/tamper-apply`);
        const tampered = await page.evaluate(
          readServiceWorkerRegisterGuardInPage,
        );
        expect(tampered.guardStatePresent).toBe(true);
        expect(tampered.integrityVerified).toBe(false);

        const result = await runGenericApplicationPreparation({
          context: page.context(),
          page,
          executionInput: createPreparationExecutionInput(
            `${app.baseUrl}/tamper-apply`,
            filePath,
          ),
          startedAt: new Date().toISOString(),
        });

        expect(result.state).toBe("paused");
        expect(result.summary).toBe(SERVICE_WORKER_STOP_SUMMARY);
        expect(result.blocker?.detail).toContain("failed verification");
        expect(app.hits.filter((hit) => hit.method !== "GET")).toHaveLength(0);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
