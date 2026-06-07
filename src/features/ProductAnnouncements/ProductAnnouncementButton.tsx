import { MegaphoneIcon } from "@heroicons/react/24/outline"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Badge, IconButton } from "~/components/ui"
import { Popover, PopoverTrigger } from "~/components/ui/popover"
import { Sheet, SheetContent, SheetTrigger } from "~/components/ui/sheet"
import { useIsSmallScreen } from "~/hooks/useMediaQuery"
import { cn } from "~/lib/utils"

import {
  PRODUCT_ANNOUNCEMENT_ANALYTICS_ACTION_KINDS,
  trackProductAnnouncementAction,
} from "./analytics"
import {
  isProductAnnouncementOpenEvent,
  PRODUCT_ANNOUNCEMENT_OPEN_EVENT,
} from "./events"
import { useProductAnnouncements } from "./hooks/useProductAnnouncements"
import {
  getVisibleActiveProductAnnouncements,
  ProductAnnouncementPanel,
  ProductAnnouncementPopover,
} from "./ProductAnnouncementPopover"
import { PRODUCT_ANNOUNCEMENT_TEST_IDS } from "./testIds"

export type ProductAnnouncementButtonSurface = "options-header" | "popup-header"

interface ProductAnnouncementButtonProps {
  surface: ProductAnnouncementButtonSurface
  onlyWhenRisk?: boolean
  className?: string
}

/**
 * Renders the persistent product announcement header trigger with active risk badge state.
 */
