import { type CSSProperties, useEffect, useRef, useState } from "react";
import type {
  DesktopWindowControlsState,
  InterviewExportResult,
  InterviewHotkeyAction,
  JobFinderInterviewFollowUpInput,
  InterviewOverlaySnapshot,
  SaveInterviewSetupInput,
  InterviewTranscriptSource,
  InterviewWorkspaceSnapshot,
} from "@unemployed/contracts";
import { suiteModules } from "@unemployed/contracts";
import {
  Archive,
  Camera,
  CheckCircle2,
  Clock,
  FileDown,
  ListChecks,
  Minus,
  PanelTop,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Send,
  Settings2,
  Shield,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/cn";
import { AnswerCueOverlay, TranscriptOverlay } from "./interview-overlays";
import { TranscriptAnnotationPanel } from "./interview-review-annotations";
import { InterviewCaptionFileWatcher } from "./interview-caption-file-watcher";
import { InterviewDiagnosticsPanel } from "./interview-diagnostics-panel";
import { InterviewMediaStreamProbes } from "./interview-media-stream-probes";
import { InterviewNativeCaptionWatcher } from "./interview-native-caption-watcher";
import { InterviewSessionPreferences } from "./interview-session-preferences";

type LoadState =
  | { status: "loading" }
  | {
      status: "ready";
      workspace: InterviewWorkspaceSnapshot;
      exportResult: InterviewExportResult | null;
    }
  | { status: "error"; message: string };

function StatusPill(props: {
  label: string;
  tone?: "success" | "warning" | "critical" | "info";
}) {
  const tone = props.tone ?? "info";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-1 text-[10px] font-bold uppercase tracking-(--tracking-badge)",
        tone === "success" &&
          "border-(--success-border) bg-(--success-surface) text-(--success-text)",
        tone === "warning" &&
          "border-(--warning-border) bg-(--warning-surface) text-(--warning-text)",
        tone === "critical" &&
          "border-critical/35 bg-critical/10 text-critical",
        tone === "info" &&
          "border-(--info-border) bg-(--info-surface) text-(--info-text)",
      )}
    >
      {props.label}
    </span>
  );
}

function Panel(props: {
  children: React.ReactNode;
  className?: string;
  id?: string;
  title: string;
  index?: number;
}) {
  return (
    <section
      className={cn(
        "surface-card-tint relative scroll-mt-32 overflow-hidden rounded-(--radius-panel) border p-4 shadow-[0_18px_70px_rgba(0,0,0,0.22)]",
        props.className,
      )}
      id={props.id}
    >
      <header className="mb-4 flex items-center gap-2">
        {props.index ? (
          <span className="grid size-5 place-items-center rounded-sm bg-white/10 font-mono text-[10px] text-muted-foreground">
            {props.index}
          </span>
        ) : null}
        <h2 className="text-[0.78rem] font-bold uppercase tracking-(--tracking-badge)">
          {props.title}
        </h2>
      </header>
      {props.children}
    </section>
  );
}

function getTargetLabel(workspace: InterviewWorkspaceSnapshot) {
  return workspace.setup.targetContext?.label ?? "General interview";
}

