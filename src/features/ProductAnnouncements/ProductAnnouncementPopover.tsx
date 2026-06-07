import { Archive, Bell, X } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, IconButton } from "~/components/ui"
import { PopoverContent } from "~/components/ui/popover"
import { SheetDescription, SheetTitle } from "~/components/ui/sheet"
import { cn } from "~/lib/utils"
import type { ProductAnnouncementRuntimeState } from "~/services/productAnnouncements/service"
import type { ProductAnnouncement } from "~/services/productAnnouncements/types"

import { ProductAnnouncementList } from "./ProductAnnouncementList"
import { PRODUCT_ANNOUNCEMENT_TEST_IDS } from "./testIds"

interface ProductAnnouncementPopoverProps {
  state: ProductAnnouncementRuntimeState
  isLoading: boolean
  onDismiss: (id: string, revision: number) => void
  onRestore: (id: string) => Promise<boolean>
  onOpenCta?: (notice: ProductAnnouncement) => void
  onClose: () => void
  onOpenAutoFocus?: (event: Event) => void
}

type ProductAnnouncementFilter = "active" | "dismissed"
type ProductAnnouncementPanelSurface = "popover" | "sheet"

/**
 * Resolves active notices, tolerating older or test fixtures that only populate the full notice list.
 */
export function getVisibleActiveProductAnnouncements(
  state: ProductAnnouncementRuntimeState,
) {
  if (state.view.activeNotices.length > 0) {
    return state.view.activeNotices
  }

  return state.view.notices.filter((notice) => !notice.dismissed)
}

interface ProductAnnouncementPanelProps
  extends Omit<ProductAnnouncementPopoverProps, "onOpenAutoFocus"> {
  surface: ProductAnnouncementPanelSurface
}

/**
 * Renders shared announcement panel content for popover and sheet surfaces.
 */
function ProductAnnouncementPanel({
  surface,
  state,
  isLoading,
  onDismiss,
  onRestore,
  onOpenCta,
  onClose,
}: ProductAnnouncementPanelProps) {
  const { t } = useTranslation("productAnnouncements")
  const [filter, setFilter] = useState<ProductAnnouncementFilter>("active")
  const activeNotices = getVisibleActiveProductAnnouncements(state)
  const visibleNotices =
    filter === "active" ? activeNotices : state.view.dismissedNotices
  const handleRestore = async (id: string) => {
    await onRestore(id)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        {surface === "sheet" ? (
          <SheetTitle className="dark:text-dark-text-primary truncate text-base text-gray-900">
            {t("title")}
          </SheetTitle>
        ) : (
          <h2 className="dark:text-dark-text-primary truncate text-base font-semibold text-gray-900">
            {t("title")}
          </h2>
        )}
        {surface === "sheet" ? (
          <SheetDescription className="sr-only">
            {t("empty.active")}
          </SheetDescription>
        ) : null}
        <IconButton
          type="button"
          variant="ghost"
          size="xs"
          aria-label={t("actions.close")}
          data-testid={PRODUCT_ANNOUNCEMENT_TEST_IDS.closeButton}
          className="dark:hover:text-dark-text-primary shrink-0 text-gray-500 hover:text-gray-900 dark:text-gray-400"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </IconButton>
      </div>
      <div className="dark:bg-dark-bg-tertiary grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
        <Button
          type="button"
          variant={filter === "active" ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "h-8 min-w-0 gap-1.5 px-3 text-xs",
            filter === "active" && "dark:bg-dark-bg-primary bg-white shadow-sm",
          )}
          aria-pressed={filter === "active"}
          onClick={() => setFilter("active")}
        >
          <Bell className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{t("filters.active")}</span>
        </Button>
        <Button
          type="button"
          variant={filter === "dismissed" ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "h-8 min-w-0 gap-1.5 px-3 text-xs",
            filter === "dismissed" &&
              "dark:bg-dark-bg-primary bg-white shadow-sm",
          )}
          aria-pressed={filter === "dismissed"}
          onClick={() => setFilter("dismissed")}
        >
          <Archive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{t("filters.dismissed")}</span>
        </Button>
      </div>
      <ProductAnnouncementList
        notices={visibleNotices}
        emptyMessage={
          filter === "active" ? t("empty.active") : t("empty.dismissed")
        }
        isLoading={isLoading}
        testId={
          filter === "active"
            ? PRODUCT_ANNOUNCEMENT_TEST_IDS.activeList
            : PRODUCT_ANNOUNCEMENT_TEST_IDS.dismissedList
        }
        onDismiss={onDismiss}
        onRestore={handleRestore}
        onOpenCta={onOpenCta}
      />
    </div>
  )
}

/**
 * Shows active and dismissed product announcements in a compact popover panel.
 */
export function ProductAnnouncementPopover({
  state,
  isLoading,
  onDismiss,
  onRestore,
  onOpenCta,
  onClose,
  onOpenAutoFocus,
}: ProductAnnouncementPopoverProps) {
  return (
    <PopoverContent
      align="end"
      className="flex max-h-[min(var(--radix-popover-content-available-height,32rem),70vh,32rem)] w-[min(calc(100vw-2rem),28rem)] max-w-[calc(100vw-2rem)] flex-col p-4"
      data-testid={PRODUCT_ANNOUNCEMENT_TEST_IDS.popover}
      onOpenAutoFocus={onOpenAutoFocus}
    >
      <ProductAnnouncementPanel
        surface="popover"
        state={state}
        isLoading={isLoading}
        onDismiss={onDismiss}
        onRestore={onRestore}
        onOpenCta={onOpenCta}
        onClose={onClose}
      />
    </PopoverContent>
  )
}

export { ProductAnnouncementPanel }
