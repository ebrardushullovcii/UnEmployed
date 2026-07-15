import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type * as childProcess from "node:child_process";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApplyExecutionResult } from "@unemployed/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";

interface FakeFormControl {
  index: number;
  tagName: "input" | "textarea" | "select" | "contenteditable";
  inputType: string;
  id: string;
  name: string;
  label: string;
  groupLabel: string;
  placeholder: string;
  autocomplete: string;
  required: boolean;
  invalid: boolean;
  validationMessage: string;
  disabled: boolean;
  readOnly: boolean;
  visible: boolean;
  value: string;
  checked: boolean;
  options: string[];
  selectedOptionLabel: string;
}

interface FakeActionControl {
  index: number;
  label: string;
  type: string;
  visible: boolean;
  disabled: boolean;
}

interface FakeApplicationStep {
  bodyText?: string;
  frameHints?: string[];
  controls?: Array<Partial<FakeFormControl> & Pick<FakeFormControl, "label">>;
  actions?: Array<
    Partial<FakeActionControl> & Pick<FakeActionControl, "label">
  >;
  mutationTriggerLabel?: string;
  actionsAfterMutation?: Array<
    Partial<FakeActionControl> & Pick<FakeActionControl, "label">
  >;
  blockedAttemptAfterMutation?: {
    kind: "dom_submit" | "form_request_submit" | "fetch" | "xhr";
    method: string;
  };
  blockedAttemptAfterAction?: {
    kind: "dom_submit" | "form_request_submit" | "fetch" | "xhr";
    method: string;
  };
}

interface FakeApplicationState {
  gotoUrls: string[];
  clickedLabels: string[];
  filledValues: Map<string, string>;
  uploadedFiles: Map<string, string>;
  selectedOptions: Map<string, string>;
  guardInstallCount: number;
  networkGuardInstallCount: number;
  guardBlockedAttempts: Array<{
    kind: "dom_submit" | "form_request_submit" | "fetch" | "xhr";
    method: string;
    url: string | null;
    at: string;
  }>;
}

const execFileMock = vi.fn();
const spawnMock = vi.fn();
const connectOverCDPMock = vi.fn();

vi.mock("node:child_process", async () => {
  const actual =
    await vi.importActual<typeof childProcess>("node:child_process");
  return {
    ...actual,
    execFile: execFileMock,
    spawn: spawnMock,
  };
});

vi.mock("playwright", () => ({
  chromium: {
    connectOverCDP: connectOverCDPMock,
  },
}));

type ExecFileCallback = (
  error: Error | null,
  stdout: string,
  stderr: string,
) => void;

function invokeExecFileCallback(args: unknown[]): void {
  const callback = args[args.length - 1];
  if (typeof callback === "function") {
    (callback as ExecFileCallback)(null, "[]", "");
  }
}

async function reserveFreePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  if (!port) {
    throw new Error("Failed to reserve a test port.");
  }
  return port;
}

function createFakeChildProcess() {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    exitCode: number | null;
    unref: () => void;
    kill: () => boolean;
  };
  child.pid = 9876;
  child.exitCode = null;
  child.unref = () => undefined;
  child.kill = () => {
    child.exitCode = 0;
    child.emit("exit", 0);
    return true;
  };
  return child;
}

