import { Archive, Bell, X } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button, IconButton } from "~/components/ui"
import { PopoverContent } from "~/components/ui/popover"
import { SheetDescription, SheetTitle } from "~/components/ui/sheet"
import { CORNERS } from "~/constants/designTokens"
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
    <div className="gap-y-density-4 flex min-h-0 flex-1 flex-col gap-x-4 overflow-hidden">
      <div className="gap-y-density-3 flex items-center justify-between gap-x-3">
        {surface === "sheet" ? (
          <SheetTitle className="text-foreground truncate text-base">
            {t("title")}
          </SheetTitle>
        ) : (
          <h2 className="text-foreground truncate text-base font-semibold">
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
          className="text-muted-foreground hover:text-foreground shrink-0"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </IconButton>
      </div>
      <div
        className={`dark:bg-secondary corners-concentric bg-muted gap-y-density-1 py-density-1 grid grid-cols-2 gap-x-1 rounded-md px-1 [--corner-inset:--spacing(1)] ${CORNERS.buttonItems}`}
      >
        <Button
          type="button"
          variant={filter === "active" ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "gap-y-density-1-5 min-h-(--density-control-sm) min-w-0 gap-x-1.5 px-3 text-xs",
            filter === "active" && "dark:bg-background bg-card shadow-sm",
          )}
          aria-pressed={filter === "active"}
          onClick={() => setFilter("active")}
          data-testid={PRODUCT_ANNOUNCEMENT_TEST_IDS.activeTab}
        >
          <Bell className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{t("filters.active")}</span>
        </Button>
        <Button
          type="button"
          variant={filter === "dismissed" ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "gap-y-density-1-5 min-h-(--density-control-sm) min-w-0 gap-x-1.5 px-3 text-xs",
            filter === "dismissed" && "dark:bg-background bg-card shadow-sm",
          )}
          aria-pressed={filter === "dismissed"}
          onClick={() => setFilter("dismissed")}
          data-testid={PRODUCT_ANNOUNCEMENT_TEST_IDS.dismissedTab}
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
      className="py-density-4 flex max-h-[min(var(--radix-popover-content-available-height,32rem),70vh,32rem)] w-[min(calc(100vw-2rem),28rem)] max-w-[calc(100vw-2rem)] flex-col px-4"
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
