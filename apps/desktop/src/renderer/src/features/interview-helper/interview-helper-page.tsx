import { useEffect, useState } from 'react'
import type {
  InterviewExportResult,
  InterviewHotkeyAction,
  InterviewOverlaySnapshot,
  InterviewWorkspaceSnapshot,
} from '@unemployed/contracts'
import {
  AlertTriangle,
  Archive,
  Camera,
  CheckCircle2,
  Clock,
  FileDown,
  Mic,
  PanelTop,
  Pause,
  Play,
  Radio,
  Shield,
  Sparkles,
  Trash2
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/cn'
import { AnswerCueOverlay, TranscriptOverlay } from './interview-overlays'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; workspace: InterviewWorkspaceSnapshot; exportResult: InterviewExportResult | null }
  | { status: 'error'; message: string }

function StatusPill(props: { label: string; tone?: 'success' | 'warning' | 'critical' | 'info' }) {
  const tone = props.tone ?? 'info'
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-2 py-1 text-[10px] font-bold uppercase tracking-(--tracking-badge)',
        tone === 'success' && 'border-(--success-border) bg-(--success-surface) text-(--success-text)',
        tone === 'warning' && 'border-(--warning-border) bg-(--warning-surface) text-(--warning-text)',
        tone === 'critical' && 'border-critical/35 bg-critical/10 text-critical',
        tone === 'info' && 'border-(--info-border) bg-(--info-surface) text-(--info-text)'
      )}
    >
      {props.label}
    </span>
  )
}

function Panel(props: { children: React.ReactNode; className?: string; title: string; index?: number }) {
  return (
    <section
      className={cn(
        'surface-card-tint relative overflow-hidden rounded-(--radius-panel) border p-4 shadow-[0_18px_70px_rgba(0,0,0,0.22)]',
        props.className
      )}
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
  )
}

function getTargetLabel(workspace: InterviewWorkspaceSnapshot) {
  return workspace.setup.targetContext?.label ?? 'General interview'
}

