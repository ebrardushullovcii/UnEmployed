import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type * as childProcess from "node:child_process";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SavedJobSchema,
  type ApplyExecutionResult,
  type CandidateProfile,
} from "@unemployed/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ApplicationAttachmentArtifact } from "./runtime-types";

interface FakeFormControl {
  index: number;
  tagName: "input" | "textarea" | "select" | "contenteditable";
  inputType: string;
  id: string;
  name: string;
  label: string;
  groupLabel: string;
  role: string;
  ariaHidden: boolean;
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
  multiple: boolean;
  options: string[];
  selectedOptionLabel: string;
  cssInJsSelectedValueText: string;
  cssInJsSelectedCountryCode: string;
  valueAfterFill: string | undefined;
  valuesAfterWaits: string[];
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
  uploadedFileBytes: Map<string, Buffer>;
  selectedOptions: Map<string, string>;
  guardInstallCount: number;
  intermediateMutationsAuthorized: boolean;
  guardAuthorizationHistory: boolean[];
  networkGuardInstallCount: number;
  waitCount: number;
  controlInspectionCount: number;
  actionInspectionCount: number;
  bodyInspectionCount: number;
  frameInspectionCount: number;
  guardBlockedAttempts: Array<{
    kind: "dom_submit" | "form_request_submit" | "fetch" | "xhr";
    method: string;
    url: string | null;
    at: string;
  }>;
}

