import { motion, useReducedMotion } from "framer-motion"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { useEffect, type ComponentType } from "react"
import { useTranslation } from "react-i18next"

import { Button, Heading3 } from "~/components/ui"
import { Z_INDEX } from "~/constants/designTokens"
import type {
  OptionsMenuCategoryId,
  OptionsPageMenuItemId,
} from "~/constants/optionsMenuIds"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import {
  getMenuCategoryLabel,
  getMenuItemLabel,
} from "~/features/OptionsMenu/getMenuItemLabel"
import {
  PRODUCT_TOUR_CATEGORY_TARGETS,
  PRODUCT_TOUR_TARGET_ATTRIBUTE,
  PRODUCT_TOUR_TARGETS,
} from "~/features/ProductTour/constants"
import { cn } from "~/lib/utils"

export interface SidebarProps {
  menuItems: Array<{
    id: OptionsPageMenuItemId
    category?: OptionsMenuCategoryId
    icon: ComponentType<{ className?: string }>
  }>
  isCollapsePending?: boolean
  activeMenuItem: string
  onMenuItemClick: (itemId: string) => void
  onMenuItemPreload?: (itemId: OptionsPageMenuItemId) => void
  isMobileOpen?: boolean
  onMobileClose?: () => void
  isCollapsed?: boolean
  onCollapseToggle?: () => void
}

const DESKTOP_WIDTH = 240
const COLLAPSED_WIDTH = 64
const MOBILE_WIDTH = 256

/**
 * Animated sidebar for the Options page, supporting collapse and mobile overlay.
 * Handles menu rendering, accessibility labels, and user preference filters.
 * @param props Component props container.
 * @param props.menuItems Available navigation entries from the route catalog.
 * @param props.isCollapsePending Whether the desktop layout preference is saving.
 * @param props.activeMenuItem Currently selected menu id.
 * @param props.onMenuItemClick Callback fired when user picks another menu item.
 * @param props.onMenuItemPreload Starts loading a page before it is selected.
 * @param props.isMobileOpen Whether the drawer is visible on mobile screens.
 * @param props.onMobileClose Close handler for the mobile drawer mask.
 * @param props.isCollapsed Whether the sidebar is collapsed on desktop.
 * @param props.onCollapseToggle Toggles collapsed state when collapse button clicked.
 */
