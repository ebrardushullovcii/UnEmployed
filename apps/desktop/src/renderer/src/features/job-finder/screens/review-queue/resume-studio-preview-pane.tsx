import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  LoaderCircle,
  RefreshCcw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const [previewFrameHeight, setPreviewFrameHeight] = useState<number | null>(
    null,
  );
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

  useEffect(() => {
    const frame = frameRef.current;
    let resizeObserver: { observe: (target: Element) => void; disconnect: () => void } | null = null;

    if (!frame || !props.preview) {
      setPreviewFrameHeight(null);
      return;
    }

    const measureHeight = () => {
      const frameDocument = frame.contentDocument;

      if (!frameDocument) {
        return;
      }

      const previewContent =
        frameDocument.querySelector<HTMLElement>(".preview-shell") ??
        frameDocument.querySelector<HTMLElement>(".page") ??
        frameDocument.body;
      const contentHeight = previewContent
        ? previewContent.getBoundingClientRect().height
        : 0;
      const nextHeight = Math.ceil(
        Math.max(
          contentHeight,
          previewContent?.scrollHeight ?? 0,
        ) + 8,
      );

      if (nextHeight > 0) {
        setPreviewFrameHeight((current) =>
          current === nextHeight ? current : nextHeight,
        );
      }
    };

    const observeLoadedFrame = (event: Event) => {
      resizeObserver?.disconnect();
      resizeObserver = null;
      measureHeight();

      const loadedFrame = event.target instanceof HTMLIFrameElement
        ? event.target
        : frame;
      const frameBody = loadedFrame.contentDocument?.body;

      if (frameBody && "ResizeObserver" in globalThis) {
        const ResizeObserverConstructor = globalThis.ResizeObserver as {
          new (callback: ResizeObserverCallback): {
            observe: (target: Element) => void;
            disconnect: () => void;
          };
        };
        resizeObserver = new ResizeObserverConstructor(() => {
          measureHeight();
        });
        resizeObserver.observe(frameBody);
      }
    };

    frame.addEventListener("load", observeLoadedFrame);

    if (typeof window !== "undefined") {
      window.addEventListener("resize", measureHeight);
    }

    return () => {
      frame.removeEventListener("load", observeLoadedFrame);
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", measureHeight);
      }
      resizeObserver?.disconnect();
    };
  }, [props.preview]);

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
      </div>
    </section>
  );
}
