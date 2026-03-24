"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "@renderer/lib/utils"

function Switch({
  className,
  size = "default",
  style,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  // Calculate dimensions based on size
  const dimensions = React.useMemo(() => {
    const trackWidth = size === "sm" ? 32 : 40 // w-8 or w-10
    const trackHeight = size === "sm" ? 16 : 20 // h-4 or h-5
    const thumbSize = size === "sm" ? 10 : 12 // size-2.5 or size-3
    const padding = 2 // px-[2px]
    const thumbTravel = trackWidth - thumbSize - (padding * 2)
    
    return {
      '--switch-track-width': `${trackWidth}px`,
      '--switch-track-height': `${trackHeight}px`,
      '--switch-thumb-size': `${thumbSize}px`,
      '--switch-thumb-travel': `${thumbTravel}px`,
    } as React.CSSProperties
  }, [size])

  const switchStyle = React.useMemo(
    () => ({
      ...style,
      ...dimensions,
    }),
    [dimensions, style]
  )

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      style={switchStyle}
      className={cn(
        "peer group/switch inline-flex shrink-0 items-center rounded-none border border-border bg-input transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
        "h-[var(--switch-track-height)] w-[var(--switch-track-width)]",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-border",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-none bg-background ring-0 transition-transform",
          "size-[var(--switch-thumb-size)]",
          "data-[state=checked]:translate-x-[var(--switch-thumb-travel)]",
          "data-[state=unchecked]:translate-x-[2px]",
          "my-auto"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