export function ProductAnnouncementButton({
  surface,
  onlyWhenRisk = false,
  className,
}: ProductAnnouncementButtonProps) {
  const { t } = useTranslation("productAnnouncements")
  const isSmallScreen = useIsSmallScreen()
  const [open, setOpen] = useState(false)
  const { state, isLoading, markSeen, dismiss, restore } =
    useProductAnnouncements()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const preserveTriggerFocusOnOpenRef = useRef(false)
  const activeRiskCount = state.view.activeRiskCount
  const activeNotices = getVisibleActiveProductAnnouncements(state)
  const markSeenIdsRef = useRef<Set<string>>(new Set())
  const buttonLabel =
    activeRiskCount > 0
      ? t("actions.openWithRiskCount", { riskCount: activeRiskCount })
      : t("actions.open")

  const trackOpenList = useCallback(() => {
    trackProductAnnouncementAction({
      actionKind: PRODUCT_ANNOUNCEMENT_ANALYTICS_ACTION_KINDS.OpenList,
      activeCount: activeNotices.length,
      surface,
    })
  }, [activeNotices.length, surface])

  useEffect(() => {
    const handleOpenRequest = (event: Event) => {
      if (
        !isProductAnnouncementOpenEvent(event) ||
        event.detail.surface !== surface
      ) {
        return
      }

      triggerRef.current?.focus()
      preserveTriggerFocusOnOpenRef.current = true
      setOpen(true)
    }

    window.addEventListener(PRODUCT_ANNOUNCEMENT_OPEN_EVENT, handleOpenRequest)

    return () => {
      window.removeEventListener(
        PRODUCT_ANNOUNCEMENT_OPEN_EVENT,
        handleOpenRequest,
      )
    }
  }, [surface])

  useEffect(() => {
    if (!open) {
      return
    }

    const unseenActiveIds = activeNotices
      .filter((notice) => !notice.seen)
      .map((notice) => notice.id)
      .filter((id) => !markSeenIdsRef.current.has(id))

    if (unseenActiveIds.length === 0) {
      return
    }

    unseenActiveIds.forEach((id) => markSeenIdsRef.current.add(id))

    void markSeen(unseenActiveIds).then((success) => {
      if (success) {
        return
      }

      unseenActiveIds.forEach((id) => markSeenIdsRef.current.delete(id))
    })
  }, [activeNotices, markSeen, open])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        preserveTriggerFocusOnOpenRef.current = false
      }

      if (nextOpen && !open) {
        trackOpenList()
      }

      setOpen(nextOpen)
    },
    [open, trackOpenList],
  )

  const handleOpenAutoFocus = useCallback((event: Event) => {
    if (!preserveTriggerFocusOnOpenRef.current) {
      return
    }

    event.preventDefault()
    preserveTriggerFocusOnOpenRef.current = false
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
  }, [])

  const handleDismiss = useCallback(
    (id: string, revision: number) => {
      const notice = activeNotices.find((item) => item.id === id)
      trackProductAnnouncementAction({
        actionKind: PRODUCT_ANNOUNCEMENT_ANALYTICS_ACTION_KINDS.Dismiss,
        activeCount: activeNotices.length,
        ...(notice ? { notice } : {}),
        surface,
      })
      dismiss(id, revision)
    },
    [activeNotices, dismiss, surface],
  )

  const handleRestore = useCallback(
    (id: string) => {
      const notice = state.view.dismissedNotices.find((item) => item.id === id)
      trackProductAnnouncementAction({
        actionKind: PRODUCT_ANNOUNCEMENT_ANALYTICS_ACTION_KINDS.Restore,
        activeCount: activeNotices.length,
        ...(notice ? { notice } : {}),
        surface,
      })
      return restore(id)
    },
    [activeNotices.length, restore, state.view.dismissedNotices, surface],
  )

  const handleOpenCta = useCallback(
    (notice: (typeof activeNotices)[number]) => {
      trackProductAnnouncementAction({
        actionKind: PRODUCT_ANNOUNCEMENT_ANALYTICS_ACTION_KINDS.OpenCta,
        activeCount: activeNotices.length,
        notice,
        surface,
      })
    },
    [activeNotices.length, surface],
  )

  const shouldReserveSlot = onlyWhenRisk && surface === "popup-header"
  const shouldShowButton =
    !onlyWhenRisk || Boolean(state.view.primaryRiskNotice)
  const shouldUseSheet = surface === "popup-header" || isSmallScreen

  const triggerButton = (
    <IconButton
      ref={triggerRef}
      type="button"
      variant="outline"
      size="sm"
      aria-label={buttonLabel}
      data-testid={PRODUCT_ANNOUNCEMENT_TEST_IDS.button}
      className={cn("relative", className)}
    >
      <MegaphoneIcon className="h-4 w-4" />
      {activeRiskCount > 0 ? (
        <Badge
          variant="danger"
          size="sm"
          aria-hidden="true"
          data-testid={PRODUCT_ANNOUNCEMENT_TEST_IDS.badge}
          className="pointer-events-none absolute -top-1 -right-1 min-w-4 px-1 text-[0.6rem] leading-3"
        >
          {activeRiskCount > 99 ? "99+" : activeRiskCount}
        </Badge>
      ) : null}
    </IconButton>
  )

  const button = shouldShowButton ? (
    shouldUseSheet ? (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{triggerButton}</SheetTrigger>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="p-4"
          data-testid={PRODUCT_ANNOUNCEMENT_TEST_IDS.sheet}
          onOpenAutoFocus={handleOpenAutoFocus}
        >
          <ProductAnnouncementPanel
            surface="sheet"
            state={state}
            isLoading={isLoading}
            onDismiss={handleDismiss}
            onRestore={handleRestore}
            onOpenCta={handleOpenCta}
            onClose={handleClose}
          />
        </SheetContent>
      </Sheet>
    ) : (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
        <ProductAnnouncementPopover
          state={state}
          isLoading={isLoading}
          onDismiss={handleDismiss}
          onRestore={handleRestore}
          onOpenCta={handleOpenCta}
          onClose={handleClose}
          onOpenAutoFocus={handleOpenAutoFocus}
        />
      </Popover>
    )
  ) : null

  if (shouldReserveSlot) {
    return (
      <span
        aria-hidden={!shouldShowButton ? "true" : undefined}
        data-testid={PRODUCT_ANNOUNCEMENT_TEST_IDS.reservedSlot}
        className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center sm:h-8 sm:w-8",
          className,
        )}
      >
        {button}
      </span>
    )
  }

  return button
}
