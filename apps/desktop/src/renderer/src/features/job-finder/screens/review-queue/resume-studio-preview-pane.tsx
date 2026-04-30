import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  LoaderCircle,
  RefreshCcw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { JobFinderResumePreview } from "@unemployed/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/cn";

type PreviewStatus = "idle" | "loading" | "ready" | "error";

interface ResumeStudioPreviewPaneProps {
  isDirty: boolean;
  isPending: boolean;
  onRetry: () => void;
  onSelectTarget: (selection: {
    sectionId: string | null;
    entryId: string | null;
    targetId: string | null;
  }) => void;
  preview: JobFinderResumePreview | null;
  previewError: string | null;
  previewStatus: PreviewStatus;
  selectedEntryId: string | null;
  selectedSectionId: string | null;
  selectedTargetId: string | null;
  templateLabel?: string | null;
}

function parseSelectionTarget(node: EventTarget | null) {
  const element =
    node &&
    typeof node === "object" &&
    "nodeType" in node &&
    typeof (node as Node).nodeType === "number"
      ? (node as Node).nodeType === Node.ELEMENT_NODE
        ? ((node as Element).closest<HTMLElement>("*") ?? null)
        : (node as Node).parentElement
      : null;
  const entryTarget =
    element?.closest<HTMLElement>("[data-resume-entry-id]") ?? null;
  const sectionTarget =
    element?.closest<HTMLElement>("[data-resume-section-id]") ?? null;
  const fieldTarget =
    element?.closest<HTMLElement>("[data-resume-target-id]") ?? null;

  return {
    entryId: entryTarget?.dataset.resumeEntryId ?? null,
    sectionId:
      entryTarget?.dataset.resumeSectionId ??
      sectionTarget?.dataset.resumeSectionId ??
      null,
    targetId: fieldTarget?.dataset.resumeTargetId ?? null,
  };
}

