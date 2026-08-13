import { useDeferredValue, useId, useMemo, useState } from "react";
import type {
  EditableSourceInstructionArtifact,
  SourceAccessPrompt,
  SourceDebugRunDetails,
  SourceDebugRunRecord,
  SourceInstructionArtifact,
} from "@unemployed/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Checkbox } from "@renderer/components/ui/checkbox";
import { FieldLabel } from "@renderer/components/ui/field";
import type { UseFormReturn } from "react-hook-form";
import type { SearchPreferencesEditorValues } from "../../lib/profile-editor";
import { ProfileDiscoveryTargetRow } from "./profile-discovery-target-row";
import { ProfileInput } from "./profile-form-primitives";
import { ProfileSectionHeader } from "./profile-section-header";

type DiscoveryTarget =
  SearchPreferencesEditorValues["discoveryTargets"][number];

type SourceFilter = "all" | "disabled" | "enabled" | "needs_attention";

export const JOB_SOURCES_PAGE_SIZE = 25;

const sourceFilterOptions: ReadonlyArray<{
  id: SourceFilter;
  label: string;
}> = [
  { id: "all", label: "All" },
  { id: "enabled", label: "Enabled" },
  { id: "disabled", label: "Disabled" },
  { id: "needs_attention", label: "Needs attention" },
];

function getSourceHost(startingUrl: string): string {
  try {
    return new URL(startingUrl).hostname.replace(/^www\./, "");
  } catch {
    return startingUrl.trim() || "URL not set";
  }
}

function getInstructionStatusLabel(target: DiscoveryTarget): string {
  switch (target.instructionStatus) {
    case "validated":
      return "Guidance ready";
    case "draft":
      return "Draft guidance";
    case "stale":
      return "Guidance needs review";
    case "unsupported":
      return "Check unsupported";
    default:
      return "No guidance yet";
  }
}

function sourceNeedsAttention(
  target: DiscoveryTarget,
  accessPromptByTargetId: ReadonlyMap<string, SourceAccessPrompt>,
): boolean {
  return (
    target.instructionStatus === "stale" ||
    target.instructionStatus === "unsupported" ||
    accessPromptByTargetId.has(target.id)
  );
}

export function filterJobSources(
  targets: readonly DiscoveryTarget[],
  query: string,
  filter: SourceFilter,
  accessPromptByTargetId: ReadonlyMap<string, SourceAccessPrompt>,
): Array<{ index: number; target: DiscoveryTarget }> {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return targets.flatMap((target, index) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      target.label.toLocaleLowerCase().includes(normalizedQuery) ||
      target.startingUrl.toLocaleLowerCase().includes(normalizedQuery);
    const matchesFilter =
      filter === "all" ||
      (filter === "enabled" && target.enabled) ||
      (filter === "disabled" && !target.enabled) ||
      (filter === "needs_attention" &&
        sourceNeedsAttention(target, accessPromptByTargetId));

    return matchesQuery && matchesFilter ? [{ index, target }] : [];
  });
}

interface ProfileJobSourcesTabProps {
  isBrowserSessionPending: (targetId: string) => boolean;
  isSourceDebugPending: (targetId: string) => boolean;
  isSourceInstructionPending: (targetId: string) => boolean;
  isSourceInstructionVerifyPending: (instructionId: string) => boolean;
  isTargetDiscoveryPending: (targetId: string) => boolean;
  onGetSourceDebugRunDetails: (runId: string) => Promise<SourceDebugRunDetails>;
  onOpenBrowserSessionForTarget: (targetId: string) => void;
  onRunDiscoveryForTarget?: (targetId: string) => void;
  onRunSourceDebug: (targetId: string) => void;
  onSaveSourceInstructionArtifact: (
    targetId: string,
    artifact: EditableSourceInstructionArtifact,
  ) => void;
  onVerifySourceInstructions: (targetId: string, instructionId: string) => void;
  preferencesForm: UseFormReturn<SearchPreferencesEditorValues>;
  recentSourceDebugRuns: readonly SourceDebugRunRecord[];
  sourceAccessPrompts: readonly SourceAccessPrompt[];
  sourceInstructionArtifacts: readonly SourceInstructionArtifact[];
}