function createFakeApplicationPage(stepsInput: readonly FakeApplicationStep[]) {
  const steps = stepsInput.map((step) => ({
    bodyText: step.bodyText ?? "Job application",
    frameHints: [...(step.frameHints ?? [])],
    controls: (step.controls ?? []).map((control, index) => ({
      index,
      tagName: control.tagName ?? "input",
      inputType: control.inputType ?? "text",
      id: control.id ?? "",
      name: control.name ?? "",
      label: control.label,
      groupLabel: control.groupLabel ?? "",
      placeholder: control.placeholder ?? "",
      autocomplete: control.autocomplete ?? "",
      required: control.required ?? false,
      invalid: control.invalid ?? false,
      validationMessage: control.validationMessage ?? "",
      disabled: control.disabled ?? false,
      readOnly: control.readOnly ?? false,
      visible: control.visible ?? true,
      value: control.value ?? "",
      checked: control.checked ?? false,
      options: [...(control.options ?? [])],
      selectedOptionLabel: control.selectedOptionLabel ?? "",
    })),
    actions: (step.actions ?? []).map((action, index) => ({
      index,
      label: action.label,
      type: action.type ?? "button",
      visible: action.visible ?? true,
      disabled: action.disabled ?? false,
    })),
    mutationTriggerLabel: step.mutationTriggerLabel ?? null,
    actionsAfterMutation: (step.actionsAfterMutation ?? []).map(
      (action, index) => ({
        index,
        label: action.label,
        type: action.type ?? "button",
        visible: action.visible ?? true,
        disabled: action.disabled ?? false,
      }),
    ),
    blockedAttemptAfterMutation: step.blockedAttemptAfterMutation ?? null,
    blockedAttemptAfterAction: step.blockedAttemptAfterAction ?? null,
  }));
  const state: FakeApplicationState = {
    gotoUrls: [],
    clickedLabels: [],
    filledValues: new Map(),
    uploadedFiles: new Map(),
    selectedOptions: new Map(),
    guardInstallCount: 0,
    networkGuardInstallCount: 0,
    guardBlockedAttempts: [],
  };
  let stepIndex = 0;
  let currentUrl = "about:blank";
  let targetBaseUrl = "";

  const currentStep = () => steps[Math.min(stepIndex, steps.length - 1)]!;

  const applyMutationEffects = (control: FakeFormControl) => {
    if (state.guardInstallCount === 0) {
      throw new Error(
        "Fake application field mutated before guard installation.",
      );
    }

    const step = currentStep();
    if (
      step.mutationTriggerLabel &&
      step.mutationTriggerLabel !== control.label
    ) {
      return;
    }

    if (step.actionsAfterMutation.length > 0) {
      step.actions = step.actionsAfterMutation;
      step.actionsAfterMutation = [];
    }
    if (step.blockedAttemptAfterMutation) {
      state.guardBlockedAttempts.push({
        ...step.blockedAttemptAfterMutation,
        url: currentUrl,
        at: new Date().toISOString(),
      });
      step.blockedAttemptAfterMutation = null;
    }
  };

  const createControlLocator = (index: number) => ({
    fill: (value: string) => {
      const control = currentStep().controls[index];
      if (!control) {
        throw new Error(`Missing fake form control ${index}.`);
      }
      control.value = value;
      state.filledValues.set(control.label, value);
      applyMutationEffects(control);
      return Promise.resolve();
    },
    setInputFiles: (filePath: string) => {
      const control = currentStep().controls[index];
      if (!control) {
        throw new Error(`Missing fake file control ${index}.`);
      }
      control.value = filePath;
      state.uploadedFiles.set(control.label, filePath);
      applyMutationEffects(control);
      return Promise.resolve();
    },
    selectOption: (option: { label: string }) => {
      const control = currentStep().controls[index];
      if (!control) {
        throw new Error(`Missing fake select control ${index}.`);
      }
      control.value = option.label;
      control.selectedOptionLabel = option.label;
      state.selectedOptions.set(control.label, option.label);
      applyMutationEffects(control);
      return Promise.resolve();
    },
  });

  const clickAction = (action: FakeActionControl) => {
    if (!currentStep().actions.includes(action)) {
      throw new Error("Fake action detached before click.");
    }
    if (!action) {
      throw new Error("Missing fake action control.");
    }
    state.clickedLabels.push(action.label);
    const step = currentStep();
    if (step.blockedAttemptAfterAction) {
      state.guardBlockedAttempts.push({
        ...step.blockedAttemptAfterAction,
        url: currentUrl,
        at: new Date().toISOString(),
      });
      step.blockedAttemptAfterAction = null;
      return Promise.resolve();
    }
    if (stepIndex < steps.length - 1) {
      stepIndex += 1;
      currentUrl = `${targetBaseUrl}?step=${stepIndex}`;
    }
    return Promise.resolve();
  };

  const createActionLocator = (index: number) => ({
    click: () => {
      const action = currentStep().actions[index];
      if (!action) {
        throw new Error(`Missing fake action control ${index}.`);
      }
      return clickAction(action);
    },
    elementHandle: () => {
      const action = currentStep().actions[index] ?? null;
      return Promise.resolve(
        action
          ? {
              evaluate: () => Promise.resolve({ ...action }),
              click: () => clickAction(action),
            }
          : null,
      );
    },
  });

  const page = {
    isClosed: () => false,
    url: () => currentUrl,
    title: () => Promise.resolve(`Application step ${stepIndex + 1}`),
    bringToFront: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn((url: string) => {
      targetBaseUrl = url;
      currentUrl = url;
      state.gotoUrls.push(url);
      return Promise.resolve(null);
    }),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    route: vi.fn().mockImplementation(() => {
      state.networkGuardInstallCount += 1;
      return Promise.resolve(undefined);
    }),
    evaluate: vi.fn((callback: { name?: string }) => {
      if (callback.name === "installPrepareOnlyMutationGuardInPage") {
        state.guardInstallCount += 1;
        return Promise.resolve(undefined);
      }
      if (callback.name === "readPrepareOnlyMutationGuardInPage") {
        return Promise.resolve({
          installed: state.guardInstallCount > 0,
          blockedAttempts: [...state.guardBlockedAttempts],
        });
      }
      throw new Error(
        `Unexpected fake page evaluate callback: ${callback.name}`,
      );
    }),
    locator: (selector: string) => {
      if (selector === "body") {
        return {
          innerText: () => Promise.resolve(currentStep().bodyText),
        };
      }
      if (selector === "iframe") {
        return {
          evaluateAll: () => Promise.resolve(currentStep().frameHints),
        };
      }
      if (selector.includes("contenteditable")) {
        return {
          evaluateAll: () => Promise.resolve(currentStep().controls),
          first: () => ({
            waitFor: () => Promise.resolve(undefined),
          }),
          nth: (index: number) => createControlLocator(index),
        };
      }
      if (selector.includes("a[role='button']")) {
        return {
          evaluateAll: () => Promise.resolve(currentStep().actions),
          nth: (index: number) => createActionLocator(index),
        };
      }
      throw new Error(`Unexpected fake locator selector: ${selector}`);
    },
  };

  return { page, state };
}

