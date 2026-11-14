import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"
import * as React from "react"

import { Z_INDEX } from "~/constants/designTokens"
import { cn } from "~/lib/utils"
import { t } from "~/utils/i18n/core"

import { FloatingLayerProvider } from "./floating-layer"

/**
 * Sheet provides a Radix dialog root for edge-anchored modal panels.
 */
function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

/**
 * SheetTrigger toggles the sheet when activated.
 */
function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

/**
 * SheetClose closes the active sheet from inside its content.
 */
function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

/**
 * SheetPortal renders sheet layers outside the normal DOM tree.
 */
function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

/**
 * SheetOverlay blocks background interaction while the sheet is open.
 */
function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 bg-overlay/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        Z_INDEX.modal,
        className,
      )}
      {...props}
    />
  )
}

/**
 * SheetContent renders the edge-anchored modal surface with an optional close button.
 */
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  portalContainer,
  overlayClassName,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  portalContainer?: Element | DocumentFragment | null
  overlayClassName?: string
}) {
  return (
    <SheetPortal container={portalContainer}>
      <SheetOverlay className={overlayClassName} />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        data-close-button={showCloseButton ? "" : undefined}
        className={cn(
          "group/sheet",
          "fixed flex flex-col gap-x-4 gap-y-density-4 overflow-hidden bg-popover text-popover-foreground shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500",
          Z_INDEX.modal,
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
          side === "top" &&
            "inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          className,
        )}
        {...props}
      >
        <FloatingLayerProvider layer="modal-contained">
          {children}
          {showCloseButton && (
            <SheetPrimitive.Close className="absolute top-4 right-4 inline-flex size-(--density-control-xs) items-center justify-center rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-secondary">
              <XIcon className="size-4" />
              <span className="sr-only">{t("common:actions.close")}</span>
            </SheetPrimitive.Close>
          )}
        </FloatingLayerProvider>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

/**
 * SheetHeader groups the title and supporting text.
 */
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex flex-col gap-x-1.5 gap-y-density-1-5 px-4 py-density-4 group-data-[close-button]/sheet:pr-[calc(var(--density-control-xs)+1.5rem)]",
        className,
      )}
      {...props}
    />
  )
}

/**
 * SheetFooter arranges actions at the bottom of sheet content.
 */
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "mt-auto flex flex-col gap-x-2 gap-y-density-2 px-4 py-density-4",
        className,
      )}
      {...props}
    />
  )
}

/**
 * SheetTitle provides the accessible sheet title.
 */
function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-xl font-semibold text-foreground", className)}
      {...props}
    />
  )
}

/**
 * SheetDescription provides the accessible sheet description.
 */
function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetDescription,
}
