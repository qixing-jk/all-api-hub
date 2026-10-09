import { X } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Z_INDEX } from "~/constants/designTokens"
import { cn } from "~/lib/utils"

export interface ImageLightboxProps {
  isOpen: boolean
  onClose: () => void
  src?: string
  alt: string
  title?: string
  fallback?: ReactNode
  footer?: ReactNode
}

/** Keeps image failure local to one mounted source and permits a useful recovery view. */
function LightboxImage({
  src,
  alt,
  fallback,
}: Pick<ImageLightboxProps, "src" | "alt" | "fallback">) {
  const [failed, setFailed] = useState(false)
  if (!src || (failed && fallback)) return fallback
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      className="max-h-[70vh] w-auto max-w-full rounded-xl object-contain select-none"
    />
  )
}

/**
 * ImageLightbox renders an in-page, full-resolution image zoom viewer with a
 * dimmed backdrop. Unlike structured form dialogs, it provides a clean,
 * distraction-free image inspection surface that dismisses instantly on
 * click-away or Escape.
 */
export function ImageLightbox({
  isOpen,
  onClose,
  src,
  alt,
  title,
  fallback,
  footer,
}: ImageLightboxProps) {
  const { t } = useTranslation(["ui", "common"])

  return (
    <DialogPrimitive.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="lightbox-overlay"
          className={cn(
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 bg-overlay/80 fixed inset-0 cursor-zoom-out backdrop-blur-xs duration-200",
            Z_INDEX.modal,
          )}
        />
        <DialogPrimitive.Content
          data-slot="lightbox-content"
          data-testid="image-lightbox-content"
          onClick={onClose}
          className={cn(
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 flex cursor-zoom-out flex-col items-center justify-center p-4 duration-200 outline-none",
            Z_INDEX.modal,
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {title ?? alt}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {alt}
          </DialogPrimitive.Description>
          <div
            className="border-border bg-card relative max-h-[85vh] max-w-2xl cursor-auto overflow-auto rounded-2xl border p-2 shadow-2xl transition-transform select-text"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              data-testid="image-lightbox-close"
              onClick={onClose}
              aria-label={t("common:actions.close")}
              className="bg-card text-foreground border-border hover:bg-muted focus-visible:ring-ring absolute top-3 right-3 z-10 flex size-8 cursor-pointer items-center justify-center rounded-full border shadow-md transition-all outline-none hover:scale-105 focus-visible:ring-2"
            >
              <X className="size-4" />
            </button>
            <LightboxImage key={src} src={src} alt={alt} fallback={fallback} />
            {footer}
          </div>
          <p
            className="text-muted-foreground mt-3 cursor-auto text-xs select-text"
            onClick={(event) => event.stopPropagation()}
          >
            {t("ui:feedback.clickAnywhereToClose")}
          </p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