function OptionsSidebar({
  menuItems,
  isCollapsePending = false,
  activeMenuItem,
  onMenuItemClick,
  onMenuItemPreload,
  isMobileOpen,
  onMobileClose,
  isCollapsed = false,
  onCollapseToggle,
}: SidebarProps) {
  const { t } = useTranslation("ui")
  const { preferences } = useUserPreferencesContext()
  const shouldReduceMotion = useReducedMotion()
  const shouldShowCollapsedState = isCollapsed && !isMobileOpen

  const menuGroups = menuItems.reduce<
    Array<{
      category: (typeof menuItems)[number]["category"]
      items: typeof menuItems
    }>
  >((groups, item) => {
    const previousGroup = groups[groups.length - 1]

    if (previousGroup && previousGroup.category === item.category) {
      previousGroup.items.push(item)
    } else {
      groups.push({ category: item.category, items: [item] })
    }

    return groups
  }, [])

  const targetWidth = isMobileOpen
    ? MOBILE_WIDTH
    : shouldShowCollapsedState
      ? COLLAPSED_WIDTH
      : DESKTOP_WIDTH
  const navAriaLabel = shouldShowCollapsedState
    ? t("navigation.sidebarCollapsedHint")
    : t("navigation.settingsOptions")
  const collapseButtonLabel = isMobileOpen
    ? t("common:actions.close")
    : shouldShowCollapsedState
      ? t("navigation.expandSidebar")
      : t("navigation.collapseSidebar")
  const sidebarHeight = isMobileOpen
    ? "100vh"
    : "calc(100vh - var(--options-header-height))"
  const sidebarTop = isMobileOpen ? undefined : "var(--options-header-height)"

  const handleCollapseButtonClick = () => {
    if (isMobileOpen && onMobileClose) {
      onMobileClose()
      return
    }
    if (isCollapsePending) return
    onCollapseToggle?.()
  }

  // 移动端打开时禁止背景滚动
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isMobileOpen])

  return (
    <>
      {/* 移动端遮罩层 */}
      {isMobileOpen && (
        <div
          className={cn(
            "bg-overlay/20 fixed inset-0 md:hidden",
            Z_INDEX.backdrop,
          )}
          onClick={onMobileClose}
        />
      )}

      {/* 侧边栏 */}
      <motion.aside
        initial={false}
        animate={{ width: targetWidth }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: "easeOut" }}
        style={{ height: sidebarHeight, top: sidebarTop }}
        className={cn(
          "shrink-0 transform transition-transform duration-300 ease-in-out motion-reduce:transition-none",
          Z_INDEX.sidebar,
          isMobileOpen
            ? "fixed inset-y-0 left-0 translate-x-0"
            : "fixed inset-y-0 left-0 -translate-x-full md:translate-x-0",
          "md:sticky md:inset-auto md:left-auto md:translate-x-0 md:self-start md:overflow-visible",
        )}
        {...{
          [PRODUCT_TOUR_TARGET_ATTRIBUTE]: PRODUCT_TOUR_TARGETS.Navigation,
        }}
      >
        {onCollapseToggle && !isMobileOpen && (
          <Button
            aria-label={collapseButtonLabel}
            title={collapseButtonLabel}
            aria-expanded={!shouldShowCollapsedState}
            variant="ghost"
            size="icon-sm"
            aria-disabled={isCollapsePending}
            onClick={handleCollapseButtonClick}
            style={{ top: "calc(50vh - var(--options-header-height))" }}
            className="border-sidebar-border bg-sidebar text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground absolute right-0 z-10 hidden h-13 w-6 translate-x-1/2 -translate-y-1/2 rounded-full border shadow-sm md:inline-flex"
          >
            {shouldShowCollapsedState ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronLeft className="size-3.5" />
            )}
          </Button>
        )}
        <div className="h-full overflow-hidden">
          <div
            style={{ width: targetWidth }}
            className="border-workspace-border bg-sidebar text-sidebar-foreground flex h-full flex-col border-r"
          >
            {isMobileOpen && (
              <div className="py-density-2 flex shrink-0 items-center justify-end px-3">
                <Button
                  aria-label={collapseButtonLabel}
                  title={collapseButtonLabel}
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg"
                  onClick={handleCollapseButtonClick}
                >
                  <X className="size-4" />
                </Button>
              </div>
            )}

            <nav
              aria-label={navAriaLabel}
              className="py-density-4 space-y-density-2 min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
            >
              {menuGroups.map((group, groupIndex) => {
                const categoryLabel = group.category
                  ? getMenuCategoryLabel(t, group.category)
                  : null
                const categoryHeadingId = group.category
                  ? `options-menu-category-${group.category}`
                  : undefined

                return (
                  <section
                    key={group.category ?? `uncategorized-${groupIndex}`}
                    aria-label={
                      shouldShowCollapsedState || !categoryHeadingId
                        ? categoryLabel ?? navAriaLabel
                        : undefined
                    }
                    aria-labelledby={
                      !shouldShowCollapsedState ? categoryHeadingId : undefined
                    }
                    className="mx-2"
                    {...{
                      [PRODUCT_TOUR_TARGET_ATTRIBUTE]:
                        group.category && !shouldShowCollapsedState
                          ? PRODUCT_TOUR_CATEGORY_TARGETS[group.category]
                          : undefined,
                    }}
                  >
                    {shouldShowCollapsedState && groupIndex > 0 && (
                      <div
                        aria-hidden="true"
                        className="bg-sidebar-border mb-density-3 mx-auto h-px w-5"
                      />
                    )}
                    {categoryLabel && !shouldShowCollapsedState && (
                      <div className="min-h-density-8 py-density-1 flex items-center px-3">
                        <Heading3
                          id={categoryHeadingId}
                          className="text-muted-foreground text-xs font-medium"
                        >
                          {categoryLabel}
                        </Heading3>
                      </div>
                    )}

                    <ul className="space-y-density-1">
                      {group.items.map((item) => {
                        const Icon = item.icon
                        const isActive = activeMenuItem === item.id
                        const label = getMenuItemLabel(t, item.id, {
                          autoCheckinEnabled:
                            preferences?.autoCheckin?.globalEnabled ?? true,
                        })

                        return (
                          <li key={item.id}>
                            <button
                              onClick={() => onMenuItemClick(item.id)}
                              onPointerEnter={() =>
                                onMenuItemPreload?.(item.id)
                              }
                              onFocus={() => onMenuItemPreload?.(item.id)}
                              aria-current={isActive ? "page" : undefined}
                              title={
                                shouldShowCollapsedState ? label : undefined
                              }
                              aria-label={
                                shouldShowCollapsedState ? label : undefined
                              }
                              className={cn(
                                "group py-density-1-5 focus-visible:ring-ring relative flex min-h-9 w-full items-center gap-x-2.5 rounded-lg border border-transparent px-3 text-left text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset motion-reduce:transition-none",
                                shouldShowCollapsedState &&
                                  "justify-center px-0",
                                isActive
                                  ? "bg-surface-subtle text-primary-soft-foreground dark:bg-primary-soft"
                                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                              )}
                            >
                              <Icon
                                className={cn(
                                  "size-4 shrink-0",
                                  isActive
                                    ? "text-primary"
                                    : "text-sidebar-foreground/70 group-hover:text-sidebar-accent-foreground",
                                )}
                              />

                              {!shouldShowCollapsedState && (
                                <div className="min-w-0 flex-1 text-sm font-medium">
                                  <span className="block break-words">
                                    {label}
                                  </span>
                                </div>
                              )}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                )
              })}
            </nav>
          </div>
        </div>
      </motion.aside>
    </>
  )
}

export default OptionsSidebar