export function InterviewHelperPage() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  async function loadWorkspace() {
    try {
      const workspace = await window.unemployed.interviewHelper.getWorkspace()
      setState({ status: 'ready', workspace, exportResult: null })
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Interview Helper failed to load.'
      })
    }
  }

  useEffect(() => {
    void loadWorkspace()
  }, [])

  async function updateWorkspace(actionId: string, action: () => Promise<InterviewWorkspaceSnapshot>) {
    setPendingAction(actionId)
    try {
      const workspace = await action()
      setState((current) => ({
        status: 'ready',
        workspace,
        exportResult: current.status === 'ready' ? current.exportResult : null
      }))
    } finally {
      setPendingAction(null)
    }
  }

  async function perform(action: InterviewHotkeyAction) {
    await updateWorkspace(action, () => window.unemployed.interviewHelper.performAction(action))
  }

  if (state.status === 'loading') {
    return (
      <main className="grid h-screen place-items-center bg-canvas">
        <p className="text-muted-foreground">Loading Interview Helper...</p>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main className="grid h-screen place-items-center bg-canvas">
        <div className="rounded-(--radius-panel) border border-critical/30 bg-critical/10 p-6">
          <p>{state.message}</p>
        </div>
      </main>
    )
  }

  const { workspace } = state
  const activeSession = workspace.activeSession
  const isLiveSession = Boolean(activeSession && activeSession.status !== 'ended')
  const rehearsal = workspace.setup.rehearsal
  const reviewSession = activeSession ? null : (workspace.recentSessions[0] ?? null)
  const transcriptSegments = reviewSession?.transcriptSegments ?? []
  const latestCue = reviewSession?.cueCards.at(-1) ?? null
  const checks = rehearsal?.checks ?? []
  const hardBlocks = checks.filter((check) => check.required && check.status !== 'available')
  const degraded = checks.filter((check) => !check.required && check.status !== 'available')
  const targetLabel = getTargetLabel(workspace)
  const canExport = Boolean(reviewSession)
  const liveOverlaySummaries: Array<{ label: string; overlay: InterviewOverlaySnapshot }> = [
    { label: 'Answer cues', overlay: workspace.answerOverlay },
    { label: 'Live transcript', overlay: workspace.transcriptOverlay },
  ]
  const consentAccepted = Boolean(
    workspace.setup.consent.microphoneCapture &&
      workspace.setup.consent.meetingAudioCapture &&
      workspace.setup.consent.screenshotCapture &&
      workspace.setup.consent.modelTransmission &&
      workspace.setup.consent.localRetention &&
      workspace.setup.consent.overlayProtectionNotice &&
      workspace.setup.consent.acceptedAt
  )

  async function exportLatest(format: 'markdown' | 'json') {
    if (!reviewSession) return

    setPendingAction(`export_${format}`)
    try {
      const exportResult = await window.unemployed.interviewHelper.exportSession(
        reviewSession.id,
        format
      )
      setState({ status: 'ready', workspace, exportResult })
    } finally {
      setPendingAction(null)
    }
  }

  return (
    <div className="h-screen overflow-hidden bg-canvas text-foreground">
      <header className="flex h-20 items-center justify-between border-b border-border/15 bg-(--shell-header-bg) px-6">
        <div className="grid gap-1">
          <Link className="font-display text-[2rem] font-black leading-none tracking-[-0.07em]" to="/job-finder/profile">
            UNEMPLOYED
          </Link>
          <span className="text-[0.68rem] uppercase tracking-(--tracking-caps) text-muted-foreground">
            Interview Helper
          </span>
        </div>
        <nav className="flex items-center gap-3">
          <Link className="text-[0.78rem] text-muted-foreground hover:text-foreground" to="/job-finder/profile">
            Job Finder
          </Link>
          <StatusPill
            label={activeSession ? activeSession.status : rehearsal?.status ?? 'setup'}
            tone={activeSession ? 'success' : rehearsal?.status === 'blocked' ? 'critical' : 'warning'}
          />
        </nav>
      </header>

      <main className="screen-scroll-area h-[calc(100vh-5rem)] overflow-y-auto px-6 py-6">
        <div className="mx-auto grid max-w-[118rem] gap-4">
          <section className="grid gap-2">
            <p className="text-[0.72rem] font-bold uppercase tracking-(--tracking-page-eyebrow) text-muted-foreground">
              Interview Helper
            </p>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="grid gap-2">
                <h1 className="text-[clamp(2.25rem,4vw,4rem)]">Live interview workspace</h1>
                <p className="max-w-3xl text-[0.92rem] leading-6 text-muted-foreground">
                  {targetLabel}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => {
                    void updateWorkspace('rehearsal', () => window.unemployed.interviewHelper.runRehearsal())
                  }}
                  pending={pendingAction === 'rehearsal'}
                  size="compact"
                  variant="secondary"
                >
                  <Shield className="size-4" />
                  Run rehearsal
                </Button>
                <Button
                  onClick={() => {
                    void updateWorkspace('start', () => window.unemployed.interviewHelper.startSession())
                  }}
                  pending={pendingAction === 'start'}
                  size="compact"
                >
                  <Play className="size-4" />
                  Start session
                </Button>
              </div>
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="grid gap-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <Panel index={1} title="Context">
                  <div className="grid gap-3">
                    <div className="rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
                      <span className="text-[10px] uppercase tracking-(--tracking-badge) text-muted-foreground">Type</span>
                      <p className="mt-1 text-[0.9rem]">{workspace.setup.targetContext?.kind.replaceAll('_', ' ')}</p>
                    </div>
                    <div className="rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
                      <span className="text-[10px] uppercase tracking-(--tracking-badge) text-muted-foreground">Target</span>
                      <p className="mt-1 text-[0.9rem]">{targetLabel}</p>
                    </div>
                    <div className="rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
                      <span className="text-[10px] uppercase tracking-(--tracking-badge) text-muted-foreground">Notes</span>
                      <p className="mt-1 text-[0.82rem] leading-5 text-muted-foreground">
                        {workspace.setup.targetContext?.notes ?? 'No notes selected.'}
                      </p>
                    </div>
                  </div>
                </Panel>

                <Panel index={2} title="Consent and readiness">
                  <div className="grid gap-2">
                    {[
                      ['Microphone', workspace.setup.consent.microphoneCapture],
                      ['Meeting audio', workspace.setup.consent.meetingAudioCapture],
                      ['Screenshots', workspace.setup.consent.screenshotCapture],
                      ['Model transmission', workspace.setup.consent.modelTransmission],
                      ['Local retention', workspace.setup.consent.localRetention],
                      ['Overlay protection limits', workspace.setup.consent.overlayProtectionNotice],
                    ].map(([label, accepted]) => (
                      <div className="flex items-center justify-between border-b border-border-subtle py-2 last:border-0" key={String(label)}>
                        <span className="text-[0.82rem]">{label}</span>
                        <StatusPill label={accepted ? 'Enabled' : 'Pending'} tone={accepted ? 'success' : 'warning'} />
                      </div>
                    ))}
                    <Button
                      onClick={() => {
                        void updateWorkspace('accept_setup', () =>
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
                          })
                        )
                      }}
                      pending={pendingAction === 'accept_setup'}
                      size="compact"
                      variant={consentAccepted ? 'secondary' : 'primary'}
                    >
                      <CheckCircle2 className="size-4" />
                      {consentAccepted ? 'Setup accepted' : 'Accept setup'}
                    </Button>
                  </div>
                </Panel>

                <Panel index={3} title="Audio and transcript">
                  <div className="grid gap-3">
                    <div className="flex items-start gap-3">
                      <Mic className="mt-1 size-4 text-(--success-text)" />
                      <div>
                        <p className="text-[0.86rem]">Microphone</p>
                        <p className="text-[0.76rem] text-muted-foreground">
                          {rehearsal?.microphoneEngine.label ?? 'Not checked'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Radio className="mt-1 size-4 text-(--warning-text)" />
                      <div>
                        <p className="text-[0.86rem]">Meeting/system audio</p>
                        <p className="text-[0.76rem] text-muted-foreground">
                          {rehearsal?.meetingAudioEngine.label ?? 'Not checked'}
                        </p>
                      </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/40">
                      <div className="h-full w-[72%] rounded-full bg-[linear-gradient(90deg,var(--success-text),var(--info-text))]" />
                    </div>
                  </div>
                </Panel>
              </div>

              <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <Panel index={4} title="Live controls">
                  <div className="grid gap-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-mono text-[1.55rem]">
                          {activeSession ? new Date(activeSession.startedAt).toLocaleTimeString() : '00:00:00'}
                        </p>
                        <p className="text-[0.78rem] text-muted-foreground">
                          {activeSession ? activeSession.status : 'Session inactive'}
                        </p>
                      </div>
                      <StatusPill label={activeSession?.listening ? 'Listening' : 'Not recording'} tone={activeSession?.listening ? 'success' : 'warning'} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={() => { void perform('toggle_listening') }} pending={pendingAction === 'toggle_listening'} size="compact" variant="secondary">
                        <Pause className="size-4" />
                        Pause
                      </Button>
                      <Button onClick={() => { void perform('force_cue') }} pending={pendingAction === 'force_cue'} size="compact" variant="secondary">
                        <Sparkles className="size-4" />
                        Force cue
                      </Button>
                      <Button onClick={() => { void perform('capture_screenshot') }} pending={pendingAction === 'capture_screenshot'} size="compact" variant="secondary">
                        <Camera className="size-4" />
                        Screenshot
                      </Button>
                      <Button onClick={() => { void perform('panic_hide') }} pending={pendingAction === 'panic_hide'} size="compact" variant="destructive">
                        <PanelTop className="size-4" />
                        Panic hide
                      </Button>
                    </div>
                    <Button onClick={() => { void perform('end_session') }} pending={pendingAction === 'end_session'} size="compact" variant="outline">
                      End session
                    </Button>
                  </div>
                </Panel>

                <Panel index={5} title="Capability warnings">
                  <div className="grid gap-2">
                    {[...hardBlocks, ...degraded].length > 0 ? (
                      [...hardBlocks, ...degraded].map((check) => (
                        <div className="rounded-(--radius-small) border border-(--warning-border) bg-(--warning-surface) p-3" key={check.id}>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="size-4 text-(--warning-text)" />
                            <p className="text-[0.86rem]">{check.label}</p>
                          </div>
                          {check.detail ? (
                            <p className="mt-2 text-[0.76rem] leading-5 text-muted-foreground">{check.detail}</p>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-(--radius-small) border border-(--success-border) bg-(--success-surface) p-3 text-(--success-text)">
                        <CheckCircle2 className="mb-2 size-4" />
                        <p className="text-[0.86rem]">All required checks are ready.</p>
                      </div>
                    )}
                  </div>
                </Panel>
              </div>

              <Panel index={6} title="Post-session review">
                {isLiveSession ? (
                  <div className="rounded-(--radius-small) border border-(--info-border) bg-(--info-surface) p-4">
                    <p className="text-[0.88rem] text-(--info-text)">Review opens after the live session ends.</p>
                    <p className="mt-2 text-[0.78rem] leading-5 text-muted-foreground">
                      The main window keeps live cue-card and transcript text out of this surface while capture is active.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr_0.7fr]">
                    <div className="grid gap-2">
                      <h3 className="text-[0.78rem] uppercase tracking-(--tracking-badge) text-muted-foreground">Transcript</h3>
                      <div className="max-h-64 overflow-y-auto rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
                        {transcriptSegments.map((segment) => (
                          <p className="mb-2 text-[0.82rem] leading-5 text-foreground-soft" key={segment.id}>
                            <span className="text-(--warning-text)">{segment.source.replaceAll('_', ' ')}</span> {segment.text}
                          </p>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <h3 className="text-[0.78rem] uppercase tracking-(--tracking-badge) text-muted-foreground">Latest cue</h3>
                      <div className="rounded-(--radius-small) border border-border-subtle bg-black/20 p-3">
                        <p className="text-[0.86rem]">{latestCue?.question ?? 'No cue generated.'}</p>
                        <p className="mt-2 text-[0.76rem] text-muted-foreground">
                          {reviewSession?.cueCards.length ?? 0} cue cards retained
                        </p>
                      </div>
                    </div>
                    <div className="grid content-start gap-2">
                      <Button disabled={!latestCue || !reviewSession} onClick={() => {
                        if (latestCue && reviewSession) {
                          void updateWorkspace('prep', () => window.unemployed.interviewHelper.saveCueAsPrepArtifact({ sessionId: reviewSession.id, cueCardId: latestCue.id }))
                        }
                      }} pending={pendingAction === 'prep'} size="compact" variant="secondary">
                        <Archive className="size-4" />
                        Save prep
                      </Button>
                      <Button disabled={!canExport} onClick={() => { void exportLatest('markdown') }} pending={pendingAction === 'export_markdown'} size="compact" variant="secondary">
                        <FileDown className="size-4" />
                        Export notes
                      </Button>
                      <Button disabled={!reviewSession} onClick={() => {
                        if (reviewSession) {
                          void updateWorkspace('delete', () => window.unemployed.interviewHelper.deleteSession(reviewSession.id))
                        }
                      }} pending={pendingAction === 'delete'} size="compact" variant="destructive">
                        <Trash2 className="size-4" />
                        Delete session
                      </Button>
                    </div>
                  </div>
                )}
                {state.exportResult ? (
                  <div className="mt-4 rounded-(--radius-small) border border-(--info-border) bg-(--info-surface) p-3">
                    <p className="text-[0.78rem] text-(--info-text)">{state.exportResult.fileName}</p>
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
                      <div className="rounded-(--radius-small) border border-border-subtle bg-black/20 p-3" key={label}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[0.82rem]">{label}</span>
                          <StatusPill label={overlay.visible ? 'Overlay window' : 'Hidden'} tone={overlay.visible ? 'success' : 'warning'} />
                        </div>
                        <p className="mt-2 text-[0.74rem] leading-5 text-muted-foreground">
                          {overlay.protectionState.replaceAll('_', ' ')}
                        </p>
                      </div>
                    ))}
                  </div>
                </Panel>
              ) : (
                <>
                  <AnswerCueOverlay framed snapshot={workspace.answerOverlay} />
                  <TranscriptOverlay framed snapshot={workspace.transcriptOverlay} />
                </>
              )}
              <Panel title="Hotkeys and tray">
                <div className="grid gap-2">
                  {[
                    ['Alt + H', 'Panic hide'],
                    ['Alt + Q', 'Force cue'],
                    ['Alt + S', 'Screenshot'],
                    ['Alt + T', 'Transcript overlay'],
                  ].map(([keys, label]) => (
                    <div className="flex items-center justify-between border-b border-border-subtle py-2 last:border-0" key={keys}>
                      <span className="text-[0.82rem]">{label}</span>
                      <kbd className="rounded-sm border border-border-subtle bg-black/30 px-2 py-1 font-mono text-[0.7rem] text-muted-foreground">
                        {keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </Panel>
              <Panel title="Session summary">
                <div className="grid gap-3 text-[0.82rem] text-muted-foreground">
                  <p>
                    {isLiveSession
                      ? 'Live summary text is kept out of the main window while capture is active.'
                      : reviewSession?.cueSummary ?? 'No session summary yet.'}
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
            </aside>
          </div>
        </div>
      </main>
    </div>
  )
}

export function InterviewAnswerOverlayRoute() {
  const [workspace, setWorkspace] = useState<InterviewWorkspaceSnapshot | null>(null)

  useEffect(() => {
    void window.unemployed.interviewHelper.getWorkspace().then(setWorkspace)
  }, [])

  return workspace ? <AnswerCueOverlay snapshot={workspace.answerOverlay} /> : null
}

export function InterviewTranscriptOverlayRoute() {
  const [workspace, setWorkspace] = useState<InterviewWorkspaceSnapshot | null>(null)

  useEffect(() => {
    void window.unemployed.interviewHelper.getWorkspace().then(setWorkspace)
  }, [])

  return workspace ? <TranscriptOverlay snapshot={workspace.transcriptOverlay} /> : null
}