export function ResumeStudioPreviewPane(props: ResumeStudioPreviewPaneProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [previewFrameHeight, setPreviewFrameHeight] = useState<number | null>(
    null,
  );
  const hasWarnings = (props.preview?.warnings.length ?? 0) > 0;
  const hasReadyPreview =
    props.previewStatus === "ready" && Boolean(props.preview);
  const showPreviewStateMessage = props.isDirty || hasWarnings;
  const previewStateMessage = props.isDirty
    ? "Live preview already includes unsaved edits. Save before you export or approve."
    : "Saved preview already matches the draft that export and approval use.";

  const warningSummary = useMemo(() => {
    const warningCount = props.preview?.warnings.length ?? 0;

    if (warningCount === 0) {
      return "No preview warnings right now.";
    }

    return `${warningCount} preview ${warningCount === 1 ? "warning" : "warnings"} surfaced before export.`;
  }, [props.preview?.warnings.length]);

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame || !props.preview) {
      return;
    }

    const bindPreviewDocument = () => {
      const document = frame.contentDocument;

      if (!document) {
        return () => {};
      }

      const allTargets = document.querySelectorAll<HTMLElement>(
        "[data-resume-section-id], [data-resume-entry-id], [data-resume-target-id]",
      );
      const handleClick = (event: MouseEvent) => {
        const selection = parseSelectionTarget(event.target);

        if (!selection.sectionId && !selection.entryId && !selection.targetId) {
          return;
        }

        event.preventDefault();
        props.onSelectTarget(selection);
      };
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }

        const selection = parseSelectionTarget(event.target);

        if (!selection.sectionId && !selection.entryId && !selection.targetId) {
          return;
        }

        event.preventDefault();
        props.onSelectTarget(selection);
      };

      allTargets.forEach((target) => {
        const isSelectedEntry =
          Boolean(props.selectedEntryId) &&
          target.dataset.resumeEntryId === props.selectedEntryId;
        const isSelectedSection =
          !props.selectedEntryId &&
          Boolean(props.selectedSectionId) &&
          target.dataset.resumeSectionId === props.selectedSectionId;
        const isSelectedField =
          Boolean(props.selectedTargetId) &&
          target.dataset.resumeTargetId === props.selectedTargetId;

        if (isSelectedEntry || isSelectedSection || isSelectedField) {
          target.setAttribute("data-resume-selected", "true");
        } else {
          target.removeAttribute("data-resume-selected");
        }
      });

      document.addEventListener("click", handleClick);
      document.addEventListener("keydown", handleKeyDown);

      return () => {
        document.removeEventListener("click", handleClick);
        document.removeEventListener("keydown", handleKeyDown);
      };
    };

    let cleanupDocument = () => {};

    const handleLoad = () => {
      cleanupDocument();
      cleanupDocument = bindPreviewDocument();
    };

    cleanupDocument = bindPreviewDocument();
    frame.addEventListener("load", handleLoad);

    return () => {
      frame.removeEventListener("load", handleLoad);
      cleanupDocument();
    };
  }, [
    props.onSelectTarget,
    props.preview,
    props.selectedEntryId,
    props.selectedSectionId,
    props.selectedTargetId,
  ]);

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame || !props.preview) {
      setPreviewFrameHeight(null);
      return;
    }

    const measureHeight = () => {
      const frameDocument = frame.contentDocument;

      if (!frameDocument) {
        return;
      }

      const body = frameDocument.body;
      const documentElement = frameDocument.documentElement;
      const nextHeight = Math.ceil(
        Math.max(
          body?.scrollHeight ?? 0,
          documentElement?.scrollHeight ?? 0,
          documentElement?.getBoundingClientRect().height ?? 0,
        ) + 8,
      );

      if (nextHeight > 0) {
        setPreviewFrameHeight((current) =>
          current === nextHeight ? current : nextHeight,
        );
      }
    };

    measureHeight();
    frame.addEventListener("load", measureHeight);

    return () => {
      frame.removeEventListener("load", measureHeight);
    };
  }, [props.preview]);

  return (
    <section className="surface-panel-shell relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border)">
      <header className="grid gap-2 border-b border-(--surface-panel-border) px-3.5 py-2">
        <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-display text-(length:--text-label) font-bold uppercase tracking-(--tracking-caps) text-primary">
                Resume preview
              </p>
              {props.previewStatus === "loading" ? (
                <Badge variant="section">
                  <LoaderCircle className="size-3.5 animate-spin" />
                  Refreshing
                </Badge>
              ) : null}
              {props.previewStatus === "ready" ? (
                <Badge variant={props.isDirty ? "default" : "section"}>
                  <CheckCircle2 className="size-3.5" />
                  {props.isDirty
                    ? "Unsaved edits rendered"
                    : "Saved draft rendered"}
                </Badge>
              ) : null}
              {props.templateLabel ? (
                <Badge variant="section">{props.templateLabel}</Badge>
              ) : null}
            </div>
            <h2 className="text-(length:--text-body) font-semibold text-(--text-headline)">
              Keep the export-faithful page in view while you edit.
            </h2>
            <p className="text-(length:--text-small) leading-4 text-foreground-soft xl:hidden">
              Export uses this same renderer. Click the page to jump straight to
              the matching structured control.
            </p>
          </div>
          <Button
            className="self-start"
            disabled={props.isPending || props.previewStatus === "loading"}
            onClick={props.onRetry}
            size="compact"
            type="button"
            variant="secondary"
          >
            <RefreshCcw className="size-4" />
            Refresh preview
          </Button>
        </div>

        <div className="flex flex-wrap items-start gap-2.5">
          {showPreviewStateMessage ? (
            <div
              className={cn(
                "rounded-(--radius-field) border px-2.5 py-0.75 text-(length:--text-small) leading-4 text-foreground-soft",
                props.isDirty
                  ? "border-primary/20 bg-primary/8"
                  : "border-(--surface-panel-border) bg-background/45",
              )}
            >
              {previewStateMessage}
            </div>
          ) : null}
          {hasWarnings ? (
            <div className="flex flex-wrap gap-2 text-sm text-foreground-soft">
              <Badge variant="outline">
                <FileWarning className="size-3.5" />
                {warningSummary}
              </Badge>
            </div>
          ) : null}
        </div>

        {hasWarnings ? (
          <div className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/45 px-2.5 py-2">
            {props.preview?.warnings.slice(0, 2).map((warning) => (
              <p
                className={cn(
                  "rounded-(--radius-field) border px-2.5 py-1.5 text-sm leading-5",
                  warning.severity === "error"
                    ? "border-critical/30 bg-critical/10 text-critical"
                    : warning.severity === "warning"
                      ? "border-(--warning-border) bg-(--warning-surface) text-(--warning-text)"
                      : "border-(--surface-panel-border) bg-background/60 text-foreground-soft",
                )}
                key={warning.id}
              >
                {warning.message}
              </p>
            ))}
          </div>
        ) : null}
      </header>

      <div
        className={cn(
          "relative grid justify-items-center bg-[linear-gradient(180deg,rgba(16,22,35,0.02),rgba(16,22,35,0.1))] p-0.5",
          hasReadyPreview ? "min-h-168" : "min-h-80",
        )}
      >
        {props.previewStatus === "error" ? (
          <div className="grid h-full place-items-center rounded-(--radius-field) border border-dashed border-critical/35 bg-critical/10 p-6 text-center">
            <div className="grid max-w-md gap-3">
              <div className="mx-auto flex size-11 items-center justify-center rounded-full border border-critical/25 bg-critical/10 text-critical">
                <AlertTriangle className="size-5" />
              </div>
              <h3 className="font-display text-base text-foreground">
                Preview unavailable
              </h3>
              <p className="text-sm leading-6 text-foreground-soft">
                {props.previewError ??
                  "The current draft could not be rendered. Editing still works, and you can retry preview after the next change."}
              </p>
            </div>
          </div>
        ) : props.preview ? (
          <div className="relative min-h-168 w-fit max-w-full overflow-hidden rounded-[0.9rem] border border-(--surface-panel-border) bg-white p-0.5 shadow-[0_3px_10px_rgba(0,0,0,0.12)]">
            <iframe
              className="block max-w-full rounded-xl border-0 bg-white"
              ref={frameRef}
              sandbox="allow-same-origin"
              srcDoc={props.preview.html}
              style={{
                width: "8.95in",
                maxWidth: "100%",
                height: previewFrameHeight
                  ? `${previewFrameHeight}px`
                  : "72rem",
              }}
              title="Live resume preview"
            />
          </div>
        ) : (
          <div className="grid h-full place-items-center rounded-(--radius-field) border border-dashed border-(--surface-panel-border) bg-background/70 p-6 text-center">
            <div className="grid max-w-md gap-3">
              <h3 className="font-display text-base text-foreground">
                Preview pending
              </h3>
              <p className="text-sm leading-6 text-foreground-soft">
                The studio is preparing a live preview from your current draft.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
