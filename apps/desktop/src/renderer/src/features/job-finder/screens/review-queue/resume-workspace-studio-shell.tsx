import type { ReactNode } from 'react'
import { FileOutput, RefreshCcw, Save, ShieldCheck, ShieldOff } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'

interface ResumeWorkspaceStudioShellProps {
  approvalStateLabel: string | null
  assistantRail: ReactNode
  canApproveCurrentPdf: boolean
  canClearApproval: boolean
  editorPanel: ReactNode
  hasUnsavedChanges: boolean
  isWorkspacePending: boolean
  mobileStudioTab: 'preview' | 'editor' | 'assistant'
  onApproveCurrentPdf: () => void
  onClearApproval: () => void
  onExportPdf: () => void
  onRegenerateDraft: () => void
  onSaveDraft: () => void
  onSetMobileStudioTab: (tab: 'preview' | 'editor' | 'assistant') => void
  onToggleGuidedEdits: () => void
  previewPane: ReactNode
  selectedTemplateApprovalEligible: boolean
  showExpandedAssistantRail: boolean
  studioStatusMessage: string
  templatePanel: ReactNode
}

export function ResumeWorkspaceStudioShell(
  props: ResumeWorkspaceStudioShellProps,
) {
  const guidedEditsLabel = props.showExpandedAssistantRail
    ? 'Hide guided edits'
    : 'Open guided edits'

  return (
    <div className="surface-panel-shell flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border)">
      <div className="grid gap-1 border-b border-(--surface-panel-border) px-3 py-1.25">
        <div className="grid gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-(length:--text-label) font-bold uppercase tracking-(--tracking-caps) text-primary">
              Resume Studio
            </p>
            <Badge variant="section">Preview-led review</Badge>
            <Badge variant={props.hasUnsavedChanges ? 'default' : 'section'}>
              {props.hasUnsavedChanges ? 'Unsaved draft' : 'Saved draft'}
            </Badge>
            <Badge variant={props.selectedTemplateApprovalEligible ? 'section' : 'outline'}>
              {props.selectedTemplateApprovalEligible ? 'Approval eligible' : 'Approval blocked'}
            </Badge>
          </div>
          <h2 className="text-(length:--text-body) font-semibold text-(--text-headline)">
            Tune the live draft before export.
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button
            pending={props.isWorkspacePending}
            onClick={props.onSaveDraft}
            size="compact"
            type="button"
            variant="primary"
          >
            <Save className="size-4" />
            Save draft
          </Button>
          <Button
            pending={props.isWorkspacePending}
            onClick={props.onRegenerateDraft}
            size="compact"
            type="button"
            variant="secondary"
          >
            <RefreshCcw className="size-4" />
            Refresh draft
          </Button>
          <Button
            pending={props.isWorkspacePending}
            onClick={props.onExportPdf}
            size="compact"
            type="button"
            variant="secondary"
          >
            <FileOutput className="size-4" />
            Export PDF
          </Button>
          {props.canClearApproval ? (
            <Button
              pending={props.isWorkspacePending}
              onClick={props.onClearApproval}
              size="compact"
              type="button"
              variant="destructive"
            >
              <ShieldOff className="size-4" />
              Clear approval
            </Button>
          ) : null}
          {!props.canClearApproval && props.canApproveCurrentPdf ? (
            <Button
              pending={props.isWorkspacePending}
              onClick={props.onApproveCurrentPdf}
              size="compact"
              type="button"
              variant="primary"
            >
              <ShieldCheck className="size-4" />
              Approve current PDF
            </Button>
          ) : null}
          <Button
            onClick={props.onToggleGuidedEdits}
            size="compact"
            type="button"
            variant="ghost"
          >
            {guidedEditsLabel}
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/45 px-2.5 py-0.75 text-(length:--text-small) leading-4 text-foreground-soft">
          <span>{props.studioStatusMessage}</span>
          {props.approvalStateLabel ? (
            <Badge variant="outline">{props.approvalStateLabel}</Badge>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 xl:hidden">
        <Tabs
          className="min-h-0 h-full"
          onValueChange={(value) =>
            props.onSetMobileStudioTab(value as 'preview' | 'editor' | 'assistant')
          }
          value={props.mobileStudioTab}
        >
          <TabsList className="grid w-full grid-cols-3 border-b border-(--surface-panel-border) bg-transparent" variant="line">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="editor">Tools</TabsTrigger>
            <TabsTrigger value="assistant">Assistant</TabsTrigger>
          </TabsList>
          <div className="min-h-0 flex-1 p-4">
            <TabsContent className="min-h-0 h-full" value="preview">
              {props.previewPane}
            </TabsContent>
            <TabsContent className="min-h-0 h-full" value="editor">
              <div className="grid min-h-0 h-full gap-4 xl:hidden">
                <div className="min-h-(--size-resume-workspace-panel)">{props.templatePanel}</div>
                <div className="min-h-(--size-resume-workspace-panel)">{props.editorPanel}</div>
              </div>
            </TabsContent>
            <TabsContent className="min-h-0 h-full" value="assistant">
              {props.assistantRail}
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <div className="hidden min-h-0 flex-1 gap-2.5 p-2.5 xl:grid xl:grid-rows-[auto_auto_minmax(0,1fr)]">
        <div className="min-h-0 min-w-0">{props.templatePanel}</div>

        <div className="grid min-h-0 min-w-0 gap-2.5 xl:grid-cols-[minmax(0,52rem)_minmax(30rem,1fr)] xl:grid-rows-[minmax(0,1fr)] xl:row-span-2">
          <div className="min-h-0 min-w-0">{props.previewPane}</div>
          <div
            className={props.showExpandedAssistantRail
              ? 'grid h-full min-h-0 min-w-0 gap-2.5 overflow-hidden xl:grid-rows-[minmax(0,1fr)_minmax(15rem,0.72fr)]'
              : 'grid h-full min-h-0 min-w-0 overflow-hidden'}
          >
            <div className="min-h-0 min-w-0">{props.editorPanel}</div>
            {props.showExpandedAssistantRail ? (
              <div className="min-h-0 min-w-0">{props.assistantRail}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
