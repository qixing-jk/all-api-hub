import { Popover as PopoverPrimitive } from "radix-ui"
import * as React from "react"

import { cn } from "~/lib/utils"

import { useFloatingLayerClass } from "./floating-layer"

/**
 * Popover provides a Radix-based floating panel container.
 */
function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

/**
 * PopoverTrigger toggles the popover when activated.
 */
function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

/**
 * PopoverContent renders the positioned popover surface with animation.
 *
 * By default, the content width matches the trigger width via Radix Popper anchor
 * width CSS variable, so dropdown-like popovers align cleanly with their trigger.
 */
function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  container,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> & {
  /**
   * Optional portal container for the popover content.
   *
   * Useful when rendering inside a ShadowRoot where global document portals
   * would escape styling and z-index constraints.
   */
  container?: HTMLElement
}) {
  const floatingLayerClass = useFloatingLayerClass()

  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "w-(--radix-popper-anchor-width) origin-(--radix-popover-content-transform-origin) rounded-lg border bg-popover px-4 py-density-4 text-popover-foreground shadow-md outline-hidden [--popover-inner-radius:max(0px,calc(var(--corner-radius)-1px))] data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          floatingLayerClass,
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

/**
 * PopoverAnchor sets a custom anchor element for positioning.
 */
function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

/** Groups a popover heading and supporting description. */
function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-density-1", className)}
      {...props}
    />
  )
}

/** A semantic heading; the caller connects its id to PopoverContent. */
function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="popover-title"
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  )
}

/** Supporting text; the caller connects its id through aria-describedby. */
function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
}