function createTestJob() {
  return {
    id: "job_prepare_runtime",
    source: "target_site" as const,
    sourceJobId: "job_prepare_runtime",
    discoveryMethod: "catalog_seed" as const,
    collectionMethod: "fallback_search" as const,
    canonicalUrl: "https://example.com/jobs/job_prepare_runtime",
    applicationUrl: "https://apply.example.com/jobs/job_prepare_runtime",
    title: "Senior Engineer",
    company: "Example Co",
    location: "Remote",
    workMode: ["remote" as const],
    applyPath: "external_redirect" as const,
    easyApplyEligible: false,
    postedAt: "2026-03-20T09:00:00.000Z",
    postedAtText: null,
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
  };
}

function createTestProfile() {
  return {
    id: "candidate_prepare_runtime",
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
      id: "resume_prepare_runtime",
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

function createTestSettings() {
  return {
    resumeFormat: "pdf" as const,
    resumeTemplateId: "classic_ats" as const,
    fontPreset: "inter_requisite" as const,
    appearanceTheme: "system" as const,
    humanReviewRequired: true,
    allowAutoSubmitOverride: false,
    keepSessionAlive: false,
    discoveryOnly: false,
  };
}

async function runApplicationScenario(input: {
  steps: readonly FakeApplicationStep[];
  mode?: "prepare_only" | "submit_when_ready";
  submitAuthorized?: boolean;
  applicationUrl?: string | null;
}): Promise<{
  result: ApplyExecutionResult;
  state: FakeApplicationState;
  resumeFilePath: string;
}> {
  const userDataDir = await mkdtemp(
    join(tmpdir(), "unemployed-prepare-runtime-"),
  );

  try {
    const resumeFilePath = join(userDataDir, "approved-resume.pdf");
    await writeFile(resumeFilePath, "approved resume", "utf8");
    const debugPort = await reserveFreePort();
    const fakeApplication = createFakeApplicationPage(input.steps);
    const fakeContext = {
      pages: () => [fakeApplication.page],
      newPage: () => Promise.resolve(fakeApplication.page),
    };
    const fakeBrowser = {
      contexts: () => [fakeContext],
      isConnected: () => true,
      once: vi.fn(() => fakeBrowser),
      close: vi.fn().mockResolvedValue(undefined),
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response),
      ),
    );
    execFileMock.mockImplementation((...args: unknown[]) => {
      invokeExecFileCallback(args);
    });
    spawnMock.mockReturnValue(createFakeChildProcess());
    connectOverCDPMock.mockResolvedValue(fakeBrowser);

    const { createBrowserAgentRuntime } =
      await import("./playwright-browser-runtime");
    const runtime = createBrowserAgentRuntime({
      userDataDir,
      debugPort,
      headless: true,
    });
    const executionInput = {
      job: {
        ...createTestJob(),
        ...(input.applicationUrl !== undefined
          ? { applicationUrl: input.applicationUrl }
          : {}),
      },
      resumeArtifact: {
        id: "application_resume_prepare_runtime",
        jobId: "job_prepare_runtime",
        source: "tailored_export" as const,
        sourceDocumentId: null,
        exportArtifactId: "resume_export_prepare_runtime",
        fileName: "resume.pdf",
        filePath: resumeFilePath,
        approvedAt: "2026-03-20T10:00:00.000Z",
      },
      profile: createTestProfile(),
      settings: createTestSettings(),
      mode: input.mode ?? ("prepare_only" as const),
      ...(input.submitAuthorized !== undefined
        ? { submitAuthorized: input.submitAuthorized }
        : {}),
    };

    const result = await runtime.executeApplicationFlow(
      "target_site",
      executionInput,
    );

    return {
      result,
      state: fakeApplication.state,
      resumeFilePath,
    };
  } finally {
    await rm(userDataDir, { recursive: true, force: true });
  }
}

