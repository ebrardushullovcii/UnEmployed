import { useState } from "react";
import type {
  ResumeAssistantMessage,
  ResumeDraft,
  ResumeDraftPatch,
  ResumeValidationResult,
} from "@unemployed/contracts";
import { Button } from "@renderer/components/ui/button";
import {
  findProposalPatchTarget,
  PROPOSED_WORDING_CHECK_NOTE,
  resolveProposalProvenance,
} from "./resume-assistant-proposal-provenance";
import type {
  ProposalProvenance,
  ProposalProvenanceTone,
} from "./resume-assistant-proposal-provenance";
import { SourceRefsList } from "./source-refs-list";

const provenanceToneClassNames: Record<ProposalProvenanceTone, string> = {
  attention: "text-destructive",
  neutral: "text-foreground-soft",
  positive: "text-(--success-text)",
  warning: "text-(--warning-text)",
};

function readCurrentValue(draft: ResumeDraft, patch: ResumeDraftPatch): string {
  const target = findProposalPatchTarget(draft, patch);
  const section = target.section;
  const entry = target.entry;
  const bullet = target.bullet;

  switch (patch.operation) {
    case "replace_section_text":
      return section?.text ?? "Empty section";
    case "replace_entry_summary":
      return entry?.summary ?? "Empty summary";
    case "insert_bullet":
      return "No bullet";
    case "update_bullet":
    case "remove_bullet":
      return bullet?.text ?? "Bullet is no longer available";
    case "toggle_include":
      return `${bullet?.included ?? entry?.included ?? section?.included ?? false ? "Included" : "Excluded"}`;
    case "set_lock":
      return `${bullet?.locked ?? entry?.locked ?? section?.locked ?? false ? "Locked" : "Unlocked"}`;
    case "replace_section_bullets":
      return (entry?.bullets ?? section?.bullets ?? [])
        .map((candidate) => candidate.text)
        .join("\n");
    case "move_bullet":
    case "move_entry":
    case "reset_entry_order":
      return "Current order";
  }
}

function readProposedValue(patch: ResumeDraftPatch): string {
  switch (patch.operation) {
    case "replace_section_text":
    case "replace_entry_summary":
    case "insert_bullet":
    case "update_bullet":
      return patch.newText ?? "No replacement text";
    case "remove_bullet":
      return "Remove this bullet";
    case "toggle_include":
      return patch.newIncluded ? "Included" : "Excluded";
    case "set_lock":
      return patch.newLocked ? "Locked" : "Unlocked";
    case "replace_section_bullets":
      return (patch.newBullets ?? []).map((bullet) => bullet.text).join("\n");
    case "move_bullet":
    case "move_entry":
      return `Move ${patch.position ?? "to the requested position"}`;
    case "reset_entry_order":
      return "Restore chronological order";
  }
}

function operationLabel(operation: ResumeDraftPatch["operation"]): string {
  return operation.replaceAll("_", " ");
}

/**
 * Display-only provenance for one proposed change. Saved validation never
 * describes proposed wording, so the disclosure only reports the current saved
 * text and always points out that new wording is checked after accepting and
 * saving.
 */
