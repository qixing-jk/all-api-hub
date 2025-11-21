import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon
} from "@heroicons/react/24/outline"
import { motion } from "framer-motion"
import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { Button, Heading3, IconButton, Separator } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext.tsx"
import { cn } from "~/utils/cn"

import { menuItems } from "../constants"

interface SidebarProps {
  activeMenuItem: string
  onMenuItemClick: (itemId: string) => void
  isMobileOpen?: boolean
  onMobileClose?: () => void
  isCollapsed?: boolean
  onCollapseToggle?: () => void
}

const DESKTOP_WIDTH = 256
const COLLAPSED_WIDTH = 64
const MOBILE_WIDTH = 256

function Sidebar({
  activeMenuItem,
  onMenuItemClick,
  isMobileOpen,
  onMobileClose,
  isCollapsed = false,
  onCollapseToggle
}: SidebarProps) {
  const { t } = useTranslation("ui")
  const { preferences } = useUserPreferencesContext()
  const shouldShowCollapsedState = isCollapsed && !isMobileOpen
  const targetWidth = isMobileOpen
    ? MOBILE_WIDTH
    : shouldShowCollapsedState
      ? COLLAPSED_WIDTH
      : DESKTOP_WIDTH
  const navAriaLabel = shouldShowCollapsedState
    ? t("navigation.sidebarCollapsedHint")
    : t("navigation.settingsOptions")
  const collapseButtonLabel = t(
    `navigation.${shouldShowCollapsedState ? "expandSidebar" : "collapseSidebar"}`
  )
  const sidebarHeight = isMobileOpen
    ? "100vh"
    : "calc(100vh - var(--options-header-height))"
  const sidebarTop = isMobileOpen ? undefined : "var(--options-header-height)"

  const handleCollapseButtonClick = () => {
    if (isMobileOpen && onMobileClose) {
      onMobileClose()
      return
    }
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
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* 侧边栏 */}
      <motion.aside
        initial={false}
        animate={{ width: targetWidth }}
        style={{ width: targetWidth, height: sidebarHeight, top: sidebarTop }}
        className={cn(
          "z-40 shrink-0 transform transition-transform duration-300 ease-in-out",
          isMobileOpen
            ? "fixed inset-y-0 left-0 translate-x-0"
            : "fixed inset-y-0 left-0 -translate-x-full md:translate-x-0",
          "md:sticky md:inset-auto md:left-auto md:translate-x-0 md:self-start md:overflow-hidden"
        )}>
        <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary flex h-full flex-col border-r border-gray-200 bg-white shadow-sm">
          <div
            className={cn(
              "flex h-16 items-center px-3 py-2",
              shouldShowCollapsedState ? "justify-center" : "justify-between"
            )}>
            {!shouldShowCollapsedState && (
              <div className="flex flex-1 items-center gap-2 overflow-hidden">
                <Heading3
                  aria-hidden={shouldShowCollapsedState}
                  className={cn(
                    "dark:text-dark-text-tertiary truncate text-sm font-semibold tracking-wide text-gray-500 uppercase transition-all duration-200",
                    shouldShowCollapsedState
                      ? "max-w-0 opacity-0"
                      : "max-w-[200px] opacity-100"
                  )}>
                  {t("navigation.settingsOptions")}
                </Heading3>
              </div>
            )}
            {(onCollapseToggle || isMobileOpen) && (
              <Button
                aria-label={collapseButtonLabel}
                variant="outline"
                size="icon"
                className="dark:border-dark-bg-tertiary dark:text-dark-text-secondary hidden h-8 w-8 rounded-full border-gray-200 text-gray-600 md:inline-flex"
                onClick={handleCollapseButtonClick}>
                {shouldShowCollapsedState ? (
                  <ChevronDoubleRightIcon className="h-4 w-4" />
                ) : (
                  <ChevronDoubleLeftIcon className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          <Separator className="mx-3" />

          <nav aria-label={navAriaLabel} className="flex-1 py-4">
            <ul className="space-y-1 px-2">
              {menuItems.map((item) => {
                const Icon = item.icon
                const isActive = activeMenuItem === item.id
                const label = t(`navigation.${item.id}`)

                if (
                  item.id === "autoCheckin" &&
                  !preferences?.autoCheckin?.globalEnabled
                ) {
                  return null
                }

                return (
                  <li key={item.id}>
                    <button
                      onClick={() => onMenuItemClick(item.id)}
                      title={shouldShowCollapsedState ? label : undefined}
                      aria-label={shouldShowCollapsedState ? label : undefined}
                      className={cn(
                        "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                        shouldShowCollapsedState && "justify-center px-0",
                        isActive
                          ? "bg-blue-600 text-white dark:bg-blue-500"
                          : "dark:text-dark-text-secondary dark:hover:bg-dark-bg-tertiary text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                      )}>
                      <Icon
                        className={cn(
                          "h-5 w-5 shrink-0",
                          isActive
                            ? "text-white"
                            : "dark:text-dark-text-tertiary text-gray-400 group-hover:text-gray-600"
                        )}
                      />

                      {!shouldShowCollapsedState && (
                        <div
                          className={cn(
                            "flex-1 overflow-hidden text-sm font-medium transition-all duration-200 sm:text-base"
                          )}
                          aria-hidden={shouldShowCollapsedState}>
                          <span className="block truncate">{label}</span>
                        </div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          <Separator className="mx-3" />

          <div className="flex items-center justify-between px-3 py-3 sm:px-4">
            <Heading3
              className={cn(
                "dark:text-dark-text-tertiary text-xs font-semibold tracking-wide text-gray-400 uppercase",
                shouldShowCollapsedState && "sr-only"
              )}>
              {t("navigation.settings")}
            </Heading3>
            {(onCollapseToggle || isMobileOpen) && (
              <IconButton
                aria-label={collapseButtonLabel}
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={handleCollapseButtonClick}>
                {shouldShowCollapsedState ? (
                  <ChevronDoubleRightIcon className="h-5 w-5" />
                ) : (
                  <ChevronDoubleLeftIcon className="h-5 w-5" />
                )}
              </IconButton>
            )}
          </div>
        </div>
      </motion.aside>
    </>
  )
}

export default Sidebar
