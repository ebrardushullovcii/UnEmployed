import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { StatusBadge } from "../../components/status-badge";

export function ResumeWorkspaceContextDisclosure(props: {
  children: ReactNode;
  claimCount: number;
  statusLabel: string;
}) {
  return (
    <details className="group min-w-0">
      <summary className="surface-panel-shell flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-3 outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-[3px] focus-visible:ring-ring/40">
        <span className="grid min-w-0 gap-1">
          <span className="font-display text-(length:--text-label) font-bold uppercase tracking-(--tracking-caps) text-primary">
            Résumé proof details (optional)
          </span>
          <span className="text-(length:--text-small) leading-5 text-foreground-soft">
            {props.claimCount > 0
              ? `${props.claimCount} claims checked. This is supporting evidence, not another approval step.`
              : "Supporting evidence for the résumé. This is not another approval step."}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <StatusBadge tone="neutral">{props.statusLabel}</StatusBadge>
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
          />
        </span>
      </summary>
      <div className="max-h-[30rem] overflow-y-auto overscroll-contain pt-2">
        {props.children}
      </div>
    </details>
  );
}
