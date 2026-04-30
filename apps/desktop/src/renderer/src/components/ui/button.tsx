import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@renderer/lib/utils";

const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap transition-[background-color,border-color,color,opacity,box-shadow,transform] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:border-border/55 disabled:text-foreground-muted disabled:shadow-none disabled:saturate-75 disabled:opacity-65 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "border border-primary/20 bg-primary text-primary-foreground shadow-[inset_0_1px_0_var(--focus-inset-highlight)] hover:opacity-90",
        destructive:
          "border border-destructive/35 bg-destructive text-destructive-foreground hover:opacity-90 focus-visible:ring-destructive/20",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        secondary:
          "border border-border bg-secondary text-secondary-foreground hover:bg-surface-strong",
        ghost:
          "border border-transparent bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-10 px-5 text-[11px] font-bold uppercase tracking-(--tracking-badge) has-[>svg]:px-4",
        compact:
          "h-8 px-3 text-[10px] font-bold uppercase tracking-(--tracking-badge) has-[>svg]:px-2.5",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

function Button({
  children,
  className,
  variant = "primary",
  size = "default",
  asChild = false,
  disabled,
  pending = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    pending?: boolean;
  }) {
  const resolvedVariant = variant ?? "primary";
  const resolvedSize = size ?? "default";
  const isDisabled = disabled || pending;
  const { onClick, onKeyDown, tabIndex, ...restProps } = props;
  const sharedClassName = cn(
    buttonVariants({ variant: resolvedVariant, size: resolvedSize }),
    pending && "overflow-hidden",
    className,
  );
  const handlePendingClick = React.useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!isDisabled) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    },
    [isDisabled],
  );
  const handlePendingKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (!isDisabled) {
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [isDisabled],
  );
  const pendingRail = pending ? (
    <span
      key="pending-rail"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-(--button-pending-rail-track)"
    >
      <span className="button-pending-rail absolute inset-y-0 left-[-35%] w-[35%] rounded-full bg-[linear-gradient(90deg,transparent,var(--button-pending-rail),transparent)]" />
    </span>
  ) : null;

  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<
      React.HTMLAttributes<HTMLElement> & {
        children?: React.ReactNode;
        className?: string;
        [key: `data-${string}`]: string | undefined;
      }
    >;
    const childProps = child.props;
    const resolvedOnClick = isDisabled
      ? handlePendingClick
      : childProps.onClick ?? onClick;
    const resolvedOnKeyDown = isDisabled
      ? handlePendingKeyDown
      : childProps.onKeyDown ?? onKeyDown;
    const clonedChildProps = {
      ...(pending ? { "aria-busy": true as const, "data-pending": "true" } : {}),
      ...(isDisabled ? { "aria-disabled": true as const, tabIndex: -1 } : {}),
      "data-slot": "button",
      "data-variant": resolvedVariant,
      "data-size": resolvedSize,
      className: cn(sharedClassName, childProps.className),
      ...(resolvedOnClick ? { onClick: resolvedOnClick } : {}),
      ...(resolvedOnKeyDown ? { onKeyDown: resolvedOnKeyDown } : {}),
      ...(!isDisabled && tabIndex !== undefined ? { tabIndex } : {}),
    };

    return React.cloneElement(child, {
      ...clonedChildProps,
      children: [childProps.children, pendingRail],
    });
  }

  return (
    <button
      aria-busy={pending || undefined}
      data-slot="button"
      data-pending={pending ? "true" : undefined}
      data-variant={resolvedVariant}
      data-size={resolvedSize}
      className={sharedClassName}
      disabled={isDisabled}
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={tabIndex}
      {...restProps}
    >
      <span
        className={cn(
          "relative z-10 inline-flex items-center justify-center gap-2",
          pending && "translate-y-[-0.5px]",
        )}
      >
        {children}
      </span>
      {pendingRail}
    </button>
  );
}

export { Button, buttonVariants };
