import * as React from "react";

import { cn } from "@renderer/lib/utils";

/**
 * The canonical one-of-N inline switcher.
 *
 * Eight hand-rolled tab strips and segmented groups existed before this: the
 * density switcher was written three ways inside a single file, and six route
 * switchers carried six tracks, six radii and six selected channels. This is
 * the one implementation - one track, one height from the published control
 * scale, one radius token, one border token, and exactly one selected
 * treatment (filled `secondary` plus an inset primary bar, so the state is
 * never carried by hue alone).
 *
 * Each segment is an ordinary `aria-pressed` button rather than a
 * `role="radio"` inside a radiogroup. That is deliberate and settled: the
 * Settings theme switcher shipped as `role="radio"` and UI automation could
 * not click it, so it was converted to `aria-pressed` buttons. Plain buttons
 * also stay individually tabbable, so keyboard users reach every option with
 * Tab and activate with Enter or Space without a roving-tabindex contract.
 * Arrow keys additionally move between segments for pointer-free scanning.
 */
export interface SegmentedControlOption<TValue extends string> {
  readonly value: TValue;
  readonly label: React.ReactNode;
  /** Accessible name when `label` is an icon or an abbreviation. */
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly title?: string;
}

export type SegmentedControlSize = "toolbar" | "field";

const SEGMENTED_CONTROL_TRACK_SIZE_CLASS = {
  toolbar: "h-8",
  field: "h-11",
} as const satisfies Record<SegmentedControlSize, string>;

const SEGMENTED_CONTROL_SEGMENT_SIZE_CLASS = {
  toolbar: "px-2.5 text-xs",
  field: "px-3.5 text-sm",
} as const satisfies Record<SegmentedControlSize, string>;

function SegmentedControl<TValue extends string>({
  className,
  label,
  onValueChange,
  options,
  segmentClassName,
  size = "toolbar",
  value,
  ...props
}: Omit<React.ComponentProps<"div">, "onChange"> & {
  /** Accessible name for the group. Required: the group is never unlabelled. */
  label: string;
  onValueChange: (value: TValue) => void;
  options: readonly SegmentedControlOption<TValue>[];
  segmentClassName?: string;
  size?: SegmentedControlSize;
  value: TValue;
}) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
      const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
      if (!forward && !backward) {
        return;
      }

      const track = trackRef.current;
      if (!track) {
        return;
      }

      const segments = [
        ...track.querySelectorAll<HTMLButtonElement>(
          "button[data-slot='segmented-control-segment']:not([disabled])",
        ),
      ];
      if (segments.length < 2) {
        return;
      }

      const activeIndex = segments.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      if (activeIndex === -1) {
        return;
      }

      event.preventDefault();
      const nextIndex =
        (activeIndex + (forward ? 1 : -1) + segments.length) % segments.length;
      segments[nextIndex]?.focus();
    },
    [],
  );

  return (
    <div
      aria-label={label}
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-0.5 overflow-hidden rounded-(--radius-button) border border-(--control-border) bg-transparent p-0.5",
        SEGMENTED_CONTROL_TRACK_SIZE_CLASS[size],
        className,
      )}
      data-size={size}
      data-slot="segmented-control"
      onKeyDown={handleKeyDown}
      ref={trackRef}
      role="group"
      {...props}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            aria-label={option.ariaLabel}
            aria-pressed={selected}
            className={cn(
              "inline-flex h-full min-w-0 shrink-0 items-center justify-center gap-1.5 rounded-(--radius-button) border border-transparent whitespace-nowrap font-medium transition-[background-color,border-color,color] outline-none focus-visible:ring-2 focus-visible:ring-ring",
              SEGMENTED_CONTROL_SEGMENT_SIZE_CLASS[size],
              selected
                ? "bg-secondary text-foreground shadow-[inset_0_-2px_0_var(--primary)]"
                : "text-foreground-soft hover:bg-secondary hover:text-foreground",
              "disabled:cursor-not-allowed disabled:border-(--disabled-border) disabled:bg-(--disabled-surface) disabled:text-(--disabled-foreground) disabled:opacity-100",
              segmentClassName,
            )}
            data-slot="segmented-control-segment"
            data-state={selected ? "on" : "off"}
            data-value={option.value}
            disabled={option.disabled}
            key={option.value}
            onClick={() => {
              if (option.disabled || selected) {
                return;
              }

              onValueChange(option.value);
            }}
            title={option.title}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export {
  SegmentedControl,
  SEGMENTED_CONTROL_SEGMENT_SIZE_CLASS,
  SEGMENTED_CONTROL_TRACK_SIZE_CLASS,
};