type FakeUploadedFile =
  | string
  | {
      name: string;
      mimeType: string;
      buffer: Buffer;
    };

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
      role: control.role ?? "",
      ariaHidden: control.ariaHidden ?? false,
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
      multiple: control.multiple ?? false,
      options: [...(control.options ?? [])],
      selectedOptionLabel: control.selectedOptionLabel ?? "",
      cssInJsSelectedValueText: control.cssInJsSelectedValueText ?? "",
      cssInJsSelectedCountryCode: control.cssInJsSelectedCountryCode ?? "",
      valueAfterFill: control.valueAfterFill,
      valuesAfterWaits: [...(control.valuesAfterWaits ?? [])],
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
    uploadedFileBytes: new Map(),
    selectedOptions: new Map(),
    guardInstallCount: 0,
    intermediateMutationsAuthorized: false,
    guardAuthorizationHistory: [],
    networkGuardInstallCount: 0,
    waitCount: 0,
    controlInspectionCount: 0,
    actionInspectionCount: 0,
    bodyInspectionCount: 0,
    frameInspectionCount: 0,
    guardBlockedAttempts: [],
  };
  let stepIndex = 0;
  let activeComboboxIndex: number | null = null;
  let currentUrl = "about:blank";
  let targetBaseUrl = "";

  const currentStep = () => steps[Math.min(stepIndex, steps.length - 1)]!;
  const currentApplicationControls = () =>
    currentStep().controls.filter((control) => !control.ariaHidden);

  const guardBlocksAttempt = (attempt: {
    kind: "dom_submit" | "form_request_submit" | "fetch" | "xhr";
  }) =>
    attempt.kind === "dom_submit" ||
    attempt.kind === "form_request_submit" ||
    !state.intermediateMutationsAuthorized;
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
    const attemptedMutation = step.blockedAttemptAfterMutation;
    step.blockedAttemptAfterMutation = null;
    if (attemptedMutation && guardBlocksAttempt(attemptedMutation)) {
      state.guardBlockedAttempts.push({
        ...attemptedMutation,
        url: currentUrl,
        at: new Date().toISOString(),
      });
    }
  };

  const createControlLocator = (index: number) => ({
    evaluate: (callback: (element: Element) => unknown) => {
      const control = currentApplicationControls()[index];
      if (!control) {
        throw new Error(`Missing fake form control ${index}.`);
      }

      const flagElement = {
        getAttribute: (name: string) =>
          name === "class" && control.cssInJsSelectedCountryCode
            ? `iti__flag iti__${control.cssInJsSelectedCountryCode}`
            : null,
      };
      const selectedValueElement = {
        textContent: control.cssInJsSelectedValueText,
        getAttribute: (name: string) =>
          name === "class" && control.cssInJsSelectedValueText
            ? "select__single-value remix-css-1dimb5e-singleValue"
            : null,
        querySelector: () => null,
        querySelectorAll: (selector: string) =>
          selector === "[class]" && control.cssInJsSelectedCountryCode
            ? [flagElement]
            : [],
      };
      const controlRoot = {
        getAttribute: () => null,
        getClientRects: () => [{}],
        querySelector: () =>
          control.cssInJsSelectedValueText ? selectedValueElement : null,
        querySelectorAll: (selector: string) =>
          selector === "[class*='iti__']" && control.cssInJsSelectedCountryCode
            ? [flagElement]
            : [],
      };
      const element = {
        closest: () => (control.cssInJsSelectedValueText ? controlRoot : null),
        parentElement: null,
      };
      return Promise.resolve(callback(element as unknown as Element));
    },
    blur: () => Promise.resolve(),
    click: () => {
      activeComboboxIndex = index;
      return Promise.resolve();
    },
    fill: (value: string) => {
      const control = currentApplicationControls()[index];
      if (!control) {
        throw new Error(`Missing fake form control ${index}.`);
      }
      control.value = control.valueAfterFill ?? value;
      state.filledValues.set(control.label, value);
      applyMutationEffects(control);
      return Promise.resolve();
    },
    setInputFiles: (file: FakeUploadedFile) => {
      const control = currentApplicationControls()[index];
      if (!control) {
        throw new Error(`Missing fake file control ${index}.`);
      }
      const displayedFileName = typeof file === "string" ? file : file.name;
      control.value = displayedFileName;
      state.uploadedFiles.set(control.label, displayedFileName);
      if (typeof file !== "string") {
        state.uploadedFileBytes.set(control.label, file.buffer);
      }
      applyMutationEffects(control);
      return Promise.resolve();
    },
    selectOption: (option: { label: string }) => {
      const control = currentApplicationControls()[index];
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

  const getActiveComboboxControl = () =>
    activeComboboxIndex === null
      ? null
      : (currentApplicationControls()[activeComboboxIndex] ?? null);

  const createComboboxOptionLocator = (index: number) => ({
    click: () => {
      const control = getActiveComboboxControl();
      const option = control?.options[index];
      if (!control || !option) {
        throw new Error(`Missing fake combobox option ${index}.`);
      }
      control.selectedOptionLabel = option;
      control.value = "";
      state.selectedOptions.set(control.label, option);
      activeComboboxIndex = null;
      applyMutationEffects(control);
      return Promise.resolve();
    },
  });

  const inspectComboboxOptions = () => {
    const control = getActiveComboboxControl();
    return (control?.options ?? []).map((label, index) => ({
      index,
      label,
      visible: true,
    }));
  };

  const clickAction = (action: FakeActionControl) => {
    if (!currentStep().actions.includes(action)) {
      throw new Error("Fake action detached before click.");
    }
    if (!action) {
      throw new Error("Missing fake action control.");
    }
    state.clickedLabels.push(action.label);
    const step = currentStep();
    const attemptedMutation = step.blockedAttemptAfterAction;
    step.blockedAttemptAfterAction = null;
    if (attemptedMutation && guardBlocksAttempt(attemptedMutation)) {
      state.guardBlockedAttempts.push({
        ...attemptedMutation,
        url: currentUrl,
        at: new Date().toISOString(),
      });
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
    waitForTimeout: vi.fn().mockImplementation(() => {
      state.waitCount += 1;
      for (const control of currentStep().controls) {
        const nextValue = control.valuesAfterWaits.shift();
        if (nextValue !== undefined) {
          control.value = nextValue;
        }
      }
      return Promise.resolve(undefined);
    }),
    route: vi.fn().mockImplementation(() => {
      state.networkGuardInstallCount += 1;
      return Promise.resolve(undefined);
    }),
    evaluate: vi.fn((callback: { name?: string }, argument?: unknown) => {
      if (callback.name === "installPrepareOnlyMutationGuardInPage") {
        state.guardInstallCount += 1;
        state.intermediateMutationsAuthorized = argument === true;
        state.guardAuthorizationHistory.push(
          state.intermediateMutationsAuthorized,
        );
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
          innerText: () => {
            state.bodyInspectionCount += 1;
            return Promise.resolve(currentStep().bodyText);
          },
        };
      }
      if (selector === "iframe") {
        return {
          evaluateAll: () => {
            state.frameInspectionCount += 1;
            return Promise.resolve(currentStep().frameHints);
          },
        };
      }
      if (selector.includes("[role='option']")) {
        return {
          evaluateAll: () => Promise.resolve(inspectComboboxOptions()),
          nth: (index: number) => createComboboxOptionLocator(index),
        };
      }
      if (selector.includes("contenteditable")) {
        return {
          evaluateAll: () => {
            state.controlInspectionCount += 1;
            return Promise.resolve(
              currentApplicationControls().map((control, index) => ({
                ...control,
                index,
              })),
            );
          },
          first: () => ({
            waitFor: () => Promise.resolve(undefined),
          }),
          nth: (index: number) => createControlLocator(index),
        };
      }
      if (selector.includes("a[role='button']")) {
        return {
          evaluateAll: () => {
            state.actionInspectionCount += 1;
            return Promise.resolve(currentStep().actions);
          },
          nth: (index: number) => createActionLocator(index),
        };
      }
      throw new Error(`Unexpected fake locator selector: ${selector}`);
    },
  };

  return { page, state };
}

function createTestJob() {
  return SavedJobSchema.parse({
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

function createTestProfile(): CandidateProfile {
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
  accountCreationAuthorized?: boolean;
  submitAuthorized?: boolean;
  intermediateMutationsAuthorized?: boolean;
  applicationUrl?: string | null;
  profile?: ReturnType<typeof createTestProfile>;
  resumeSource?: "original_upload" | "tailored_export";
  resumeFileName?: string;
  applicationAttachment?: Omit<
    ApplicationAttachmentArtifact,
    "loadVerifiedBytes"
  > & {
    contents: string;
  };
  applicationAttachmentLoadVerifiedBytes?: () => Promise<Uint8Array>;
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
    const applicationAttachment = input.applicationAttachment ?? null;
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
        source: input.resumeSource ?? ("tailored_export" as const),
        sourceDocumentId: null,
        exportArtifactId: "resume_export_prepare_runtime",
        fileName: input.resumeFileName ?? "resume.pdf",
        filePath: resumeFilePath,
        approvedAt: "2026-03-20T10:00:00.000Z",
      },
      profile: input.profile ?? createTestProfile(),
      ...(applicationAttachment
        ? {
            applicationAttachments: [
              {
                assetId: applicationAttachment.assetId,
                questionId: applicationAttachment.questionId,
                prompt: applicationAttachment.prompt,
                questionKind: applicationAttachment.questionKind,
                fileName: applicationAttachment.fileName,
                mime: applicationAttachment.mime,
                sha256: applicationAttachment.sha256,
                loadVerifiedBytes:
                  input.applicationAttachmentLoadVerifiedBytes ??
                  (() =>
                    Promise.resolve(
                      Buffer.from(applicationAttachment.contents, "utf8"),
                    )),
              },
            ],
          }
        : {}),
      settings: createTestSettings(),
      mode: input.mode ?? ("prepare_only" as const),
      ...(input.accountCreationAuthorized !== undefined
        ? { accountCreationAuthorized: input.accountCreationAuthorized }
        : {}),
      ...(input.intermediateMutationsAuthorized !== undefined
        ? {
            intermediateMutationsAuthorized:
              input.intermediateMutationsAuthorized,
          }
        : {}),
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
    expect(state.uploadedFiles.get("Resume / CV")).toBe("resume.pdf");
    expect(state.clickedLabels).toEqual([
      "Next",
      "Continue",
      "Review application",
    ]);
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.state).toBe("paused");
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(result.externalWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "profile_field",
          fieldLabel: "First name",
          verified: true,
        }),
        expect.objectContaining({
          category: "resume_attachment",
          fieldLabel: "Resume / CV",
          verified: true,
        }),
      ]),
    );
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
    expect(JSON.stringify(result)).not.toContain(resumeFilePath);
    expect(result.replay.lastUrl).toContain("?step=3");
    expect(result.replay.checkpointUrls).toContain(
      "https://apply.example.com/jobs/job_prepare_runtime",
    );
    expect(state.guardInstallCount).toBeGreaterThan(0);
    expect(state.networkGuardInstallCount).toBe(1);
  }, 10_000);

  test("uploads one exact user-approved supporting asset and still stops before final submit", async () => {
    const verifiedBytes = Buffer.from(
      "%PDF-1.7\nverified portfolio\n%%EOF",
      "utf8",
    );
    const loadVerifiedBytes = vi.fn(() => Promise.resolve(verifiedBytes));
    const { result, state, resumeFilePath } = await runApplicationScenario({
      submitAuthorized: false,
      applicationAttachmentLoadVerifiedBytes: loadVerifiedBytes,
      applicationAttachment: {
        assetId: "asset-portfolio",
        questionId: "persisted-question-portfolio",
        prompt: "Portfolio upload",
        questionKind: "portfolio",
        fileName: "portfolio.pdf",
        mime: "application/pdf",
        sha256: "a".repeat(64),
        contents: "%PDF-1.7\nportfolio\n%%EOF",
      },
      steps: [
        {
          controls: [
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
              visible: false,
            },
            {
              label: "Portfolio upload",
              name: "candidate[portfolio]",
              inputType: "file",
              required: true,
            },
          ],
          actions: [{ label: "Review application" }],
        },
        {
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.uploadedFiles.get("Resume / CV")).toBe("resume.pdf");
    expect(state.uploadedFiles.get("Portfolio upload")).toBe("portfolio.pdf");
    expect(state.uploadedFileBytes.get("Portfolio upload")).toEqual(
      verifiedBytes,
    );
    expect(loadVerifiedBytes).toHaveBeenCalledTimes(1);
    expect(state.clickedLabels).toEqual(["Review application"]);
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.state).toBe("paused");
    expect(result.externalWrites).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "application_answer",
          fieldLabel: "Portfolio upload",
          verified: true,
        }),
      ]),
    );
    expect(result.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prompt: "Resume / CV",
          kind: "resume",
          answerControlType: "file",
          status: "answered",
          submittedAnswer: "resume.pdf",
          suggestedAnswers: [
            expect.objectContaining({
              text: "resume.pdf",
              provenance: [
                expect.objectContaining({ snippet: "resume.pdf" }),
              ],
            }),
          ],
        }),
        expect.objectContaining({
          prompt: "Portfolio upload",
          kind: "portfolio",
          answerControlType: "file",
          status: "answered",
          submittedAnswer: "portfolio.pdf",
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain(resumeFilePath);
    expect(JSON.stringify(result)).not.toContain("unemployed-prepare-runtime");
    expect(result.submittedAt).toBeNull();
  }, 10_000);

  test.each(["removed", "tampered"] as const)(
    "revalidates a supporting asset immediately before upload and refuses %s bytes",
    async (failure) => {
      const loadVerifiedBytes = vi.fn(() =>
        Promise.reject(
          new Error(
            failure === "removed"
              ? "The selected candidate asset is no longer available."
              : "The selected candidate asset failed integrity verification.",
          ),
        ),
      );
      const { result, state } = await runApplicationScenario({
        submitAuthorized: false,
        applicationAttachmentLoadVerifiedBytes: loadVerifiedBytes,
        applicationAttachment: {
          assetId: "asset-portfolio",
          questionId: "persisted-question-portfolio",
          prompt: "Portfolio upload",
          questionKind: "portfolio",
          fileName: "portfolio.pdf",
          mime: "application/pdf",
          sha256: "a".repeat(64),
          contents: "%PDF-1.7\nstale portfolio\n%%EOF",
        },
        steps: [
          {
            controls: [
              {
                label: "Resume / CV",
                name: "candidate[resume]",
                inputType: "file",
                required: true,
                visible: false,
              },
              {
                label: "Portfolio upload",
                name: "candidate[portfolio]",
                inputType: "file",
                required: true,
              },
            ],
            actions: [{ label: "Submit application", type: "submit" }],
          },
        ],
      });

      expect(loadVerifiedBytes).toHaveBeenCalledTimes(1);
      expect(state.uploadedFiles.has("Portfolio upload")).toBe(false);
      expect(state.clickedLabels).not.toContain("Submit application");
      expect(result.state).toBe("paused");
      expect(result.submittedAt).toBeNull();
      expect(result.externalWrites).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ fieldLabel: "Portfolio upload" }),
        ]),
      );
    },
    10_000,
  );

  test("keeps full page scans constant when a form has many unsupported controls", async () => {
    const unsupportedControls = Array.from({ length: 30 }, (_, index) => ({
      label: `Optional custom field ${index + 1}`,
      name: `custom[${index}]`,
    }));
    const { result, state } = await runApplicationScenario({
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
            ...unsupportedControls,
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
              visible: false,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(result.state).toBe("paused");
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(state.bodyInspectionCount).toBe(2);
    expect(state.actionInspectionCount).toBe(2);
    expect(state.frameInspectionCount).toBe(2);
    expect(state.controlInspectionCount).toBeLessThan(10);
  });
  test.each(["Apply", "Apply now"])(
    "does not treat a listing-level %s control as proven navigation",
    async (label) => {
      const { result, state } = await runApplicationScenario({
        submitAuthorized: false,
        steps: [
          {
            bodyText: "Senior software engineer job listing",
            actions: [{ label }],
          },
        ],
      });

      expect(state.clickedLabels).toEqual([]);
      expect(result.summary).toBe(
        "Application preparation needs manual navigation",
      );
      expect(result.blocker?.code).toBe("requires_manual_review");
      expect(result.submittedAt).toBeNull();
    },
  );

  test("never clicks a button-typed Apply control when an application form is already visible", async () => {
    const { result, state } = await runApplicationScenario({
      submitAuthorized: false,
      steps: [
        {
          controls: [
            {
              label: "First name",
              autocomplete: "given-name",
              required: true,
            },
            {
              label: "Resume / CV",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Complete your application",
          actions: [{ label: "Apply", type: "button" }],
        },
      ],
    });

    expect(state.clickedLabels).not.toContain("Apply");
    expect(result.summary).toBe(
      "Application prepared at the final pre-submit checkpoint",
    );
    expect(result.checkpoints.at(-1)?.label).toBe("Paused before final submit");
    expect(result.submittedAt).toBeNull();
  });

  test("reuses a confirmed preferred LinkedIn link and removes a separately selected phone calling code", async () => {
    const profile = createTestProfile();
    profile.linkedinUrl = null;
    profile.currentCountry = "Kosovo";
    profile.phone = "(+383) 44 283 970";
    profile.applicationIdentity.preferredPhone = "(+383) 44 283 970";
    profile.links = [
      {
        id: "link_linkedin_confirmed",
        label: "LinkedIn",
        url: "https://www.linkedin.com/in/alex-vanguard",
        kind: "linkedin",
        isDraft: false,
      },
    ];
    profile.applicationIdentity.preferredLinkIds = ["link_linkedin_confirmed"];

    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      resumeSource: "original_upload",
      resumeFileName: "Ebrar.pdf",
      steps: [
        {
          controls: [
            {
              label: "Country",
              groupLabel: "Phone",
              name: "candidate[phone_country]",
              tagName: "select",
              value: "",
              selectedOptionLabel: "",
              options: ["Kosovo (+383)"],
            },
            {
              label: "Phone",
              name: "candidate[phone]",
              inputType: "tel",
              valueAfterFill: "(+383) 44 283 970",
            },
            {
              label: "LinkedIn Profile",
              name: "candidate[linkedin]",
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.filledValues.get("Phone")).toBe("44 283 970");
    expect(state.selectedOptions.get("Country")).toBe("Kosovo (+383)");
    expect(state.filledValues.get("LinkedIn Profile")).toBe(
      "https://www.linkedin.com/in/alex-vanguard",
    );
    expect(state.uploadedFiles.has("Resume / CV")).toBe(true);
    expect(state.uploadedFiles.get("Resume / CV")).toBe("Ebrar.pdf");
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(result.submittedAt).toBeNull();
    expect(result.consentDecisions).toContainEqual(
      expect.objectContaining({
        kind: "resume_use",
        label: "Use the selected original resume for this application",
        detail:
          "The exact original resume selected by the user was attached during prepare-only automation.",
      }),
    );
  });

  test("accepts a phone widget that restores the selected calling code in its formatted value", async () => {
    const profile = createTestProfile();
    profile.currentCountry = "Kosovo";
    profile.phone = "(+383) 44 283 970";
    profile.applicationIdentity.preferredPhone = "(+383) 44 283 970";

    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      steps: [
        {
          controls: [
            {
              label: "Country",
              groupLabel: "Phone",
              name: "candidate[phone_country]",
              tagName: "select",
              value: "+383",
              selectedOptionLabel: "Kosovo (+383)",
              options: ["Kosovo (+383)"],
            },
            {
              label: "Phone",
              name: "candidate[phone]",
              inputType: "tel",
              value: "(+383) 44 283 970",
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.filledValues.has("Phone")).toBe(false);
    expect(state.uploadedFiles.get("Resume / CV")).toBe("resume.pdf");
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(result.submittedAt).toBeNull();
  });
  test("selects a Greenhouse-like phone-country combobox by one explicit profile country and ignores its aria-hidden required shim", async () => {
    const profile = createTestProfile();
    profile.currentLocation = "Portland, Oregon";
    profile.currentCountry = "";
    profile.phone = "+1 555 010 2401";
    profile.applicationIdentity.preferredPhone = "+1 555 010 2401";
    profile.workEligibility.authorizedWorkCountries = ["United States"];
    profile.workEligibility.requiresVisaSponsorship = false;

    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      steps: [
        {
          controls: [
            {
              id: "country",
              label: "Country",
              groupLabel: "Phone",
              role: "combobox",
              value: "+1 555 010 2401",
              options: ["Canada+1", "United States+1"],
            },
            {
              label: "Phone",
              name: "candidate[phone]",
              inputType: "tel",
              value: "+1 555 010 2401",
            },
            {
              id: "country-required-shim",
              label: "Phone country required shim",
              ariaHidden: true,
              required: true,
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.selectedOptions.get("Country")).toBe("United States+1");
    expect(state.uploadedFiles.get("Resume / CV")).toBe("resume.pdf");
    expect(
      result.questions.some(
        (question) => question.prompt === "Phone country required shim",
      ),
    ).toBe(false);
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(result.submittedAt).toBeNull();
  });

  test("does not choose an ambiguous custom phone-country option from a shared calling code alone", async () => {
    const profile = createTestProfile();
    profile.currentCountry = "";
    profile.phone = "+1 555 010 2401";
    profile.applicationIdentity.preferredPhone = "+1 555 010 2401";
    profile.workEligibility.authorizedWorkCountries = [
      "United States",
      "Canada",
    ];

    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      steps: [
        {
          controls: [
            {
              id: "country",
              label: "Country",
              groupLabel: "Phone",
              role: "combobox",
              value: "+1 555 010 2401",
              options: ["Canada+1", "United States+1"],
            },
            {
              label: "Phone",
              name: "candidate[phone]",
              inputType: "tel",
              value: "+1 555 010 2401",
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.selectedOptions.has("Country")).toBe(false);
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.summary).toBe(
      "Prepared application fields need manual review",
    );
    expect(result.questions).toContainEqual(
      expect.objectContaining({
        prompt: "Phone country code",
        status: "detected",
        submittedAnswer: null,
      }),
    );
    expect(result.submittedAt).toBeNull();
  });

  test("ignores invisible Greenhouse phone shims when the visible phone controls remain correct", async () => {
    const profile = createTestProfile();
    profile.currentLocation = "Portland, Oregon";
    profile.currentCountry = "United States";
    profile.phone = "+1 555 010 2401";
    profile.applicationIdentity.preferredPhone = "+1 555 010 2401";

    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      steps: [
        {
          controls: [
            {
              id: "visible-phone-country",
              label: "Country",
              groupLabel: "Phone",
              role: "combobox",
              selectedOptionLabel: "United States+1",
              options: ["United States+1"],
            },
            {
              id: "visible-phone",
              label: "Phone",
              name: "candidate[phone]",
              inputType: "tel",
              value: "555 010 2401",
            },
            {
              id: "invisible-phone-country-shim",
              label: "Country",
              groupLabel: "Phone",
              role: "combobox",
              visible: false,
              required: true,
            },
            {
              id: "invisible-phone-shim",
              label: "Phone",
              name: "candidate[phone_shim]",
              inputType: "tel",
              visible: false,
              valueAfterFill: "",
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.selectedOptions.has("Country")).toBe(false);
    expect(state.filledValues.has("Country")).toBe(false);
    expect(state.filledValues.has("Phone")).toBe(false);
    expect(state.uploadedFiles.get("Resume / CV")).toBe("resume.pdf");
    const phoneQuestions = result.questions.filter(
      (question) =>
        question.prompt === "Phone country code" || question.prompt === "Phone",
    );
    expect(phoneQuestions).toHaveLength(2);
    expect(phoneQuestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prompt: "Phone country code",
          submittedAnswer: "+1",
          status: "answered",
        }),
        expect.objectContaining({
          prompt: "Phone",
          submittedAnswer: "555 010 2401",
          status: "answered",
        }),
      ]),
    );
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(result.submittedAt).toBeNull();
  });

  test("preserves a compact selected phone country using structured region evidence", async () => {
    const profile = createTestProfile();
    profile.currentLocation = "Portland, Oregon";
    profile.currentCountry = null;
    profile.currentRegion = "Oregon";
    profile.phone = "+1 555 010 2401";
    profile.applicationIdentity.preferredPhone = "+1 555 010 2401";

    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      steps: [
        {
          controls: [
            {
              id: "country",
              label: "Country",
              groupLabel: "Phone",
              role: "combobox",
              required: true,
              selectedOptionLabel: "+1",
              cssInJsSelectedValueText: "+1",
              cssInJsSelectedCountryCode: "us",
            },
            {
              id: "phone",
              label: "Phone",
              groupLabel: "Phone",
              name: "phone",
              inputType: "tel",
              required: true,
              value: "+1 555 010 2401",
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.selectedOptions.has("Country")).toBe(false);
    expect(state.filledValues.has("Country")).toBe(false);
    expect(state.filledValues.has("Phone")).toBe(false);
    expect(state.uploadedFiles.get("Resume / CV")).toBe("resume.pdf");
    expect(result.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prompt: "Phone country code",
          submittedAnswer: "+1",
          status: "answered",
        }),
        expect.objectContaining({
          prompt: "Phone",
          submittedAnswer: "555 010 2401",
          status: "answered",
        }),
      ]),
    );
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(result.submittedAt).toBeNull();
  });

  test("rejects a wrong compact country when the visible composite hides its inner input", async () => {
    const profile = createTestProfile();
    profile.currentLocation = "Portland, Oregon";
    profile.currentCountry = null;
    profile.currentRegion = "Oregon";
    profile.phone = "+1 555 010 2401";
    profile.applicationIdentity.preferredPhone = "+1 555 010 2401";

    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      steps: [
        {
          controls: [
            {
              id: "country",
              label: "Country",
              groupLabel: "Phone",
              role: "combobox",
              required: true,
              visible: false,
              selectedOptionLabel: "+1",
              cssInJsSelectedValueText: "+1",
              cssInJsSelectedCountryCode: "ca",
            },
            {
              id: "phone",
              label: "Phone",
              groupLabel: "Phone",
              name: "phone",
              inputType: "tel",
              required: true,
              value: "+1 555 010 2401",
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.selectedOptions.has("Country")).toBe(false);
    expect(state.filledValues.has("Country")).toBe(false);
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.summary).toBe(
      "Prefilled application values need manual review",
    );
    expect(result.questions).toContainEqual(
      expect.objectContaining({
        prompt: "Phone country code",
        submittedAnswer: null,
        status: "detected",
      }),
    );
    expect(result.submittedAt).toBeNull();
  });

  test("keeps a genuine preferred-phone country conflict at manual review", async () => {
    const profile = createTestProfile();
    profile.currentLocation = "Berlin, Germany";
    profile.currentCountry = "Germany";
    profile.currentRegion = null;
    profile.phone = "+49 555 0000000";
    profile.applicationIdentity.preferredPhone = "+44 7700 900123";

    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      steps: [
        {
          controls: [
            {
              id: "country",
              label: "Country",
              groupLabel: "Phone",
              role: "combobox",
              required: true,
              options: ["Germany+49", "Jersey+44"],
            },
            {
              id: "phone",
              label: "Phone",
              groupLabel: "Phone",
              name: "phone",
              inputType: "tel",
              required: true,
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.selectedOptions.has("Country")).toBe(false);
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.summary).toContain("manual review");
    expect(result.questions).toContainEqual(
      expect.objectContaining({
        prompt: "Phone country code",
        submittedAnswer: null,
        status: "detected",
      }),
    );
    expect(result.submittedAt).toBeNull();
  });

  test("selects a native phone-country option by exact country and shared calling code", async () => {
    const profile = createTestProfile();
    profile.currentCountry = "United States";
    profile.phone = "+1 555 010 2401";
    profile.applicationIdentity.preferredPhone = "+1 555 010 2401";

    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      steps: [
        {
          controls: [
            {
              label: "Country",
              groupLabel: "Phone",
              name: "candidate[phone_country]",
              tagName: "select",
              options: ["Canada (+1)", "United States (+1)"],
            },
            {
              label: "Phone",
              name: "candidate[phone]",
              inputType: "tel",
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.selectedOptions.get("Country")).toBe("United States (+1)");
    expect(state.selectedOptions.get("Country")).not.toBe("Canada (+1)");
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(result.submittedAt).toBeNull();
  });

  test("derives a compact E.164 calling code only from exact country-option evidence", async () => {
    const profile = createTestProfile();
    profile.currentCountry = "Kosovo";
    profile.phone = "+38344283970";
    profile.applicationIdentity.preferredPhone = "+38344283970";

    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      steps: [
        {
          controls: [
            {
              label: "Country",
              groupLabel: "Phone",
              name: "candidate[phone_country]",
              tagName: "select",
              options: ["Kosovo (+383)"],
            },
            {
              label: "Phone",
              name: "candidate[phone]",
              inputType: "tel",
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.selectedOptions.get("Country")).toBe("Kosovo (+383)");
    expect(state.filledValues.get("Phone")).toBe("44283970");
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(result.submittedAt).toBeNull();
  });

  test("preserves a nonempty custom phone-country value without a selected option for manual review", async () => {
    const profile = createTestProfile();
    profile.currentCountry = "United States";
    profile.phone = "+1 555 010 2401";
    profile.applicationIdentity.preferredPhone = "+1 555 010 2401";

    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      steps: [
        {
          controls: [
            {
              label: "Country",
              groupLabel: "Phone",
              role: "combobox",
              value: "Canada +1",
              selectedOptionLabel: "",
              options: ["Canada +1", "United States +1"],
            },
            {
              label: "Phone",
              name: "candidate[phone]",
              inputType: "tel",
              value: "+1 555 010 2401",
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.selectedOptions.has("Country")).toBe(false);
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.summary).toBe(
      "Prefilled application values need manual review",
    );
    expect(result.questions).toContainEqual(
      expect.objectContaining({
        prompt: "Phone country code",
        submittedAnswer: null,
        status: "detected",
      }),
    );
    expect(result.submittedAt).toBeNull();
  });
  test("selects the exact Greenhouse visa answer and grounds the intended work location", async () => {
    const profile = createTestProfile();
    profile.workEligibility.requiresVisaSponsorship = false;

    const visaPrompt =
      "Will you now or at any time in the future require visa sponsorship?";
    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      steps: [
        {
          controls: [
            {
              label: visaPrompt,
              role: "combobox",
              options: ["Yes", "No"],
              required: true,
            },
            {
              label: "From where do you intend to work?",
              required: true,
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.selectedOptions.get(visaPrompt)).toBe("No");
    expect(state.filledValues.get("From where do you intend to work?")).toBe(
      "Budapest, Hungary",
    );
    expect(state.uploadedFiles.get("Resume / CV")).toBe("resume.pdf");
    expect(result.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prompt: visaPrompt,
          submittedAnswer: "No",
          status: "answered",
        }),
        expect.objectContaining({
          prompt: "From where do you intend to work?",
          submittedAnswer: "Budapest, Hungary",
          status: "answered",
        }),
      ]),
    );
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(result.submittedAt).toBeNull();
  });

  test.each([
    {
      label: "ambiguous duplicate exact options",
      options: ["No", "NO", "Yes"],
    },
    {
      label: "no exact option",
      options: ["Not currently", "Yes"],
    },
  ])("pauses on a Greenhouse visa combobox with $label", async (scenario) => {
    const profile = createTestProfile();
    profile.workEligibility.requiresVisaSponsorship = false;

    const visaPrompt =
      "Will you now or at any time in the future require visa sponsorship?";
    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      steps: [
        {
          controls: [
            {
              label: visaPrompt,
              role: "combobox",
              options: scenario.options,
              required: true,
            },
            {
              label: "From where do you intend to work?",
              required: true,
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.selectedOptions.has(visaPrompt)).toBe(false);
    expect(state.filledValues.get("From where do you intend to work?")).toBe(
      "Budapest, Hungary",
    );
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.summary).toBe(
      "Prepared application fields need manual review",
    );
    expect(result.questions).toContainEqual(
      expect.objectContaining({
        prompt: visaPrompt,
        submittedAnswer: null,
        status: "detected",
      }),
    );
    expect(result.submittedAt).toBeNull();
  });

  test("accepts a formatted phone value when a rerender drops the visible phone label", async () => {
    const profile = createTestProfile();
    profile.currentCountry = "Kosovo";
    profile.phone = "(+383) 44 283 970";
    profile.applicationIdentity.preferredPhone = "(+383) 44 283 970";

    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      steps: [
        {
          controls: [
            {
              label: "Country",
              groupLabel: "Phone",
              name: "candidate[phone_country]",
              tagName: "select",
              value: "+383",
              selectedOptionLabel: "Kosovo (+383)",
              options: ["Kosovo (+383)"],
            },
            {
              label: "",
              name: "candidate[contact_number]",
              inputType: "tel",
              autocomplete: "tel",
              value: "(+383) 44 283 970",
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.uploadedFiles.get("Resume / CV")).toBe("resume.pdf");
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(result.submittedAt).toBeNull();
  });

  test("accepts the national phone digits while the calling-code widget is transiently blank", async () => {
    const profile = createTestProfile();
    profile.currentCountry = "Kosovo";
    profile.phone = "(+383) 44 283 970";
    profile.applicationIdentity.preferredPhone = "(+383) 44 283 970";

    const { result } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      steps: [
        {
          controls: [
            {
              label: "Country",
              groupLabel: "Phone",
              name: "candidate[phone_country]",
              tagName: "select",
              options: ["Kosovo (+383)"],
            },
            {
              label: "Phone",
              name: "candidate[phone]",
              inputType: "tel",
              value: "44 283 970",
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(result.submittedAt).toBeNull();
  });

  test("waits through a late controlled-phone rerender before declaring the form ready", async () => {
    const profile = createTestProfile();
    profile.currentCountry = "Kosovo";
    profile.phone = "(+383) 44 283 970";
    profile.applicationIdentity.preferredPhone = "(+383) 44 283 970";

    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      steps: [
        {
          controls: [
            {
              label: "Country",
              groupLabel: "Phone",
              name: "candidate[phone_country]",
              tagName: "select",
              value: "+383",
              selectedOptionLabel: "Kosovo (+383)",
              options: ["Kosovo (+383)"],
            },
            {
              label: "Phone",
              name: "candidate[phone]",
              inputType: "tel",
              valueAfterFill: "",
              valuesAfterWaits: [
                "",
                "",
                "",
                "",
                "",
                "",
                "(+383) 44 283 970",
                "(+383) 44 283 970",
                "(+383) 44 283 970",
              ],
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.waitCount).toBeGreaterThan(5);
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(result.submittedAt).toBeNull();
  });

  test("stops for review when a controlled phone value never persists within the recovery window", async () => {
    const profile = createTestProfile();
    profile.phone = "(+383) 44 283 970";
    profile.applicationIdentity.preferredPhone = "(+383) 44 283 970";

    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
      profile,
      steps: [
        {
          controls: [
            {
              label: "Country",
              groupLabel: "Phone",
              name: "candidate[phone_country]",
              tagName: "select",
              value: "+383",
              selectedOptionLabel: "Kosovo (+383)",
              options: ["Kosovo (+383)"],
            },
            {
              label: "Phone",
              name: "candidate[phone]",
              inputType: "tel",
              valueAfterFill: "",
            },
            {
              label: "Resume / CV",
              name: "candidate[resume]",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.waitCount).toBe(13);
    expect(state.bodyInspectionCount).toBe(2);
    expect(state.actionInspectionCount).toBe(2);
    expect(state.frameInspectionCount).toBe(2);
    expect(state.clickedLabels).not.toContain("Submit application");
    expect(result.summary).toBe(
      "Prepared application fields need manual review",
    );
    expect(result.questions).toContainEqual(
      expect.objectContaining({
        prompt: "Phone",
        kind: "personal_info",
        status: "detected",
      }),
    );
    expect(result.submittedAt).toBeNull();
  });

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
    expect(state.uploadedFiles.has("Resume")).toBe(false);
    expect(state.waitCount).toBe(0);
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
    expect(result.summary).toBe("Resume attachment needs your help");
    expect(result.blocker?.code).toBe("requires_manual_review");
    expect(result.checkpoints.at(-1)?.label).toBe(
      "Paused before the resume could be attached",
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
      "The application page could not safely save a prepared field",
    );
    expect(result.submittedAt).toBeNull();
    expect(result.outcome).toBeNull();
  });

  test("re-arms the network guard before Continue when field writes were authorized", async () => {
    const { result, state } = await runApplicationScenario({
      intermediateMutationsAuthorized: true,
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
            kind: "fetch",
            method: "POST",
          },
        },
      ],
    });

    expect(state.clickedLabels).toEqual(["Continue"]);
    expect(state.guardAuthorizationHistory).toContain(true);
    expect(state.guardAuthorizationHistory.at(-1)).toBe(false);
    expect(state.guardBlockedAttempts).toEqual([
      expect.objectContaining({ kind: "fetch", method: "POST" }),
    ]);
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

  test("fills exact common application signals from the answer bank before eligibility fallbacks", async () => {
    const profile = createTestProfile();
    profile.answerBank = {
      ...profile.answerBank,
      workAuthorization: "Authorized without restriction",
      visaSponsorship: "Saved sponsorship response",
      relocation: "Saved relocation response",
      travel: "Saved travel response",
      noticePeriod: "Saved notice response",
      availability: "Saved availability response",
      salaryExpectations: null,
      selfIntroduction: "Saved self introduction",
      careerTransition: "Saved career transition",
      customAnswers: [
        {
          id: "answer_salary_expectations",
          kind: "salary_expectation",
          label: "Salary expectations",
          question: "What are your salary expectations?",
          answer: "USD 120,000 base",
          roleFamilies: [],
          proofEntryIds: [],
        },
      ],
    };
    profile.workEligibility = {
      ...profile.workEligibility,
      requiresVisaSponsorship: false,
      willingToRelocate: false,
      willingToTravel: false,
      noticePeriodDays: 30,
      availableStartDate: "2026-09-15",
    };

    const { result, state } = await runApplicationScenario({
      profile,
      submitAuthorized: false,
      steps: [
        {
          controls: [
            {
              label: "Are you authorized to work?",
              required: true,
            },
            {
              label: "Will you now or in the future require visa sponsorship?",
              required: true,
            },
            {
              label: "What are your salary expectations?",
              required: true,
            },
            {
              label: "When are you available to start?",
              required: true,
            },
            {
              label:
                "How much notice do you need to give your current employer?",
              required: true,
            },
            {
              label: "Are you willing to relocate?",
              required: true,
            },
            {
              label: "Are you willing to travel?",
              required: true,
            },
            {
              label: "Tell us about yourself",
              tagName: "textarea",
              inputType: "textarea",
              required: true,
            },
            {
              label: "Please explain your career transition",
              tagName: "textarea",
              inputType: "textarea",
              required: true,
            },
            {
              label: "Resume",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.filledValues.get("Are you authorized to work?")).toBe(
      "Authorized without restriction",
    );
    expect(
      state.filledValues.get(
        "Will you now or in the future require visa sponsorship?",
      ),
    ).toBe("Saved sponsorship response");
    expect(state.filledValues.get("What are your salary expectations?")).toBe(
      "USD 120,000 base",
    );
    expect(state.filledValues.get("When are you available to start?")).toBe(
      "Saved availability response",
    );
    expect(
      state.filledValues.get(
        "How much notice do you need to give your current employer?",
      ),
    ).toBe("Saved notice response");
    expect(state.filledValues.get("Are you willing to relocate?")).toBe(
      "Saved relocation response",
    );
    expect(state.filledValues.get("Are you willing to travel?")).toBe(
      "Saved travel response",
    );
    expect(state.filledValues.get("Tell us about yourself")).toBe(
      "Saved self introduction",
    );
    expect(
      state.filledValues.get("Please explain your career transition"),
    ).toBe("Saved career transition");
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(state.clickedLabels).not.toContain("Submit application");
  });

  test("uses only unambiguous work-eligibility fallbacks for exact controls", async () => {
    const profile = createTestProfile();
    profile.workEligibility = {
      ...profile.workEligibility,
      authorizedWorkCountries: ["Hungary", "Germany"],
      requiresVisaSponsorship: false,
      willingToRelocate: true,
      willingToTravel: false,
      noticePeriodDays: 30,
      availableStartDate: "2026-09-15",
    };

    const { result, state } = await runApplicationScenario({
      profile,
      submitAuthorized: false,
      steps: [
        {
          controls: [
            {
              label: "Do you require visa sponsorship?",
              tagName: "select",
              inputType: "select-one",
              options: ["Select", "Yes", "No"],
              value: "Select",
              selectedOptionLabel: "Select",
              required: true,
            },
            {
              label: "Are you willing to relocate?",
              tagName: "select",
              inputType: "select-one",
              options: ["Select", "Yes", "No"],
              value: "Select",
              selectedOptionLabel: "Select",
              required: true,
            },
            {
              label: "Are you willing to travel?",
              tagName: "select",
              inputType: "select-one",
              options: ["Select", "Yes", "No"],
              value: "Select",
              selectedOptionLabel: "Select",
              required: true,
            },
            {
              label: "Notice period",
              required: true,
            },
            {
              label: "Available start date",
              required: true,
            },
            {
              label: "Countries you are authorized to work in",
              required: true,
            },
            {
              label: "Resume",
              inputType: "file",
              required: true,
            },
          ],
          bodyText: "Review your application before submission",
          actions: [{ label: "Submit application", type: "submit" }],
        },
      ],
    });

    expect(state.selectedOptions.get("Do you require visa sponsorship?")).toBe(
      "No",
    );
    expect(state.selectedOptions.get("Are you willing to relocate?")).toBe(
      "Yes",
    );
    expect(state.selectedOptions.get("Are you willing to travel?")).toBe("No");
    expect(state.filledValues.get("Notice period")).toBe("30 days");
    expect(state.filledValues.get("Available start date")).toBe("2026-09-15");
    expect(
      state.filledValues.get("Countries you are authorized to work in"),
    ).toBe("Hungary, Germany");
    expect(result.summary).toContain("final pre-submit checkpoint");
    expect(state.clickedLabels).not.toContain("Submit application");
  });

  test("leaves near-match and unclear native choice questions unanswered", async () => {
    const profile = createTestProfile();
    profile.answerBank = {
      ...profile.answerBank,
      salaryExpectations: "USD 120,000 base",
      careerTransition: "Saved career transition",
    };

    const { result, state } = await runApplicationScenario({
      profile,
      submitAuthorized: false,
      steps: [
        {
          controls: [
            {
              label: "Salary expectations",
              tagName: "select",
              inputType: "select-one",
              options: ["Select", "Below range", "Above range"],
              value: "Select",
              selectedOptionLabel: "Select",
              required: true,
            },
            {
              label: "Tell us about a project that changed direction",
              tagName: "textarea",
              inputType: "textarea",
              required: true,
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

    expect(state.selectedOptions.has("Salary expectations")).toBe(false);
    expect(
      state.filledValues.has("Tell us about a project that changed direction"),
    ).toBe(false);
    expect(state.clickedLabels).toEqual([]);
    expect(result.blocker?.code).toBe("missing_candidate_answer");
    expect(result.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prompt: "Salary expectations",
          submittedAnswer: null,
        }),
        expect.objectContaining({
          prompt: "Tell us about a project that changed direction",
          submittedAnswer: null,
        }),
      ]),
    );
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
      label: "account creation",
      step: {
        bodyText: "Create an account to continue your application",
        actions: [{ label: "Create account" }],
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
      accountCreationAuthorized: false,
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
