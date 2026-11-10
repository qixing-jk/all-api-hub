import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import * as React from "react"

import { Z_INDEX } from "~/constants/designTokens"
import { cn } from "~/lib/utils"
import { t } from "~/utils/i18n/core"

import { ToasterPortalHost } from "../toast/ToasterPortal"
import { ActionGroup } from "./ActionGroup"
import { Button } from "./button"
import { FloatingLayerProvider } from "./floating-layer"

/**
 * Dialog provides the preferred Radix/shadcn modal root for new dialogs.
 */
function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

/**
 * DialogTrigger toggles the dialog open state when activated.
 */
function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

/**
 * DialogPortal renders dialog content in a React portal.
 */
function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

/**
 * DialogClose closes the dialog when interacted with.
 */
function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/**
 * DialogOverlay renders the translucent backdrop behind the dialog content.
 */
function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "dialog-fade fixed inset-0 bg-overlay/50",
        Z_INDEX.modal,
        className,
      )}
      {...props}
    />
  )
}

/**
 * DialogContent positions and animates the dialog surface with optional close button.
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <ToasterPortalHost />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "dialog-fade fixed top-[50%] left-[50%] grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-density-4 rounded-2xl border bg-popover px-6 py-density-6 text-popover-foreground shadow-lg outline-none sm:max-w-lg",
          Z_INDEX.modal,
          className,
        )}
        {...props}
      >
        <FloatingLayerProvider layer="modal-contained">
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
            >
              <XIcon />
              <span className="sr-only">{t("common:actions.close")}</span>
            </DialogPrimitive.Close>
          )}
        </FloatingLayerProvider>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

/**
 * DialogHeader lays out title and description at the top of dialog content.
 */
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-col gap-density-2 text-center sm:text-left",
        className,
      )}
      {...props}
    />
  )
}

/**
 * DialogFooter arranges action buttons at the bottom of dialog content.
 */
function DialogFooter({
  className,
  children,
  showCloseButton = false,
  closeLabel,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
  closeLabel?: React.ReactNode
}) {
  return (
    <ActionGroup
      data-slot="dialog-footer"
      layout="stack-on-narrow"
      className={cn("gap-density-2", className)}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button type="button">
            {closeLabel ?? t("common:actions.close")}
          </Button>
        </DialogPrimitive.Close>
      )}
    </ActionGroup>
  )
}

/**
 * DialogTitle displays the dialog title text with semantic markup.
 */
function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

/**
 * DialogDescription renders supporting text beneath the dialog title.
 */
function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
