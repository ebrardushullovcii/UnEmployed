import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function ResumeWorkspaceContextDisclosure(props: {
  children: ReactNode;
}) {
  return (
    <details className="group min-w-0" id="resume-proof-details">
      <summary className="surface-panel-shell flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-(--radius-field) border border-(--surface-panel-border) px-4 py-2 outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-[3px] focus-visible:ring-ring/40">
        <span className="grid min-w-0 gap-0.5">
          <span className="text-(length:--text-small) font-semibold text-(--text-headline)">
            About this tailored resume
          </span>
          <span className="text-(length:--text-small) leading-5 text-foreground-soft">
            See the target job and the evidence Job Finder used. You do not need
            this to approve.
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="grid max-h-[30rem] gap-2 overflow-y-auto overscroll-contain pt-2">
        {props.children}
      </div>
    </details>
  );
}
