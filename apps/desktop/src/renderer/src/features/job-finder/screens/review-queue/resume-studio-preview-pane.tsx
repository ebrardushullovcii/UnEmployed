import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  LoaderCircle,
  RefreshCcw,
} from "lucide-react";
import { useEffect, useRef } from "react";
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
  const scrollRegionRef = useRef<HTMLDivElement | null>(null);
  const hasReadyPreview =
    props.previewStatus === "ready" && Boolean(props.preview);
  const warningCount = props.preview?.warnings.length ?? 0;

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

      let selectedFieldTarget: HTMLElement | null = null;
      let selectedEntryTarget: HTMLElement | null = null;
      let selectedSectionTarget: HTMLElement | null = null;

      for (const target of allTargets) {
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

        if (isSelectedField && !selectedFieldTarget) {
          selectedFieldTarget = target;
        } else if (isSelectedEntry && !selectedEntryTarget) {
          selectedEntryTarget = target;
        } else if (isSelectedSection && !selectedSectionTarget) {
          selectedSectionTarget = target;
        }
      }

      const selectedPreviewTarget =
        selectedFieldTarget ?? selectedEntryTarget ?? selectedSectionTarget;

      if (selectedPreviewTarget) {
        const scrollRegion = scrollRegionRef.current;

        if (scrollRegion) {
          const scrollRegionRect = scrollRegion.getBoundingClientRect();
          const frameRect = frame.getBoundingClientRect();
          const targetRect = selectedPreviewTarget.getBoundingClientRect();
          const frameOffsetTop = frameRect.top - scrollRegionRect.top;
          const regionTop = scrollRegion.scrollTop;
          const regionBottom = regionTop + scrollRegion.clientHeight;
          const targetTop = regionTop + frameOffsetTop + targetRect.top;
          const targetBottom = regionTop + frameOffsetTop + targetRect.bottom;

          if (targetTop < regionTop) {
            scrollRegion.scrollTop = Math.max(0, targetTop - 24);
          } else if (targetBottom > regionBottom) {
            scrollRegion.scrollTop = targetBottom - scrollRegion.clientHeight + 24;
          }
        }
      }

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

  return (
    <section className="surface-panel-shell relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-(--radius-field) border border-(--surface-panel-border) xl:h-full">
      <header className="border-b border-(--surface-panel-border) px-3.5 py-2">
        <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
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
              {warningCount > 0 ? (
                <Badge variant="outline">
                  <FileWarning className="size-3.5" />
                  {warningCount} warning{warningCount === 1 ? "" : "s"}
                </Badge>
              ) : null}
            </div>
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

      </header>

      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,var(--surface-gradient-start),var(--surface-gradient-end))] p-0.5",
          hasReadyPreview ? "min-h-168 xl:min-h-0" : "min-h-80 xl:min-h-0",
        )}
        data-resume-preview-scroll-region
        ref={scrollRegionRef}
      >
        <div className="grid h-full justify-items-center">
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
          <div className="relative h-full min-h-0 w-fit max-w-full overflow-hidden rounded-[0.9rem] border border-(--surface-panel-border) bg-white p-0.5 shadow-[0_3px_10px_rgba(0,0,0,0.12)]">
            <iframe
              className="block h-full max-w-full rounded-xl border-0 bg-white"
              ref={frameRef}
              sandbox="allow-same-origin"
              srcDoc={props.preview.html}
              style={{
                width: "8.95in",
                maxWidth: "100%",
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
      </div>
    </section>
  );
}
