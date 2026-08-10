import { RotateCcw } from "lucide-react";
import type {
  ResumeCoverageClaimChange,
  ResumeCoverageComparison,
  ResumeCoverageRoleComparison,
} from "@unemployed/contracts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";

const roleStatusLabel: Record<
  ResumeCoverageRoleComparison["status"],
  string
> = {
  unchanged: "Kept",
  rewritten: "Reworded",
  compacted: "Compacted",
  hidden: "Hidden",
  missing: "Missing",
};

export function ResumeCoverageComparisonPanel(props: {
  comparison: ResumeCoverageComparison | null;
  disabled: boolean;
  onRestoreClaim: (
    role: ResumeCoverageRoleComparison,
    claim: ResumeCoverageClaimChange,
  ) => void;
  onRestoreRole: (role: ResumeCoverageRoleComparison) => void;
}) {
  const comparison = props.comparison;
  if (!comparison) {
    return null;
  }

  const hasReviewItems =
    comparison.hiddenRoleCount > 0 ||
    comparison.missingRoleCount > 0 ||
    comparison.removedClaimCount > 0 ||
    comparison.duplicateIssueCount > 0 ||
    comparison.pageImpact === "over_target";

  return (
    <details
      className="rounded-(--radius-field) border border-(--surface-panel-border) bg-(--surface-fill-soft)"
      open={hasReviewItems}
    >
      <summary className="cursor-pointer list-none px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid gap-0.5">
            <strong className="text-sm text-(--text-headline)">
              Original vs tailored
            </strong>
            <span className="text-(length:--text-small) leading-5 text-foreground-soft">
              See what was kept, reworded, hidden, reordered, or removed before
              export.
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">
              {comparison.visibleRoleCount}/{comparison.originalRoleCount} roles
            </Badge>
            {comparison.removedClaimCount > 0 ? (
              <Badge variant="default">
                {comparison.removedClaimCount} removed claim
                {comparison.removedClaimCount === 1 ? "" : "s"}
              </Badge>
            ) : null}
            {comparison.pageCount !== null ? (
              <Badge
                variant={
                  comparison.pageImpact === "over_target"
                    ? "default"
                    : "section"
                }
              >
                {comparison.pageCount}/{comparison.targetPageCount} pages
              </Badge>
            ) : null}
          </div>
        </div>
      </summary>

      <div className="grid gap-3 border-t border-(--surface-panel-border) p-3">
        {(comparison.addedKeywords.length > 0 ||
          comparison.removedKeywords.length > 0) && (
          <div className="grid gap-1.5 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/40 p-2.5 text-(length:--text-small)">
            {comparison.addedKeywords.length > 0 ? (
              <p className="leading-5 text-foreground-soft">
                <strong className="text-foreground">Keywords added:</strong>{" "}
                {comparison.addedKeywords.join(", ")}
              </p>
            ) : null}
            {comparison.removedKeywords.length > 0 ? (
              <p className="leading-5 text-foreground-soft">
                <strong className="text-foreground">Skills not shown:</strong>{" "}
                {comparison.removedKeywords.join(", ")}
              </p>
            ) : null}
          </div>
        )}

        <div className="grid gap-2">
          {comparison.roles.map((role) => (
            <article
              className="grid gap-2 rounded-(--radius-field) border border-(--surface-panel-border) bg-background/35 p-2.5"
              key={role.profileRecordId}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <strong className="block truncate text-sm text-(--text-headline)">
                    {role.title}
                  </strong>
                  <span className="text-(length:--text-small) text-foreground-soft">
                    {role.employer}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant={
                      role.status === "missing" || role.status === "hidden"
                        ? "default"
                        : "outline"
                    }
                  >
                    {roleStatusLabel[role.status]}
                  </Badge>
                  {role.reordered ? (
                    <Badge variant="outline">Reordered</Badge>
                  ) : null}
                  {!role.included && role.entryId && role.sectionId ? (
                    <Button
                      disabled={props.disabled}
                      onClick={() => props.onRestoreRole(role)}
                      size="compact"
                      type="button"
                      variant="secondary"
                    >
                      <RotateCcw className="size-3.5" />
                      Show role
                    </Button>
                  ) : null}
                </div>
              </div>

              {role.reasons.length > 0 ? (
                <p className="text-(length:--text-small) leading-5 text-foreground-soft">
                  {role.reasons[0]}
                </p>
              ) : null}

              {role.addedClaims.length > 0 ? (
                <div className="grid gap-1">
                  <span className="font-display text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                    Reworded or added
                  </span>
                  {role.addedClaims.map((claim, index) => (
                    <p
                      className="text-(length:--text-small) leading-5 text-foreground-soft"
                      key={`${role.profileRecordId}_added_${index}`}
                    >
                      + {claim.text}
                    </p>
                  ))}
                </div>
              ) : null}

              {role.removedClaims.length > 0 ? (
                <div className="grid gap-1.5">
                  <span className="font-display text-(length:--text-tiny) uppercase tracking-(--tracking-caps) text-muted-foreground">
                    Original content not shown verbatim
                  </span>
                  {role.removedClaims.map((claim, index) => (
                    <div
                      className="flex items-start justify-between gap-2"
                      key={`${role.profileRecordId}_removed_${index}`}
                    >
                      <p className="min-w-0 text-(length:--text-small) leading-5 text-foreground-soft">
                        − {claim.text}
                      </p>
                      {claim.restorable && role.entryId && role.sectionId ? (
                        <Button
                          disabled={props.disabled}
                          onClick={() => props.onRestoreClaim(role, claim)}
                          size="compact"
                          type="button"
                          variant="ghost"
                        >
                          Restore
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </details>
  );
}
