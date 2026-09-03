import type { ComponentProps, ReactNode } from "react";

import { cn } from "@renderer/lib/cn";

interface PageHeaderProps {
  /**
   * @deprecated Ignored. Kept only so un-migrated exception screens
   * (Profile, Settings, Shortlisted) keep typechecking until they migrate.
   */
  compact?: boolean;
  actions?: ReactNode;
  description: string;
  /**
   * Keep action-heavy headers stacked through the compact desktop breakpoint
   * so the title block always retains a readable column.
   */
  layout?: "default" | "stacked-until-xl";
  /**
   * @deprecated Ignored. The visible eyebrow was removed from the page
   * grammar.
   */
  eyebrow?: string;
  /**
   * Optional supporting facts about the current route (for example the
   * configured search scope). It belongs to the title block, not the action
   * row, so a compact width never leaves a gap between wrapped meta text and a
   * right-aligned primary action.
   */
  meta?: ReactNode;
  title: string;
}

export function PageHeader({
  actions,
  description,
  layout = "default",
  meta,
  title,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "grid min-w-0 gap-1",
        layout === "stacked-until-xl"
          ? "xl:grid-cols-[minmax(0,1fr)_auto] xl:items-baseline xl:gap-x-4"
          : "lg:grid-cols-[minmax(0,1fr)_auto] lg:items-baseline lg:gap-x-4",
      )}
      data-page-header
    >
      <div className="grid min-w-0 gap-1">
        <h1 className="max-w-[24ch] font-display text-(length:--text-page-title-compact) font-semibold leading-none tracking-(--tracking-page-title-compact) text-(--headline-primary)">
          {title}
        </h1>
        <p className="max-w-[68ch] text-(length:--text-page-description-compact) leading-5 text-foreground-soft">
          {description}
        </p>
        {meta ? (
          <div
            className="min-w-0 max-w-[68ch] text-(length:--text-small) text-foreground-muted"
            data-page-header-meta
          >
            {meta}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div
          className={cn(
            "flex min-w-0 flex-wrap items-center justify-start gap-2",
            // Right alignment only once the actions actually share a row with
            // the title. While the header is stacked, an end-aligned button
            // strands a wide empty band beside itself.
            layout === "stacked-until-xl" ? "xl:justify-end" : "lg:justify-end",
          )}
          data-page-header-actions
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function PageHeaderStack(
  props: PageHeaderProps & {
    status?: ReactNode;
    subnav?: ReactNode;
  },
) {
  const { status, subnav, ...headerProps } = props;

  return (
    <div className="mb-(--gap-page-header-body)" data-page-header-stack>
      <PageHeader {...headerProps} />
      {status ? (
        <div
          className="mt-(--gap-page-header-aux) min-w-0 w-full"
          data-page-header-status
        >
          {status}
        </div>
      ) : null}
      {subnav ? (
        <div className="mt-(--gap-page-header-aux)" data-page-header-subnav>
          {subnav}
        </div>
      ) : null}
      <div
        aria-hidden="true"
        className="mt-(--gap-page-header-aux) border-b border-(--surface-panel-border)"
        data-page-header-divider
      />
    </div>
  );
}

export function PageSubnav({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}
      data-page-subnav
      {...props}
    />
  );
}