function formatModuleLabel(moduleName: string) {
  return moduleName
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function getInitialInterviewTab(workspace: InterviewWorkspaceSnapshot) {
  if (workspace.activeSession && workspace.activeSession.status !== "ended") {
    return "assist";
  }

  if (workspace.recentSessions.length > 0) {
    return "review";
  }

  return "setup";
}

export function InterviewHelperPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [followUpDraft, setFollowUpDraft] = useState("");
  const [jobFinderWriteBackStatus, setJobFinderWriteBackStatus] = useState<
    string | null
  >(null);
  const [mediaPermissionHint, setMediaPermissionHint] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<
    "setup" | "assist" | "review" | "settings"
  >("setup");
  const [transcriptSource, setTranscriptSource] =
    useState<InterviewTranscriptSource>("meeting_native_transcript");
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [platform, setPlatform] = useState<"darwin" | "linux" | "win32">(
    "win32",
  );
  const [windowControlsState, setWindowControlsState] =
    useState<DesktopWindowControlsState>({
      isClosable: true,
      isMaximized: false,
      isMinimizable: true,
    });
  const appliedTargetContextKeyRef = useRef<string | null>(null);
  const dragRegionStyle = { WebkitAppRegion: "drag" } as CSSProperties;
  const noDragRegionStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;
  const isMac = platform === "darwin";

  async function loadWorkspace() {
    try {
      const workspace = await window.unemployed.interviewHelper.getWorkspace();
      setActiveTab(getInitialInterviewTab(workspace));
      setState({ status: "ready", workspace, exportResult: null });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Interview Helper failed to load.",
      });
    }
  }

  useEffect(() => {
    void loadWorkspace();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = window.unemployed.window.onControlsStateChange(
      (controlsState) => {
        if (!cancelled) {
          setWindowControlsState(controlsState);
        }
      },
    );

    void Promise.all([
      window.unemployed.ping(),
      window.unemployed.window.getControlsState(),
    ])
      .then(([platformResponse, controlsState]) => {
        if (!cancelled) {
          setPlatform(platformResponse.platform);
          setWindowControlsState(controlsState);
        }
      })
      .catch(() => {
        // Keep the default Windows-like controls state when the bridge is unavailable.
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  async function runWindowAction(
    action: () => Promise<DesktopWindowControlsState>,
  ): Promise<void> {
    try {
      const nextControlsState = await action();
      setWindowControlsState(nextControlsState);
    } catch {
      // Keep current controls state if the desktop action fails.
    }
  }

  function minimizeWindow() {
    void runWindowAction(() => window.unemployed.window.minimize());
  }

  function toggleWindowExpand() {
    void runWindowAction(() => window.unemployed.window.toggleMaximize());
  }

  function closeWindow() {
    void window.unemployed.window.close();
  }

  async function updateWorkspace(
    actionId: string,
    action: () => Promise<InterviewWorkspaceSnapshot>,
  ) {
    setPendingAction(actionId);
    try {
      const workspace = await action();
      setState((current) => ({
        status: "ready",
        workspace,
        exportResult: current.status === "ready" ? current.exportResult : null,
      }));
    } finally {
      setPendingAction(null);
    }
  }

  async function perform(action: InterviewHotkeyAction) {
    await updateWorkspace(action, () =>
      window.unemployed.interviewHelper.performAction(action),
    );
  }

  function saveSetupPreference(input: SaveInterviewSetupInput) {
    void updateWorkspace("setup_preferences", () =>
      window.unemployed.interviewHelper.saveSetup(input),
    );
  }

  async function verifyOverlayProtection() {
    await updateWorkspace("verify_overlay_protection", () =>
      window.unemployed.interviewHelper.verifyOverlayProtection(),
    );
  }

  async function resetOverlayLayout() {
    await updateWorkspace("reset_overlay_layout", () =>
      window.unemployed.interviewHelper.resetOverlayPreferences(),
    );
  }

  async function toggleReconfiguration() {
    if (
      state.status === "ready" &&
      state.workspace.activeSession?.status === "reconfiguring"
    ) {
      await updateWorkspace("finish_reconfiguration", () =>
        window.unemployed.interviewHelper.finishReconfiguration(),
      );
      return;
    }

    await updateWorkspace("begin_reconfiguration", () =>
      window.unemployed.interviewHelper.beginReconfiguration(),
    );
  }

  useEffect(() => {
    const source = searchParams.get("source");
    const id = searchParams.get("id");
    const label = searchParams.get("label");
    const targetContextKey = searchParams.toString();

    const targetContextKind =
      source === "saved_job"
        ? "saved_job"
        : source === "job_application"
          ? "job_application"
          : null;

    if (
      state.status !== "ready" ||
      state.workspace.activeSession ||
      !targetContextKind ||
      !id ||
      !label ||
      appliedTargetContextKeyRef.current === targetContextKey
    ) {
      return;
    }

    appliedTargetContextKeyRef.current = targetContextKey;
    void window.unemployed.interviewHelper
      .saveSetup({
        targetContext: {
          kind: targetContextKind,
          id,
          label,
          role: searchParams.get("role"),
          company: searchParams.get("company"),
          sourceUrl: searchParams.get("sourceUrl"),
          notes: searchParams.get("notes"),
          savedJob: null,
          profileSnapshot: null,
          confirmedAt: new Date().toISOString(),
        },
      })
      .then((workspace) => {
        setState((current) => ({
          status: "ready",
          workspace,
          exportResult:
            current.status === "ready" ? current.exportResult : null,
        }));
      });
  }, [searchParams, state]);

  async function submitTranscriptSegment() {
    const currentActiveSession =
      state.status === "ready" ? state.workspace.activeSession : null;

    if (!currentActiveSession || transcriptDraft.trim().length === 0) {
      return;
    }

    const text = transcriptDraft.trim();
    setTranscriptDraft("");
    await updateWorkspace("add_transcript_segment", () =>
      window.unemployed.interviewHelper.addTranscriptSegment({
        sessionId: currentActiveSession.id,
        source: transcriptSource,
        text,
        engineKind:
          transcriptSource === "meeting_native_transcript"
            ? "platform_local"
            : "browser_speech",
        language:
          state.status === "ready"
            ? state.workspace.setup.transcriptionLanguage
            : "en-US",
      }),
    );
  }

  if (state.status === "loading") {
    return (
      <main className="grid h-screen place-items-center bg-canvas">
        <p className="text-muted-foreground">Loading Interview Helper...</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="grid h-screen place-items-center bg-canvas">
        <div className="rounded-(--radius-panel) border border-critical/30 bg-critical/10 p-6">
          <p>{state.message}</p>
        </div>
      </main>
    );
  }

  const { workspace } = state;
  const activeSession = workspace.activeSession;
  const isLiveSession = Boolean(
    activeSession && activeSession.status !== "ended",
  );
  const rehearsal = workspace.setup.rehearsal;
  const reviewSession = activeSession
    ? null
    : (workspace.recentSessions[0] ?? null);
  const transcriptSegments = reviewSession?.transcriptSegments ?? [];
  const latestCue = reviewSession?.cueCards.at(-1) ?? null;
  const checks = rehearsal?.checks ?? [];
  const rehearsalReady =
    rehearsal?.status === "passed" || rehearsal?.status === "degraded";
  const systemTranscriptionAvailable = Boolean(
    rehearsal?.meetingAudioEngine.ready &&
      rehearsal.meetingAudioEngine.kind !== "deterministic",
  );
  const hardBlocks = checks.filter(
    (check) => check.required && check.status !== "available",
  );
  const targetLabel = getTargetLabel(workspace);
  const canExport = Boolean(reviewSession);
  const liveOverlaySummaries: Array<{
    label: string;
    overlay: InterviewOverlaySnapshot;
  }> = [
    { label: "Answer cues", overlay: workspace.answerOverlay },
    { label: "Live transcript", overlay: workspace.transcriptOverlay },
  ];
  const overlayInteractionEnabled = liveOverlaySummaries.some(
    ({ overlay }) => overlay.interactionMode,
  );
  const consentAccepted = Boolean(
    workspace.setup.consent.microphoneCapture &&
    workspace.setup.consent.meetingAudioCapture &&
    workspace.setup.consent.screenshotCapture &&
    workspace.setup.consent.modelTransmission &&
    workspace.setup.consent.localRetention &&
    workspace.setup.consent.overlayProtectionNotice &&
    workspace.setup.consent.acceptedAt,
  );
  const readinessBlocked = hardBlocks.length > 0 || !consentAccepted;
  const activeTabDefinitions = [
    { id: "setup", label: "Setup" },
    { id: "assist", label: "Assist" },
    { id: "review", label: "Review" },
    { id: "settings", label: "Settings" },
  ] as const;
  const reviewDisabledButtonClass =
    "disabled:border-border/75 disabled:bg-(--surface-panel-raised) disabled:text-foreground-soft disabled:opacity-90 disabled:saturate-100";
  const reviewDisabledDangerButtonClass =
    "disabled:border-critical/35 disabled:bg-critical/35 disabled:text-critical-foreground disabled:opacity-90 disabled:saturate-100";
  const setupPrimaryAction = !consentAccepted
    ? {
        id: "accept_setup",
        label: "Allow and continue",
        detail:
          "Accept microphone, transcript, model, retention, screenshot, and overlay protection notices.",
      }
    : !rehearsalReady
      ? {
          id: "rehearsal",
          label: "Run quick check",
          detail:
            "Check microphone, transcript, cues, overlays, and safety hotkeys before the interview.",
        }
      : {
          id: "start",
          label: "Start interview",
          detail:
            "Open the answer and transcript overlays and begin listening for interview context.",
        };

  async function requestMicrophoneAccessForSetup() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaPermissionHint("Microphone access is unavailable in this window.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      for (const track of stream.getTracks()) {
        track.stop();
      }
      setMediaPermissionHint("Microphone access is ready.");
    } catch (error) {
      setMediaPermissionHint(
        error instanceof Error
          ? `Microphone access needs attention: ${error.message}`
          : "Microphone access needs attention.",
      );
    }
  }

  async function acceptSetup() {
    await requestMicrophoneAccessForSetup();
    await updateWorkspace("accept_setup", () =>
      window.unemployed.interviewHelper.saveSetup({
        consent: {
          microphoneCapture: true,
          meetingAudioCapture: true,
          screenshotCapture: true,
          modelTransmission: true,
          localRetention: true,
          overlayProtectionNotice: true,
          acceptedAt: new Date().toISOString(),
        },
      }),
    );
  }

  async function runQuickCheck() {
    await updateWorkspace("rehearsal", () =>
      window.unemployed.interviewHelper.runRehearsal(),
    );
  }

  async function startInterview() {
    await updateWorkspace("start", () =>
      window.unemployed.interviewHelper.startSession(),
    );
    setActiveTab("assist");
  }

  async function runSetupPrimaryAction() {
    if (!consentAccepted) {
      await acceptSetup();
      return;
    }

    if (!rehearsalReady) {
      await runQuickCheck();
      return;
    }

    await startInterview();
  }

  async function exportLatest(format: "markdown" | "json") {
    if (!reviewSession) return;

    setPendingAction(`export_${format}`);
    try {
      const exportResult =
        await window.unemployed.interviewHelper.exportSession(
          reviewSession.id,
          format,
        );
      setState({ status: "ready", workspace, exportResult });
    } finally {
      setPendingAction(null);
    }
  }

  async function recordJobFinderFollowUp(
    action: JobFinderInterviewFollowUpInput["action"],
  ) {
    if (
      !reviewSession ||
      reviewSession.targetContext.kind !== "job_application"
    ) {
      return;
    }

    const note = followUpDraft.trim();
    const input: JobFinderInterviewFollowUpInput = {
      applicationRecordId: reviewSession.targetContext.id,
      sessionId: reviewSession.id,
      action,
      ...(note.length > 0 ? { note } : {}),
    };

    setPendingAction(action);
    setJobFinderWriteBackStatus(null);
    try {
      await window.unemployed.interviewHelper.recordJobFinderFollowUp(input);
      setJobFinderWriteBackStatus(
        action === "mark_interviewed"
          ? "Job Finder application marked interviewed."
          : "Job Finder follow-up note added.",
      );
      if (action === "add_follow_up_note") {
        setFollowUpDraft("");
      }
    } catch (error) {
      setJobFinderWriteBackStatus(
        error instanceof Error
          ? error.message
          : "Job Finder follow-up update failed.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div
      className={cn(
        "h-screen overflow-hidden bg-canvas text-foreground",
        `platform-${platform}`,
      )}
    >
      <header
        className="fixed inset-x-0 top-0 z-50 border-b border-border/15 bg-(--shell-header-bg) backdrop-blur-sm"
        style={dragRegionStyle}
      >
        <div className="job-finder-shell-grid grid grid-rows-[2.5rem_4rem] items-stretch pl-2 pr-0 sm:pl-3 sm:pr-0">
          <div
            className="row-span-2 flex min-w-0 items-center pl-2 sm:pl-3"
            style={dragRegionStyle}
          >
            <div className="flex min-w-0 flex-col">
              <Link
                className="font-display text-[2.35rem] font-black leading-none tracking-[-0.08em] text-(var(--headline-primary)) sm:text-[2.7rem]"
                style={noDragRegionStyle}
                to="/job-finder/profile"
              >
                UNEMPLOYED
              </Link>
              <span className="text-[0.72rem] uppercase tracking-(var(--tracking-caps)) text-muted-foreground sm:text-(length:var(--text-tiny))">
                Interview Helper
              </span>
            </div>
          </div>

          <div
            className="col-start-2 row-start-1 flex items-center justify-center"
            style={dragRegionStyle}
          >
            <div
              className="flex items-center gap-6"
              role="list"
              style={noDragRegionStyle}
            >
              {suiteModules.map((moduleName, index) => (
                <div
                  key={moduleName}
                  className="flex items-center gap-6"
                  role="listitem"
                >
                  {index > 0 ? (
                    <span
                      aria-hidden="true"
                      className="h-4 w-px bg-border/50"
                    />
                  ) : null}
                  <button
                    aria-current={
                      moduleName === "interview-helper" ? "page" : undefined
                    }
                    className={cn(
                      "h-auto rounded-none border-0 bg-transparent px-0 py-0 text-[14px] font-semibold tracking-(--tracking-badge) shadow-none sm:text-[15px]",
                      moduleName === "job-finder"
                        ? "cursor-pointer text-muted-foreground hover:text-foreground"
                        : "text-(--text-headline)",
                    )}
                    onClick={() => {
                      if (moduleName === "job-finder") {
                        void navigate("/job-finder/profile");
                      }
                    }}
                    type="button"
                  >
                    {formatModuleLabel(moduleName)}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div
            className="col-start-3 row-start-1 flex h-full items-start justify-end self-start"
            style={dragRegionStyle}
          >
            {!isMac ? (
              <div
                className="flex h-full items-stretch gap-0"
                role="group"
                aria-label="Window controls"
                style={noDragRegionStyle}
              >
                <Button
                  aria-label="Minimize window"
                  className="h-full w-11 rounded-none border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-(--surface-panel-raised) hover:text-foreground"
                  disabled={!windowControlsState.isMinimizable}
                  onClick={minimizeWindow}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <Minus className="size-3.5" />
                </Button>
                <Button
                  aria-label={
                    windowControlsState.isMaximized
                      ? "Restore window"
                      : "Maximize window"
                  }
                  className="h-full w-11 rounded-none border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-(--surface-panel-raised) hover:text-foreground"
                  onClick={toggleWindowExpand}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <Square className="size-3.5" />
                </Button>
                <Button
                  aria-label="Close window"
                  className="h-full w-12 rounded-none border-0 bg-transparent p-0 text-muted-foreground shadow-none hover:bg-(--button-close-hover) hover:text-primary-foreground"
                  disabled={!windowControlsState.isClosable}
                  onClick={closeWindow}
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : null}
          </div>

          <nav
            aria-label="Interview Helper sections"
            className="col-start-2 row-start-2 hidden min-w-0 items-center justify-center lg:flex"
            style={noDragRegionStyle}
          >
            <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-(--surface-panel-border) bg-(--surface-panel) p-1">
              {activeTabDefinitions.map((tab, index) => (
                <span className="contents" key={tab.id}>
                  {tab.id === "settings" && index > 0 ? (
                    <span
                      aria-hidden="true"
                      className="mx-1 h-4 w-px bg-border/50"
                    />
                  ) : null}
                  <button
                    aria-current={activeTab === tab.id ? "page" : undefined}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[0.76rem] font-medium text-muted-foreground transition-colors hover:text-foreground xl:px-4 xl:text-(length:--text-small)",
                      activeTab === tab.id ? "bg-secondary text-foreground" : "",
                    )}
                    onClick={() => setActiveTab(tab.id)}
                    type="button"
                  >
                    {tab.id === "settings" ? (
                      <Settings2 className="size-4" />
                    ) : null}
                    <span>{tab.label}</span>
                  </button>
                </span>
              ))}
            </div>
          </nav>

          <div
            aria-hidden="true"
            className="col-start-3 row-start-2 hidden lg:block"
          />
        </div>
      </header>

      <main className="screen-scroll-area mt-[6.75rem] h-[calc(100vh-6.75rem)] scroll-pt-8 overflow-y-auto px-4 pb-8 pt-4 sm:px-6">
        <div className="mx-auto grid max-w-[118rem] gap-4">
          <section
            className="surface-panel-shell relative overflow-hidden rounded-(--radius-panel) border p-4 shadow-[0_24px_90px_rgba(0,0,0,0.2)]"
            id="setup"
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
              <div className="grid min-w-0 gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill
                    label={isLiveSession ? "Live session" : "Setup mode"}
                    tone={isLiveSession ? "success" : "info"}
                  />
                  <StatusPill
                    label={readinessBlocked ? "Needs attention" : "Ready path"}
                    tone={readinessBlocked ? "warning" : "success"}
                  />
                  <span className="text-[0.72rem] uppercase tracking-(--tracking-badge) text-muted-foreground">
                    {targetLabel}
                  </span>
                </div>
                <div className="grid gap-2">
                  <h1 className="text-[clamp(2rem,3.2vw,3.25rem)]">
                    Live interview workspace
                  </h1>
                  <p className="max-w-3xl text-[0.9rem] leading-6 text-muted-foreground">
                    Prepare capture once, run the live assist surface during the
                    interview, then review retained notes after the session.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => setActiveTab("settings")}
                  size="compact"
                  variant="secondary"
                >
                  <Settings2 className="size-4" />
                  Settings
                </Button>
              </div>
            </div>
          </section>

          {activeTab === "setup" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <Panel title="Start interview">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
                  <div className="grid gap-5">
                    <div className="grid gap-2">
                      <p className="text-[1.25rem] font-semibold text-foreground">
                        {setupPrimaryAction.label}
                      </p>
                      <p className="max-w-2xl text-[0.9rem] leading-6 text-muted-foreground">
                        {setupPrimaryAction.detail}
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        void runSetupPrimaryAction();
                      }}
                      disabled={isLiveSession}
                      pending={pendingAction === setupPrimaryAction.id}
                      size="default"
                    >
                      <Play className="size-4" />
                      {setupPrimaryAction.label}
                    </Button>
                    {mediaPermissionHint ? (
                      <p className="text-[0.78rem] leading-5 text-muted-foreground">
                        {mediaPermissionHint}
                      </p>
                    ) : null}
                    <div className="grid gap-3 text-[0.84rem] text-muted-foreground sm:grid-cols-3">
                      <div className="rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
                        <CheckCircle2 className="mb-2 size-4 text-(--success-text)" />
                        <p className="font-semibold text-foreground">
                          1. Allow
                        </p>
                        <p className="mt-1 leading-5">
                          One click accepts the required capture and privacy
                          notices.
                        </p>
                      </div>
                      <div className="rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
                        <Shield className="mb-2 size-4 text-(--info-text)" />
                        <p className="font-semibold text-foreground">
                          2. Quick check
                        </p>
                        <p className="mt-1 leading-5">
                          We check audio, cues, overlays, and the panic-hide
                          shortcut.
                        </p>
                      </div>
                      <div className="rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
                        <Sparkles className="mb-2 size-4 text-(--warning-text)" />
                        <p className="font-semibold text-foreground">
                          3. Start
                        </p>
                        <p className="mt-1 leading-5">
                          Answer cues and live transcript open in separate
                          overlays.
                        </p>
                      </div>
                    </div>
                  </div>
                  <aside className="grid gap-3 rounded-(--radius-small) border border-border-subtle bg-black/20 p-4">
                    <div className="grid gap-1">
                      <span className="text-[10px] uppercase tracking-(--tracking-badge) text-muted-foreground">
                        Interview target
                      </span>
                      <p className="text-[0.92rem] font-semibold text-foreground">
                        {targetLabel}
                      </p>
                    </div>
                    <div className="grid gap-2 border-t border-border-subtle pt-3 text-[0.8rem] text-muted-foreground">
                      <p>
                        Language:{" "}
                        <span className="text-foreground">
                          {workspace.setup.transcriptionLanguage}
                        </span>
                      </p>
                      <p>
                        Cues:{" "}
                        <span className="text-foreground">
                          {workspace.setup.cueSensitivity.replaceAll("_", " ")}
                        </span>
                      </p>
                    </div>
                    <button
                      className="text-left text-[0.78rem] font-semibold text-(--info-text) hover:text-foreground"
                      onClick={() => setActiveTab("settings")}
                      type="button"
                    >
                      Change settings
                    </button>
                  </aside>
                </div>
              </Panel>
              <Panel title="Test audio before starting">
                <InterviewMediaStreamProbes
                  language={workspace.setup.transcriptionLanguage}
                  listening
                  systemTranscriptionAvailable={systemTranscriptionAvailable}
                />
              </Panel>
              <aside className="grid content-start gap-4">
                <Panel title="Need to know">
                  <div className="grid gap-3 text-[0.84rem] leading-5 text-muted-foreground">
                    <p>
                      During the interview, use the small overlay windows. The
                      main app intentionally avoids showing sensitive live
                      transcript and answer text.
                    </p>
                    <div className="rounded-(--radius-small) border border-(--info-border) bg-(--info-surface) p-3 text-(--info-text)">
                      Press <kbd className="rounded-sm border border-(--info-border) px-1.5 py-0.5 font-mono">Alt + I</kbd>{" "}
                      during a session to make overlays clickable and movable.
                    </div>
                  </div>
                </Panel>
              </aside>
            </div>
          ) : null}

          {activeTab === "assist" ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="grid gap-4">
              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <Panel id="session" index={4} title="Live controls">
                  <div className="grid gap-3">
                    <div className="grid justify-items-start gap-2">
                      <p className="font-mono text-[1.55rem]">
                        {activeSession
                          ? new Date(activeSession.startedAt).toLocaleTimeString()
                          : "00:00:00"}
                      </p>
                      <StatusPill
                        label={
                          activeSession?.listening ? "Live" : "Paused"
                        }
                        tone={activeSession?.listening ? "success" : "warning"}
                      />
                      <p className="text-[0.78rem] text-muted-foreground">
                        {activeSession ? activeSession.status : "Session inactive"}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Button
                        onClick={() => {
                          void perform("toggle_listening");
                        }}
                        pending={pendingAction === "toggle_listening"}
                        size="compact"
                        variant="secondary"
                      >
                        <Pause className="size-4" />
                        {activeSession?.listening ? "Pause" : "Resume"}
                      </Button>
                      <Button
                        onClick={() => {
                          void perform("force_cue");
                        }}
                        pending={pendingAction === "force_cue"}
                        size="compact"
                        variant="secondary"
                      >
                        <Sparkles className="size-4" />
                        Force cue
                      </Button>
                      <Button
                        onClick={() => {
                          void perform("capture_screenshot");
                        }}
                        pending={pendingAction === "capture_screenshot"}
                        size="compact"
                        variant="secondary"
                      >
                        <Camera className="size-4" />
                        Screenshot
                      </Button>
                      <Button
                        onClick={() => {
                          void perform("panic_hide");
                        }}
                        pending={pendingAction === "panic_hide"}
                        size="compact"
                        variant="destructive"
                      >
                        <PanelTop className="size-4" />
                        Panic hide
                      </Button>
                      <Button
                        onClick={() => {
                          void perform("toggle_overlay_interaction_mode");
                        }}
                        pending={
                          pendingAction === "toggle_overlay_interaction_mode"
                        }
                        size="compact"
                        variant={overlayInteractionEnabled ? "primary" : "secondary"}
                      >
                        <Settings2 className="size-4" />
                        {overlayInteractionEnabled
                          ? "Finish moving overlays"
                          : "Move or resize overlays"}
                      </Button>
                      <Button
                        onClick={() => {
                          void verifyOverlayProtection();
                        }}
                        pending={pendingAction === "verify_overlay_protection"}
                        size="compact"
                        variant="secondary"
                      >
                        <Shield className="size-4" />
                        Verify protection
                      </Button>
                      <Button
                        onClick={() => {
                          void toggleReconfiguration();
                        }}
                        pending={
                          pendingAction === "begin_reconfiguration" ||
                          pendingAction === "finish_reconfiguration"
                        }
                        size="compact"
                        variant="secondary"
                      >
                        <Settings2 className="size-4" />
                        {activeSession?.status === "reconfiguring"
                          ? "Close config"
                          : "Reconfigure"}
                      </Button>
                      <Button
                        onClick={() => {
                          setDiagnosticsOpen((current) => !current);
                        }}
                        size="compact"
                        variant="secondary"
                      >
                        <ListChecks className="size-4" />
                        Open diagnostics
                      </Button>
                    </div>
                    {activeSession?.status === "reconfiguring" ? (
                      <div className="rounded-(--radius-small) border border-(--info-border) bg-(--info-surface) p-3 text-[0.78rem] leading-5 text-(--info-text)">
                        Listening is paused while setup preferences and
                        rehearsal checks are adjusted.
                      </div>
                    ) : null}
                    <Button
                      onClick={() => {
                        void perform("end_session");
                      }}
                      pending={pendingAction === "end_session"}
                      size="compact"
                      variant="outline"
                    >
                      End session
                    </Button>
                  </div>
                </Panel>

                <Panel index={5} title="Audio and questions">
                  {activeSession ? (
                    <div className="grid gap-3">
                      <InterviewMediaStreamProbes
                        language={workspace.setup.transcriptionLanguage}
                        listening={activeSession.listening}
                        onWorkspaceChange={(nextWorkspace) => {
                          setState((current) => ({
                            status: "ready",
                            workspace: nextWorkspace,
                            exportResult:
                              current.status === "ready"
                                ? current.exportResult
                                : null,
                          }));
                        }}
                        sessionId={activeSession.id}
                        systemTranscriptionAvailable={
                          systemTranscriptionAvailable
                        }
                      />
                      <div className="grid gap-2 rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
                        <p className="text-[0.82rem]">Send a question</p>
                        <textarea
                          className="min-h-24 resize-y rounded-(--radius-small) border border-border-subtle bg-black/30 p-3 text-[0.82rem] leading-5 text-foreground outline-none focus:border-(--info-border)"
                          onChange={(event) => {
                            setTranscriptDraft(event.target.value);
                          }}
                          placeholder="Paste or type the interviewer question here."
                          value={transcriptDraft}
                        />
                        <div className="grid gap-2 sm:grid-cols-[0.62fr_1fr]">
                          <select
                            className="h-9 rounded-(--radius-small) border border-border-subtle bg-black/30 px-2 text-[0.78rem] text-foreground"
                            onChange={(event) => {
                              setTranscriptSource(
                                event.target.value as InterviewTranscriptSource,
                              );
                            }}
                            value={transcriptSource}
                          >
                            <option value="meeting_native_transcript">
                              Interviewer question
                            </option>
                            <option value="meeting_audio">Meeting audio</option>
                            <option value="microphone">My answer</option>
                          </select>
                          <Button
                            disabled={transcriptDraft.trim().length === 0}
                            onClick={() => {
                              void submitTranscriptSegment();
                            }}
                            pending={pendingAction === "add_transcript_segment"}
                            size="compact"
                            variant="secondary"
                          >
                            <Radio className="size-4" />
                            Send question
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-2 rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
                        <p className="text-[0.82rem]">Other transcript sources</p>
                        <InterviewNativeCaptionWatcher
                          language={workspace.setup.transcriptionLanguage}
                          listening={activeSession.listening}
                          onWorkspaceChange={(nextWorkspace) => {
                            setState((current) => ({
                              status: "ready",
                              workspace: nextWorkspace,
                              exportResult:
                                current.status === "ready"
                                  ? current.exportResult
                                  : null,
                            }));
                          }}
                          sessionId={activeSession.id}
                        />
                        <InterviewCaptionFileWatcher
                          language={workspace.setup.transcriptionLanguage}
                          listening={activeSession.listening}
                          onWorkspaceChange={(nextWorkspace) => {
                            setState((current) => ({
                              status: "ready",
                              workspace: nextWorkspace,
                              exportResult:
                                current.status === "ready"
                                  ? current.exportResult
                                  : null,
                            }));
                          }}
                          sessionId={activeSession.id}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-(--radius-small) border border-border-subtle bg-black/20 p-3 text-[0.82rem] text-muted-foreground">
                      Start the interview to use audio and send questions.
                    </div>
                  )}
                </Panel>
              </div>

            </div>

            <aside className="grid content-start gap-4">
              {isLiveSession ? (
                <Panel title="Overlay surfaces">
                  <div className="grid gap-3">
                    {liveOverlaySummaries.map(({ label, overlay }) => (
                      <div
                        className="rounded-(--radius-small) border border-border-subtle bg-black/20 p-3"
                        key={label}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[0.82rem]">{label}</span>
                          <StatusPill
                            label={overlay.visible ? "Visible" : "Hidden"}
                            tone={overlay.visible ? "success" : "warning"}
                          />
                        </div>
                        <p className="mt-2 text-[0.74rem] leading-5 text-muted-foreground">
                          {overlay.protectionState.replaceAll("_", " ")}
                        </p>
                      </div>
                    ))}
                    <Button
                      onClick={() => {
                        void resetOverlayLayout();
                      }}
                      pending={pendingAction === "reset_overlay_layout"}
                      size="compact"
                      variant="secondary"
                    >
                      <RotateCcw className="size-4" />
                      Reset overlay layout
                    </Button>
                  </div>
                </Panel>
              ) : (
                <>
                  <AnswerCueOverlay framed snapshot={workspace.answerOverlay} />
                  <TranscriptOverlay
                    framed
                    snapshot={workspace.transcriptOverlay}
                  />
                </>
              )}
              <Panel title="Session summary">
                <div className="grid gap-3 text-[0.82rem] text-muted-foreground">
                  <p>
                    {isLiveSession
                      ? "Use the answer and transcript overlays during the call. Press Alt + I or use the move button to make them clickable."
                      : "Start a session to use the assist controls."}
                  </p>
                  <div className="flex items-center gap-2">
                    <Clock className="size-4" />
                    <span>
                      {isLiveSession
                        ? `${activeSession?.transcriptSegments.length ?? 0} transcript segments`
                        : `${workspace.recentSessions.length} retained sessions`}
                    </span>
                  </div>
                </div>
              </Panel>
              {diagnosticsOpen ? (
                <Panel title="Diagnostics">
                  <InterviewDiagnosticsPanel
                    diagnostics={
                      activeSession?.diagnostics ??
                      reviewSession?.diagnostics ??
                      []
                    }
                  />
                </Panel>
              ) : null}
            </aside>
          </div>
          ) : null}

          {activeTab === "review" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="grid gap-4">
              <Panel id="review" title="Post-session review">
                {isLiveSession ? (
                  <div className="rounded-(--radius-small) border border-(--info-border) bg-(--info-surface) p-4">
                    <p className="text-[0.88rem] text-(--info-text)">
                      Review opens after the live session ends.
                    </p>
                    <p className="mt-2 text-[0.78rem] leading-5 text-muted-foreground">
                      The main window keeps live cue-card and transcript text
                      out of this surface while capture is active.
                    </p>
                  </div>
                ) : !reviewSession ? (
                  <div className="grid min-h-[18rem] place-items-center rounded-(--radius-small) border border-border-subtle bg-black/20 p-6 text-center">
                    <div className="grid max-w-md gap-3">
                      <Archive className="mx-auto size-7 text-muted-foreground" />
                      <div className="grid gap-2">
                        <h3 className="text-[0.95rem] font-semibold text-foreground">
                          No saved interview session yet
                        </h3>
                        <p className="text-[0.82rem] leading-5 text-muted-foreground">
                          Start and end a session before exporting notes,
                          saving prep, or deleting retained interview data.
                        </p>
                      </div>
                      <Button
                        onClick={() => setActiveTab("setup")}
                        size="compact"
                        variant="secondary"
                      >
                        <ListChecks className="size-4" />
                        Go to setup
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr_0.7fr]">
                    <div className="grid gap-2">
                      <h3 className="text-[0.78rem] uppercase tracking-(--tracking-badge) text-muted-foreground">
                        Transcript
                      </h3>
                      <div className="max-h-64 overflow-y-auto rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
                        {transcriptSegments.map((segment) => (
                          <p
                            className="mb-2 text-[0.82rem] leading-5 text-foreground-soft"
                            key={segment.id}
                          >
                            <span className="text-(--warning-text)">
                              {segment.source.replaceAll("_", " ")}
                            </span>{" "}
                            {segment.text}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <h3 className="text-[0.78rem] uppercase tracking-(--tracking-badge) text-muted-foreground">
                        Latest cue
                      </h3>
                      <div className="rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
                        <p className="text-[0.86rem]">
                          {latestCue?.question ?? "No cue generated."}
                        </p>
                        <p className="mt-2 text-[0.76rem] text-muted-foreground">
                          {reviewSession?.cueCards.length ?? 0} cue cards
                          retained
                        </p>
                      </div>
                      {reviewSession ? (
                        <TranscriptAnnotationPanel
                          onWorkspaceChange={(nextWorkspace) => {
                            setState((current) => ({
                              status: "ready",
                              workspace: nextWorkspace,
                              exportResult:
                                current.status === "ready"
                                  ? current.exportResult
                                  : null,
                            }));
                          }}
                          session={reviewSession}
                        />
                      ) : null}
                    </div>
                    <div className="grid content-start gap-2">
                      <Button
                        className={reviewDisabledButtonClass}
                        disabled={!latestCue || !reviewSession}
                        onClick={() => {
                          if (latestCue && reviewSession) {
                            void updateWorkspace("prep", () =>
                              window.unemployed.interviewHelper.saveCueAsPrepArtifact(
                                {
                                  sessionId: reviewSession.id,
                                  cueCardId: latestCue.id,
                                },
                              ),
                            );
                          }
                        }}
                        pending={pendingAction === "prep"}
                        size="compact"
                        variant="secondary"
                      >
                        <Archive className="size-4" />
                        Save prep
                      </Button>
                      <Button
                        className={reviewDisabledButtonClass}
                        disabled={!canExport}
                        onClick={() => {
                          void exportLatest("markdown");
                        }}
                        pending={pendingAction === "export_markdown"}
                        size="compact"
                        variant="secondary"
                      >
                        <FileDown className="size-4" />
                        Export notes
                      </Button>
                      {reviewSession?.targetContext.kind ===
                      "job_application" ? (
                        <div className="grid gap-2 border-t border-border-subtle pt-2">
                          <Button
                            className={reviewDisabledButtonClass}
                            disabled={!reviewSession}
                            onClick={() => {
                              void recordJobFinderFollowUp("mark_interviewed");
                            }}
                            pending={pendingAction === "mark_interviewed"}
                            size="compact"
                            variant="secondary"
                          >
                            <CheckCircle2 className="size-4" />
                            Mark interviewed
                          </Button>
                          <textarea
                            className="min-h-20 resize-none rounded-(--radius-small) border border-border-subtle bg-black/20 p-2 text-[0.8rem] text-foreground outline-none transition focus:border-primary"
                            onChange={(event) => {
                              setFollowUpDraft(event.target.value);
                            }}
                            placeholder="Follow-up note"
                            value={followUpDraft}
                          />
                          <Button
                            className={reviewDisabledButtonClass}
                            disabled={
                              !reviewSession ||
                              followUpDraft.trim().length === 0
                            }
                            onClick={() => {
                              void recordJobFinderFollowUp(
                                "add_follow_up_note",
                              );
                            }}
                            pending={pendingAction === "add_follow_up_note"}
                            size="compact"
                            variant="secondary"
                          >
                            <Send className="size-4" />
                            Add follow-up
                          </Button>
                          {jobFinderWriteBackStatus ? (
                            <p className="text-[0.72rem] leading-5 text-muted-foreground">
                              {jobFinderWriteBackStatus}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      <Button
                        className={reviewDisabledDangerButtonClass}
                        disabled={!reviewSession}
                        onClick={() => {
                          if (reviewSession) {
                            void updateWorkspace("delete", () =>
                              window.unemployed.interviewHelper.deleteSession(
                                reviewSession.id,
                              ),
                            );
                          }
                        }}
                        pending={pendingAction === "delete"}
                        size="compact"
                        variant="destructive"
                      >
                        <Trash2 className="size-4" />
                        Delete session
                      </Button>
                    </div>
                  </div>
                )}
                {state.exportResult ? (
                  <div className="mt-4 rounded-(--radius-small) border border-(--info-border) bg-(--info-surface) p-3">
                    <p className="text-[0.78rem] text-(--info-text)">
                      {state.exportResult.fileName}
                    </p>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[0.72rem] text-muted-foreground">
                      {state.exportResult.content}
                    </pre>
                  </div>
                ) : null}
              </Panel>
            </div>

            <aside className="grid content-start gap-4">
              {isLiveSession ? (
                <Panel title="Overlay surfaces">
                  <div className="grid gap-3">
                    {liveOverlaySummaries.map(({ label, overlay }) => (
                      <div
                        className="rounded-(--radius-small) border border-border-subtle bg-black/20 p-3"
                        key={label}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[0.82rem]">{label}</span>
                          <StatusPill
                            label={
                              overlay.visible ? "Overlay window" : "Hidden"
                            }
                            tone={overlay.visible ? "success" : "warning"}
                          />
                        </div>
                        <p className="mt-2 text-[0.74rem] leading-5 text-muted-foreground">
                          {overlay.protectionState.replaceAll("_", " ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </Panel>
              ) : (
                <>
                  <AnswerCueOverlay framed snapshot={workspace.answerOverlay} />
                  <TranscriptOverlay
                    framed
                    snapshot={workspace.transcriptOverlay}
                  />
                </>
              )}
              <Panel title="Hotkeys and tray">
                <div className="grid gap-2">
                  {[
                    ["Alt + H", "Panic hide"],
                    ["Alt + Q", "Force cue"],
                    ["Alt + S", "Screenshot"],
                    ["Alt + T", "Transcript overlay"],
                  ].map(([keys, label]) => (
                    <div
                      className="flex items-center justify-between border-b border-border-subtle py-2 last:border-0"
                      key={keys}
                    >
                      <span className="text-[0.82rem]">{label}</span>
                      <kbd className="rounded-sm border border-border-subtle bg-black/30 px-2 py-1 font-mono text-[0.7rem] text-muted-foreground">
                        {keys}
                      </kbd>
                    </div>
                  ))}
                  <Button
                    onClick={() => {
                      void resetOverlayLayout();
                    }}
                    pending={pendingAction === "reset_overlay_layout"}
                    size="compact"
                    variant="secondary"
                  >
                    <RotateCcw className="size-4" />
                    Reset overlay layout
                  </Button>
                </div>
              </Panel>
              <Panel title="Session summary">
                <div className="grid gap-3 text-[0.82rem] text-muted-foreground">
                  <p>
                    {isLiveSession
                      ? "Live summary text is kept out of the main window while capture is active."
                      : (reviewSession?.cueSummary ??
                        "No session summary yet.")}
                  </p>
                  <div className="flex items-center gap-2">
                    <Clock className="size-4" />
                    <span>
                      {isLiveSession
                        ? `${activeSession?.transcriptSegments.length ?? 0} live transcript segments`
                        : `${workspace.recentSessions.length} retained sessions`}
                    </span>
                  </div>
                </div>
              </Panel>
              {diagnosticsOpen ? (
                <Panel title="Diagnostics">
                  <InterviewDiagnosticsPanel
                    diagnostics={
                      activeSession?.diagnostics ??
                      reviewSession?.diagnostics ??
                      []
                    }
                  />
                </Panel>
              ) : null}
            </aside>
          </div>
          ) : null}

          {activeTab === "settings" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="grid gap-4">
                <Panel title="Preferences">
                  <InterviewSessionPreferences
                    onSave={saveSetupPreference}
                    pending={pendingAction === "setup_preferences"}
                    workspace={workspace}
                  />
                </Panel>
                <Panel title="Diagnostics">
                  <InterviewDiagnosticsPanel
                    diagnostics={
                      activeSession?.diagnostics ??
                      reviewSession?.diagnostics ??
                      []
                    }
                  />
                </Panel>
              </div>
              <aside className="grid content-start gap-4">
                <Panel title="Overlay layout">
                  <div className="grid gap-3">
                    {liveOverlaySummaries.map(({ label, overlay }) => (
                      <div
                        className="rounded-(--radius-small) border border-border-subtle bg-black/20 p-3"
                        key={label}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[0.82rem]">{label}</span>
                          <StatusPill
                            label={overlay.mode}
                            tone={overlay.visible ? "success" : "warning"}
                          />
                        </div>
                        <p className="mt-2 text-[0.74rem] leading-5 text-muted-foreground">
                          {overlay.protectionState.replaceAll("_", " ")}
                        </p>
                      </div>
                    ))}
                    <Button
                      onClick={() => {
                        void resetOverlayLayout();
                      }}
                      pending={pendingAction === "reset_overlay_layout"}
                      size="compact"
                      variant="secondary"
                    >
                      <RotateCcw className="size-4" />
                      Reset overlay layout
                    </Button>
                  </div>
                </Panel>
                <Panel title="Hotkeys">
                  <div className="grid gap-2">
                    {[
                      ["Alt + H", "Panic hide"],
                      ["Alt + Q", "Force cue"],
                      ["Alt + S", "Screenshot"],
                      ["Alt + T", "Transcript overlay"],
                    ].map(([keys, label]) => (
                      <div
                        className="flex items-center justify-between border-b border-border-subtle py-2 last:border-0"
                        key={keys}
                      >
                        <span className="text-[0.82rem]">{label}</span>
                        <kbd className="rounded-sm border border-border-subtle bg-black/30 px-2 py-1 font-mono text-[0.7rem] text-muted-foreground">
                          {keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </Panel>
              </aside>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export function InterviewAnswerOverlayRoute() {
  const [workspace, setWorkspace] = useState<InterviewWorkspaceSnapshot | null>(
    null,
  );

  useEffect(() => {
    void window.unemployed.interviewHelper.getWorkspace().then(setWorkspace);
  }, []);

  return workspace ? (
    <AnswerCueOverlay snapshot={workspace.answerOverlay} />
  ) : null;
}

export function InterviewTranscriptOverlayRoute() {
  const [workspace, setWorkspace] = useState<InterviewWorkspaceSnapshot | null>(
    null,
  );

  useEffect(() => {
    void window.unemployed.interviewHelper.getWorkspace().then(setWorkspace);
  }, []);

  return workspace ? (
    <TranscriptOverlay snapshot={workspace.transcriptOverlay} />
  ) : null;
}