function ProposalGroundingDisclosure(props: { provenance: ProposalProvenance }) {
  const provenance = props.provenance;

  return (
    <details className="min-w-0">
      <summary className="cursor-pointer list-none select-none text-(length:--text-tiny) font-medium uppercase tracking-(--tracking-caps) text-muted-foreground transition hover:text-foreground [&::-webkit-details-marker]:hidden">
        Why this edit is grounded
      </summary>
      <div className="mt-2 grid min-w-0 gap-2 border-t border-(--surface-panel-border) pt-2 text-xs leading-5">
        {provenance.savedTextCheck ? (
          <p
            className={`font-medium ${provenanceToneClassNames[provenance.savedTextCheck.tone]}`}
          >
            {provenance.savedTextCheck.label}
          </p>
        ) : null}
        {provenance.targetFound ? (
          <SourceRefsList
            sourceRefs={provenance.sourceRefs}
            variant="compact"
          />
        ) : (
          <p className="text-foreground-soft">
            This edit points at a target that is no longer in the draft.
          </p>
        )}
        {provenance.savedTextCheck ? (
          <p className="text-(length:--text-tiny) text-muted-foreground">
            {PROPOSED_WORDING_CHECK_NOTE}
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function ResumeAssistantProposalCard(props: {
  draft: ResumeDraft;
  isPending: boolean;
  message: ResumeAssistantMessage;
  onResolve: (
    proposalId: string,
    action: "accept" | "reject",
    patchIds: readonly string[],
  ) => void;
  validation?: ResumeValidationResult | null;
}) {
  const [selectedPatchIds, setSelectedPatchIds] = useState<readonly string[]>(
    () => props.message.patches.map((patch) => patch.id),
  );
  const pending = props.message.proposalStatus === "pending";

  return (
    <section
      aria-label="Guided edits proposal"
      className="mt-3 grid gap-3 rounded-(--radius-field) border border-primary/25 bg-background/70 p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-(--tracking-caps) text-primary">
          Proposed changes
        </p>
        <span className="text-xs capitalize text-muted-foreground">
          {props.message.proposalStatus}
        </span>
      </div>
      <div className="grid gap-3">
        {props.message.patches.map((patch, index) => {
          const selected = selectedPatchIds.includes(patch.id);
          const provenance = resolveProposalProvenance({
            claimAssessments: props.validation?.claimAssessments ?? [],
            draft: props.draft,
            patch,
          });
          const comparison = (
            <>
              <span className="flex items-center gap-2 text-xs font-semibold capitalize text-foreground">
                {pending ? (
                  <input
                    aria-label={`Select proposed change ${index + 1}: ${operationLabel(patch.operation)}`}
                    checked={selected}
                    disabled={props.isPending}
                    onChange={() =>
                      setSelectedPatchIds((current) =>
                        current.includes(patch.id)
                          ? current.filter((id) => id !== patch.id)
                          : [...current, patch.id],
                      )
                    }
                    type="checkbox"
                  />
                ) : null}
                {operationLabel(patch.operation)}
                {!pending ? (
                  <span className="ml-auto text-muted-foreground">
                    {props.message.proposalStatus === "accepted"
                      ? props.message.resolvedPatchIds.includes(patch.id)
                        ? "Applied"
                        : "Not applied"
                      : "Rejected"}
                  </span>
                ) : null}
              </span>
              <span className="text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                {provenance.targetLabel}
              </span>
              <span className="grid gap-1 text-xs leading-5">
                {pending ? (
                  <>
                    <span className="text-muted-foreground">Before</span>
                    <span className="whitespace-pre-wrap break-words text-foreground-soft">
                      {readCurrentValue(props.draft, patch)}
                    </span>
                    <span className="mt-1 text-muted-foreground">After</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Proposed</span>
                )}
                <span className="whitespace-pre-wrap break-words text-foreground">
                  {readProposedValue(patch)}
                </span>
              </span>
            </>
          );

          return (
            <div
              className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-fill-soft) p-3"
              key={patch.id}
            >
              {pending ? (
                // The disclosure stays outside this label so toggling it never
                // flips the proposal selection checkbox.
                <label className="grid cursor-pointer gap-2">{comparison}</label>
              ) : (
                <div className="grid gap-2">{comparison}</div>
              )}
              <ProposalGroundingDisclosure provenance={provenance} />
            </div>
          );
        })}
      </div>
      {props.message.proposalError ? (
        <p className="text-sm text-destructive" role="alert">
          {props.message.proposalError}
        </p>
      ) : null}
      {pending ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            disabled={props.isPending}
            onClick={() => props.onResolve(props.message.id, "reject", [])}
            size="sm"
            type="button"
            variant="secondary"
          >
            Reject proposal
          </Button>
          <Button
            disabled={props.isPending || selectedPatchIds.length === 0}
            onClick={() =>
              props.onResolve(
                props.message.id,
                "accept",
                selectedPatchIds,
              )
            }
            size="sm"
            type="button"
          >
            Accept selected ({selectedPatchIds.length})
          </Button>
        </div>
      ) : props.message.proposalStatus === "accepted" ? (
        <p className="text-xs text-foreground-soft">
          Accepted {props.message.resolvedPatchIds.length} of{" "}
          {props.message.patches.length} proposed changes. Undo remains available
          in version history.
        </p>
      ) : null}
    </section>
  );
}
