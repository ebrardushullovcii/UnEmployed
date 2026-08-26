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
   * @deprecated Ignored. The visible eyebrow was removed from the page
   * grammar.
   */
  eyebrow?: string;
  title: string;
}

export function PageHeader({ actions, description, title }: PageHeaderProps) {
  return (
    <header
      className="grid min-w-0 gap-1 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-baseline lg:gap-x-4"
      data-page-header
    >
      <div className="grid min-w-0 gap-1">
        <h1 className="max-w-[24ch] font-display text-(length:--text-page-title-compact) font-semibold leading-none tracking-(--tracking-page-title-compact) text-(--headline-primary)">
          {title}
        </h1>
        <p className="max-w-[68ch] text-(length:--text-page-description-compact) leading-5 text-foreground-soft">
          {description}
        </p>
      </div>
      {actions ? (
        <div
          className="flex min-w-0 flex-wrap items-center justify-start gap-2 lg:justify-end"
          data-page-header-actions
        >
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function PageHeaderStack(
  props: PageHeaderProps & { subnav?: ReactNode },
) {
  const { subnav, ...headerProps } = props;

  return (
    <div className="mb-(--gap-page-header-body)" data-page-header-stack>
      <PageHeader {...headerProps} />
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