describe("Playwright prepare-only application flow", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    execFileMock.mockReset();
    spawnMock.mockReset();
    connectOverCDPMock.mockReset();
  });

  test("page guard blocks DOM submission and mutating browser transports", async () => {
    let originalFormSubmitCalls = 0;
    let originalRequestSubmitCalls = 0;
    let originalXhrSendCalls = 0;
    let submitListener: EventListener | null = null;

    class FakeHtmlFormElement {
      method = "post";
      action = "https://apply.example.com/jobs/job_prepare_runtime/submit";

      submit() {
        originalFormSubmitCalls += 1;
      }

      requestSubmit() {
        originalRequestSubmitCalls += 1;
      }
    }

    class FakeXmlHttpRequest {
      open(
        _method: string,
        _url: string | URL,
        _async = true,
        _username?: string | null,
        _password?: string | null,
      ) {
        void _async;
        void _username;
        void _password;
      }

      send(_body?: Document | XMLHttpRequestBodyInit | null) {
        void _body;
        originalXhrSendCalls += 1;
      }
    }

    const originalFetch = vi.fn(() =>
      Promise.resolve(new Response("ok", { status: 200 })),
    );
    const originalSendBeacon = vi.fn(() => true);
    const fakeWindow = {
      location: {
        href: "https://apply.example.com/jobs/job_prepare_runtime",
      },
      fetch: originalFetch as unknown as typeof window.fetch,
    };
    const fakeDocument = {
      addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
      ) {
        if (type === "submit" && typeof listener === "function") {
          submitListener = listener;
        }
      },
    };
    const fakeNavigator = {
      sendBeacon: originalSendBeacon as unknown as typeof navigator.sendBeacon,
    };

    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("document", fakeDocument);
    vi.stubGlobal(
      "HTMLFormElement",
      FakeHtmlFormElement as unknown as typeof HTMLFormElement,
    );
    vi.stubGlobal(
      "XMLHttpRequest",
      FakeXmlHttpRequest as unknown as typeof XMLHttpRequest,
    );
    vi.stubGlobal("navigator", fakeNavigator);

    const {
      installPrepareOnlyMutationGuardInPage,
      readPrepareOnlyMutationGuardInPage,
    } = await import("./playwright-application-flow");
    installPrepareOnlyMutationGuardInPage();

    const form = new FakeHtmlFormElement();
    form.submit();
    form.requestSubmit();
    expect(originalFormSubmitCalls).toBe(0);
    expect(originalRequestSubmitCalls).toBe(0);
    expect(
      fakeNavigator.sendBeacon(
        "https://apply.example.com/jobs/job_prepare_runtime/beacon",
        "payload",
      ),
    ).toBe(false);
    expect(originalSendBeacon).not.toHaveBeenCalled();

    await expect(
      fakeWindow.fetch(
        "https://apply.example.com/jobs/job_prepare_runtime/submit",
        { method: "POST" },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      fakeWindow.fetch("https://apply.example.com/jobs/job_prepare_runtime", {
        method: "GET",
      }),
    ).resolves.toBeInstanceOf(Response);
    expect(originalFetch).toHaveBeenCalledTimes(1);

    const xhr = new FakeXmlHttpRequest();
    xhr.open(
      "PATCH",
      "https://apply.example.com/jobs/job_prepare_runtime/submit",
    );
    expect(() => xhr.send("payload")).toThrow(/Prepare-only mode blocked/u);
    expect(originalXhrSendCalls).toBe(0);

    const preventDefault = vi.fn();
    const stopImmediatePropagation = vi.fn();
    const capturedSubmitListener = submitListener as unknown as EventListener;
    capturedSubmitListener({
      target: form,
      preventDefault,
      stopImmediatePropagation,
    } as unknown as Event);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopImmediatePropagation).toHaveBeenCalledOnce();

    const guard = readPrepareOnlyMutationGuardInPage();
    expect(guard.installed).toBe(true);
    expect(guard.blockedAttempts.map((attempt) => attempt.kind)).toEqual(
      expect.arrayContaining([
        "form_submit",
        "form_request_submit",
        "send_beacon",
        "fetch",
        "xhr",
        "dom_submit",
      ]),
    );

    installPrepareOnlyMutationGuardInPage(true);
    await expect(
      fakeWindow.fetch(
        "https://apply.example.com/jobs/job_prepare_runtime/autosave",
        { method: "POST" },
      ),
    ).resolves.toBeInstanceOf(Response);
    expect(
      fakeNavigator.sendBeacon(
        "https://apply.example.com/jobs/job_prepare_runtime/progress",
        "payload",
      ),
    ).toBe(true);
    const authorizedXhr = new FakeXmlHttpRequest();
    authorizedXhr.open(
      "PATCH",
      "https://apply.example.com/jobs/job_prepare_runtime/draft",
    );
    expect(() => authorizedXhr.send("payload")).not.toThrow();

    form.submit();
    form.requestSubmit();
    expect(originalFormSubmitCalls).toBe(0);
    expect(originalRequestSubmitCalls).toBe(0);
    expect(originalFetch).toHaveBeenCalledTimes(2);
    expect(originalSendBeacon).toHaveBeenCalledOnce();
    expect(originalXhrSendCalls).toBe(1);
  });

  test("fills exact grounded fields, uploads the approved resume, advances non-final steps, and never clicks final submit", async () => {
    const { result, state, resumeFilePath } = await runApplicationScenario({
      submitAuthorized: false,
      steps: [
        {
          controls: [
            {
              label: "First name",
              name: "candidate[first_name]",
              autocomplete: "given-name",
              required: true,
            },
            {
              label: "Email address",
              name: "candidate[email]",
              inputType: "email",
              autocomplete: "email",
              required: true,
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
              visible: false,
            },
          ],
          actions: [{ label: "Next" }],
        },
        {
          controls: [
            {
              label: "Phone number",
              name: "candidate[phone]",
              inputType: "tel",
              autocomplete: "tel",
              required: true,
            },
          ],
          actions: [{ label: "Continue" }],
        },
        {
          actions: [{ label: "Review application" }],
        },
        {
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.gotoUrls).toEqual([
      "https://apply.example.com/jobs/job_prepare_runtime",
    ]);
    expect(state.filledValues.get("First name")).toBe("Alex");
    expect(state.filledValues.get("Email address")).toBe("alex@example.com");
    expect(state.filledValues.get("Phone number")).toBe("+36 30 123 4567");
    expect(state.uploadedFiles.get("Resume / CV")).toBe(resumeFilePath);
    expect(state.clickedLabels).toEqual([
      "Next",
      "Continue",
      "Review application",
    ]);
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.state).toBe("paused");
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(result.submittedAt).toBeNull();
    expect(result.outcome).toBeNull();
    expect(result.blocker).toBeNull();
    expect(
      result.questions.some((question) => question.kind === "resume"),
    ).toBe(true);
    expect(
      result.questions.some(
        (question) =>
          question.kind === "personal_info" &&
          question.status === "answered" &&
          question.submittedAnswer === "alex@example.com",
      ),
    ).toBe(true);
    expect(
      result.questions.some((question) => question.status === "submitted"),
    ).toBe(false);
    expect(result.replay.lastUrl).toContain("?step=3");
    expect(result.replay.checkpointUrls).toContain(
      "https://apply.example.com/jobs/job_prepare_runtime",
    );
    expect(state.guardInstallCount).toBeGreaterThan(0);
    expect(state.networkGuardInstallCount).toBe(1);
  }, 10_000);

  test("re-inspects after autofill and never clicks a Continue position that rerendered into Submit", async () => {
    const { result, state } = await runApplicationScenario({
      submitAuthorized: false,
      steps: [
        {
          controls: [
            {
              label: "Email address",
              inputType: "email",
              autocomplete: "email",
              required: true,
            },
            {
              label: "Resume",
              inputType: "file",
              required: true,
            },
          ],
          actions: [{ label: "Continue" }],
          mutationTriggerLabel: "Email address",
          actionsAfterMutation: [
            { label: "Submit application", type: "submit" },
          ],
        },
      ],
    });

    expect(state.clickedLabels).toEqual([]);
    expect(state.uploadedFiles.has("Resume")).toBe(true);
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(result.checkpoints.at(-1)?.label).toBe("Paused before final submit");
  });

  test("pauses when a known prefilled value conflicts with the saved profile", async () => {
    const { result, state } = await runApplicationScenario({
      submitAuthorized: false,
      steps: [
        {
          controls: [
            {
              label: "Email address",
              inputType: "email",
              autocomplete: "email",
              required: true,
              value: "someone-else@example.com",
            },
            {
              label: "Resume",
              inputType: "file",
              required: true,
            },
          ],
          actions: [{ label: "Next" }],
        },
      ],
    });

    expect(state.clickedLabels).toEqual([]);
    expect(state.filledValues.has("Email address")).toBe(false);
    expect(result.summary).toBe(
      "Prefilled application values need manual review",
    );
    expect(result.blocker?.code).toBe("requires_manual_review");
    expect(result.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prompt: "Email address",
          status: "detected",
          submittedAnswer: null,
        }),
      ]),
    );
  });

  test("stops honestly when the prepare-only guard blocks a mutating page request", async () => {
    const { result, state } = await runApplicationScenario({
      submitAuthorized: false,
      steps: [
        {
          controls: [
            {
              label: "Resume",
              inputType: "file",
              required: true,
            },
          ],
          actions: [{ label: "Next" }],
          mutationTriggerLabel: "Resume",
          blockedAttemptAfterMutation: {
            kind: "fetch",
            method: "POST",
          },
        },
      ],
    });

    expect(state.clickedLabels).toEqual([]);
    expect(state.guardBlockedAttempts).toHaveLength(1);
    expect(result.summary).toBe(
      "Prepare-only guard blocked a mutating page action",
    );
    expect(result.blocker?.code).toBe("requires_manual_review");
    expect(result.checkpoints.at(-1)?.label).toBe(
      "Paused after the prepare-only guard intervened",
    );
  });

  test("stops after a Continue handler attempts a guarded form submission", async () => {
    const { result, state } = await runApplicationScenario({
      submitAuthorized: false,
      steps: [
        {
          controls: [
            {
              label: "Resume",
              inputType: "file",
              required: true,
            },
          ],
          actions: [{ label: "Continue", type: "button" }],
          blockedAttemptAfterAction: {
            kind: "form_request_submit",
            method: "POST",
          },
        },
      ],
    });

    expect(state.clickedLabels).toEqual(["Continue"]);
    expect(state.guardBlockedAttempts).toHaveLength(1);
    expect(result.summary).toBe(
      "Prepare-only guard blocked a mutating page action",
    );
    expect(result.submittedAt).toBeNull();
    expect(result.outcome).toBeNull();
  });

  test("falls back to the saved canonical URL when no application URL is available", async () => {
    const { result, state } = await runApplicationScenario({
      applicationUrl: null,
      submitAuthorized: false,
      steps: [
        {
          controls: [
            {
              label: "Resume",
              inputType: "file",
              required: true,
            },
          ],
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.gotoUrls).toEqual([
      "https://example.com/jobs/job_prepare_runtime",
    ]);
    expect(result.state).toBe("paused");
    expect(state.clickedLabels).toEqual([]);
  });

  test("pauses on unknown required questions after filling known fields", async () => {
    const { result, state } = await runApplicationScenario({
      submitAuthorized: false,
      steps: [
        {
          controls: [
            {
              label: "Email address",
              inputType: "email",
              autocomplete: "email",
              required: true,
            },
            {
              label: "Why do you want to work here?",
              tagName: "textarea",
              inputType: "textarea",
              required: true,
            },
          ],
          actions: [{ label: "Next" }],
        },
      ],
    });

    expect(state.filledValues.get("Email address")).toBe("alex@example.com");
    expect(state.clickedLabels).toEqual([]);
    expect(result.state).toBe("paused");
    expect(result.blocker?.code).toBe("missing_candidate_answer");
    expect(result.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prompt: "Why do you want to work here?",
          kind: "other",
          isRequired: true,
          status: "detected",
        }),
      ]),
    );
  });

  test("captures work-authorization radio groups as typed questions rather than consent", async () => {
    const { result, state } = await runApplicationScenario({
      submitAuthorized: false,
      steps: [
        {
          controls: [
            {
              label: "Yes",
              groupLabel: "Are you authorized to work in this country?",
              name: "work_authorization",
              inputType: "radio",
              required: true,
            },
            {
              label: "No",
              groupLabel: "Are you authorized to work in this country?",
              name: "work_authorization",
              inputType: "radio",
            },
          ],
          actions: [{ label: "Next" }],
        },
      ],
    });

    expect(state.clickedLabels).toEqual([]);
    expect(result.blocker?.code).toBe("missing_candidate_answer");
    expect(result.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "work_authorization",
          answerOptions: ["Yes", "No"],
        }),
      ]),
    );
  });

  test.each([
    {
      label: "login",
      step: {
        bodyText: "Sign in to continue your application",
        controls: [
          {
            label: "Password",
            inputType: "password",
            required: true,
          },
        ],
      },
      blockerCode: "site_login_required",
    },
    {
      label: "captcha",
      step: {
        bodyText: "Verify you are human",
        frameHints: ["reCAPTCHA challenge"],
      },
      blockerCode: "requires_manual_review",
    },
    {
      label: "consent",
      step: {
        controls: [
          {
            label: "I agree to the privacy terms",
            inputType: "checkbox",
            required: true,
          },
        ],
      },
      blockerCode: "missing_consent",
    },
  ])("detects $label gates as blockers without clicking", async (scenario) => {
    const { result, state } = await runApplicationScenario({
      submitAuthorized: false,
      steps: [scenario.step],
    });

    expect(result.state).toBe("paused");
    expect(result.blocker?.code).toBe(scenario.blockerCode);
    expect(state.clickedLabels).toEqual([]);
  });

  test("treats a submit-typed Continue control on an opaque page as non-clickable", async () => {
    const { result, state } = await runApplicationScenario({
      submitAuthorized: false,
      steps: [
        {
          bodyText: "Application details",
          controls: [
            {
              label: "Resume",
              inputType: "file",
              required: true,
            },
          ],
          actions: [{ label: "Continue", type: "submit" }],
        },
      ],
    });

    expect(state.clickedLabels).toEqual([]);
    expect(result.state).toBe("paused");
    expect(result.blocker?.code).toBe("requires_manual_review");
    expect(result.checkpoints.at(-1)?.label).toBe(
      "Paused without a safe advance control",
    );
    expect(result.summary).toBe(
      "Application preparation needs manual navigation",
    );
  });

  test("recognizes a submit-typed Continue as final only with explicit final-page evidence", async () => {
    const { result, state } = await runApplicationScenario({
      submitAuthorized: false,
      steps: [
        {
          bodyText: "Review your application before submission",
          controls: [
            {
              label: "Resume",
              inputType: "file",
              required: true,
            },
          ],
          actions: [{ label: "Continue", type: "submit" }],
        },
      ],
    });

    expect(state.clickedLabels).toEqual([]);
    expect(result.blocker).toBeNull();
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(result.checkpoints.at(-1)?.label).toBe("Paused before final submit");
  });

  test.each([
    { label: "missing authorization", submitAuthorized: undefined },
    { label: "present authorization", submitAuthorized: true },
  ])(
    "keeps submit_when_ready non-submitting with $label",
    async ({ submitAuthorized }) => {
      const { result, state } = await runApplicationScenario({
        mode: "submit_when_ready",
        ...(submitAuthorized !== undefined ? { submitAuthorized } : {}),
        steps: [
          {
            controls: [
              {
                label: "Resume",
                inputType: "file",
                required: true,
              },
            ],
            actions: [{ label: "Finish application", type: "submit" }],
          },
        ],
      });

      expect(state.clickedLabels).toEqual([]);
      expect(result.state).toBe("paused");
      expect(result.submittedAt).toBeNull();
      expect(result.outcome).toBeNull();
      expect(result.checkpoints.at(-1)?.label).toBe(
        "Paused before final submit",
      );
      expect(result.detail).toContain("did not click the control");
    },
  );
});