export function ProfileJobSourcesTab(props: ProfileJobSourcesTabProps) {
  const searchInputId = useId();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [page, setPage] = useState(0);
  const [expandedTargetId, setExpandedTargetId] = useState<string | null>(null);
  const discoveryTargets = props.preferencesForm.watch("discoveryTargets");
  const listFieldOptions = {
    shouldDirty: true,
    shouldTouch: true,
    shouldValidate: true,
  } as const;
  const accessPromptByTargetId = useMemo(
    () =>
      new Map(
        props.sourceAccessPrompts.map((prompt) => [prompt.targetId, prompt]),
      ),
    [props.sourceAccessPrompts],
  );
  const instructionArtifactById = useMemo(
    () =>
      new Map(
        props.sourceInstructionArtifacts.map((artifact) => [
          artifact.id,
          artifact,
        ]),
      ),
    [props.sourceInstructionArtifacts],
  );
  const filteredSources = useMemo(
    () =>
      filterJobSources(
        discoveryTargets,
        deferredQuery,
        filter,
        accessPromptByTargetId,
      ),
    [accessPromptByTargetId, deferredQuery, discoveryTargets, filter],
  );
  const pageCount = Math.max(
    1,
    Math.ceil(filteredSources.length / JOB_SOURCES_PAGE_SIZE),
  );
  const currentPage = Math.min(page, pageCount - 1);
  const visibleSources = filteredSources.slice(
    currentPage * JOB_SOURCES_PAGE_SIZE,
    (currentPage + 1) * JOB_SOURCES_PAGE_SIZE,
  );
  const firstVisibleSourceNumber =
    filteredSources.length === 0 ? 0 : currentPage * JOB_SOURCES_PAGE_SIZE + 1;
  const lastVisibleSourceNumber = Math.min(
    filteredSources.length,
    firstVisibleSourceNumber + visibleSources.length - 1,
  );
  const enabledCount = discoveryTargets.filter(
    (target) => target.enabled,
  ).length;
  const needsAttentionCount = discoveryTargets.filter((target) =>
    sourceNeedsAttention(target, accessPromptByTargetId),
  ).length;

  const updateDiscoveryTargets = (
    nextTargets: SearchPreferencesEditorValues["discoveryTargets"],
  ) => {
    props.preferencesForm.setValue(
      "discoveryTargets",
      nextTargets,
      listFieldOptions,
    );
  };

  const setLibraryView = (nextFilter: SourceFilter, nextQuery = query) => {
    setFilter(nextFilter);
    setQuery(nextQuery);
    setPage(0);
    setExpandedTargetId(null);
  };

  const createDiscoveryTargetId = () => {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return `target_${globalThis.crypto.randomUUID()}`;
    }

    return `target_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  };

  const addDiscoveryTarget = () => {
    const targetId = createDiscoveryTargetId();
    updateDiscoveryTargets([
      ...discoveryTargets,
      {
        id: targetId,
        label: "",
        startingUrl: "",
        enabled: true,
        adapterKind: "auto",
        customInstructions: "",
        instructionStatus: "missing",
        validatedInstructionId: null,
        draftInstructionId: null,
        lastDebugRunId: null,
        lastVerifiedAt: null,
        staleReason: null,
      },
    ]);
    setFilter("all");
    setQuery("");
    setPage(Math.floor(discoveryTargets.length / JOB_SOURCES_PAGE_SIZE));
    setExpandedTargetId(targetId);
  };

  const toggleTarget = (targetId: string, enabled: boolean) => {
    updateDiscoveryTargets(
      discoveryTargets.map((target) =>
        target.id === targetId ? { ...target, enabled } : target,
      ),
    );
  };

  const moveToPage = (nextPage: number) => {
    setPage(nextPage);
    setExpandedTargetId(null);
    window.requestAnimationFrame(() => {
      document
        .getElementById("profile-job-sources-list-heading")
        ?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  };

  return (
    <section
      className="grid content-start gap-(--gap-card)"
      data-job-sources-library
      id="profile-job-sources"
    >
      <ProfileSectionHeader
        action={
          <Button
            onClick={addDiscoveryTarget}
            type="button"
            variant="secondary"
          >
            Add source
          </Button>
        }
        description="Manage every public careers page or job board Job Finder can check. Sources stay off until you enable them, and only enabled sources run during a search."
        eyebrow="Discovery library"
        headingId="profile-job-sources-heading"
        title="Job sources"
      />

      <div
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        role="list"
        aria-label="Job source summary"
      >
        {[
          { label: "Total sources", value: discoveryTargets.length },
          { label: "Enabled for search", value: enabledCount },
          { label: "Disabled", value: discoveryTargets.length - enabledCount },
          { label: "Needs attention", value: needsAttentionCount },
        ].map((item) => (
          <div
            className="surface-card-tint grid gap-1 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-3"
            key={item.label}
            role="listitem"
          >
            <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-label) text-foreground-muted">
              {item.label}
            </span>
            <strong className="text-xl text-(--text-headline)">
              {item.value}
            </strong>
          </div>
        ))}
      </div>

      <article className="surface-card-tint grid gap-4 rounded-(--radius-panel) border border-(--surface-panel-border) p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_auto] lg:items-end">
          <div className="grid gap-(--gap-field)">
            <FieldLabel htmlFor={searchInputId}>Find a source</FieldLabel>
            <ProfileInput
              autoComplete="off"
              id={searchInputId}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
                setExpandedTargetId(null);
              }}
              placeholder="Search by company, board, or URL"
              type="search"
              value={query}
            />
          </div>
          <div
            aria-label="Filter job sources"
            className="flex flex-wrap gap-2"
            role="group"
          >
            {sourceFilterOptions.map((option) => (
              <Button
                aria-pressed={filter === option.id}
                key={option.id}
                onClick={() => setLibraryView(option.id)}
                size="sm"
                type="button"
                variant={filter === option.id ? "primary" : "outline"}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-(--surface-panel-border) pt-3">
          <h3
            className="scroll-mt-4 text-[0.98rem] font-semibold text-(--text-headline) outline-none"
            id="profile-job-sources-list-heading"
            tabIndex={-1}
          >
            Source library
          </h3>
          <p
            aria-atomic="true"
            aria-live="polite"
            className="text-(length:--text-small) text-foreground-muted"
            role="status"
          >
            {filteredSources.length === discoveryTargets.length
              ? `${discoveryTargets.length} sources`
              : `${filteredSources.length} of ${discoveryTargets.length} sources`}
          </p>
        </div>

        {discoveryTargets.length === 0 ? (
          <div className="rounded-(--radius-field) border border-(--info-border) bg-(--info-surface) px-4 py-3 text-[0.9rem] leading-6 text-(--info-text)">
            <p className="font-medium">Add your first public job source</p>
            <p className="mt-1">
              Add the careers page or job board you would normally browse. Save
              it, check it, then enable it when you want it included in
              searches.
            </p>
          </div>
        ) : null}

        {discoveryTargets.length > 0 && filteredSources.length === 0 ? (
          <div className="rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-5 text-center">
            <p className="font-medium text-(--text-headline)">
              No sources match this view
            </p>
            <p className="mt-1 text-sm text-foreground-muted">
              Clear the search or choose All to return to the complete library.
            </p>
            <Button
              className="mt-3"
              onClick={() => setLibraryView("all", "")}
              size="sm"
              type="button"
              variant="secondary"
            >
              Show all sources
            </Button>
          </div>
        ) : null}

        {visibleSources.length > 0 ? (
          <ul
            aria-label="Configured job sources"
            className="m-0 grid list-none gap-2 p-0"
          >
            {visibleSources.map(({ index, target }) => {
              const instructionArtifactId =
                target.draftInstructionId ?? target.validatedInstructionId;
              const isExpanded = expandedTargetId === target.id;
              const displayName =
                target.label.trim() || `New source ${index + 1}`;
              const accessPrompt =
                accessPromptByTargetId.get(target.id) ?? null;

              return (
                <li className="min-w-0" key={target.id}>
                  {isExpanded ? (
                    <div
                      className="grid gap-2"
                      data-expanded-source-id={target.id}
                    >
                      <div className="flex justify-end">
                        <Button
                          aria-label={`Collapse editor for ${displayName}`}
                          onClick={() => setExpandedTargetId(null)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Collapse editor
                        </Button>
                      </div>
                      <ProfileDiscoveryTargetRow
                        discoveryTargets={discoveryTargets}
                        index={index}
                        instructionArtifact={
                          instructionArtifactId
                            ? (instructionArtifactById.get(
                                instructionArtifactId,
                              ) ?? null)
                            : null
                        }
                        isBrowserSessionPending={props.isBrowserSessionPending}
                        isSourceDebugPending={props.isSourceDebugPending}
                        isSourceInstructionPending={
                          props.isSourceInstructionPending
                        }
                        isSourceInstructionVerifyPending={
                          props.isSourceInstructionVerifyPending
                        }
                        isTargetDiscoveryPending={
                          props.isTargetDiscoveryPending
                        }
                        onGetSourceDebugRunDetails={
                          props.onGetSourceDebugRunDetails
                        }
                        onOpenBrowserSessionForTarget={
                          props.onOpenBrowserSessionForTarget
                        }
                        {...(props.onRunDiscoveryForTarget
                          ? {
                              onRunDiscoveryForTarget:
                                props.onRunDiscoveryForTarget,
                            }
                          : {})}
                        onRunSourceDebug={props.onRunSourceDebug}
                        onSaveSourceInstructionArtifact={
                          props.onSaveSourceInstructionArtifact
                        }
                        onVerifySourceInstructions={
                          props.onVerifySourceInstructions
                        }
                        recentSourceDebugRuns={props.recentSourceDebugRuns}
                        sourceAccessPrompt={accessPrompt}
                        target={target}
                        updateDiscoveryTargets={updateDiscoveryTargets}
                      />
                    </div>
                  ) : (
                    <article
                      className="grid gap-3 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-fill-subtle) px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                      data-compact-source-id={target.id}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="min-w-0 truncate font-semibold text-(--text-headline)">
                            {displayName}
                          </h4>
                          <Badge
                            variant={target.enabled ? "default" : "outline"}
                          >
                            {target.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                          {sourceNeedsAttention(
                            target,
                            accessPromptByTargetId,
                          ) ? (
                            <Badge variant="destructive">Needs attention</Badge>
                          ) : null}
                        </div>
                        <p
                          className="mt-1 truncate text-sm text-foreground-muted"
                          title={target.startingUrl}
                        >
                          {getSourceHost(target.startingUrl)}
                        </p>
                        <p className="mt-1 text-xs text-foreground-muted">
                          {getInstructionStatusLabel(target)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <label className="flex min-h-9 items-center gap-2 rounded-(--radius-button) border border-(--surface-panel-border) px-3 text-sm text-foreground-soft">
                          <Checkbox
                            aria-label={`Include ${displayName} in searches`}
                            checked={target.enabled}
                            onCheckedChange={(checked) =>
                              toggleTarget(target.id, checked === true)
                            }
                          />
                          Include in search
                        </label>
                        <Button
                          aria-expanded={false}
                          aria-label={`Edit ${displayName}`}
                          onClick={() => setExpandedTargetId(target.id)}
                          size="sm"
                          type="button"
                          variant="secondary"
                        >
                          Edit source
                        </Button>
                      </div>
                    </article>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}

        {pageCount > 1 ? (
          <nav
            aria-label="Job source pages"
            className="flex items-center justify-between gap-3 border-t border-(--surface-panel-border) pt-3"
          >
            <Button
              disabled={currentPage === 0}
              onClick={() => moveToPage(Math.max(0, currentPage - 1))}
              size="sm"
              type="button"
              variant="outline"
            >
              Previous
            </Button>
            <span className="text-center text-(length:--text-small) text-foreground-muted">
              {firstVisibleSourceNumber}–{lastVisibleSourceNumber} of{" "}
              {filteredSources.length}
            </span>
            <Button
              disabled={currentPage >= pageCount - 1}
              onClick={() =>
                moveToPage(Math.min(pageCount - 1, currentPage + 1))
              }
              size="sm"
              type="button"
              variant="outline"
            >
              Next
            </Button>
          </nav>
        ) : null}
      </article>
    </section>
  );
}
