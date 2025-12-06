import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import iconImage from "~/assets/icon.png"
import { LanguageSwitcher } from "~/components/LanguageSwitcher"
import { BodySmall, Heading5, IconButton } from "~/components/ui"

interface HeaderProps {
  onTitleClick: () => void
  onMenuToggle?: () => void
  isMobileSidebarOpen?: boolean
}

/**
 * Sticky options-page header with menu toggle, app identity, and language switcher.
 * @param props Title click handler, menu toggle callback, and mobile open state.
 */
function Header({
  onTitleClick,
  onMenuToggle,
  isMobileSidebarOpen,
}: HeaderProps) {
  const { t } = useTranslation("ui")
  return (
    <header className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary sticky top-0 z-50 h-(--options-header-height) border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto h-full px-2 sm:px-4 md:px-6 lg:px-8">
        <div className="flex h-full items-center justify-between">
          {/* 移动端菜单按钮 */}
          <IconButton
            onClick={onMenuToggle}
            variant="ghost"
            size="default"
            className="tap-highlight-transparent touch-manipulation md:hidden"
            aria-label="Toggle menu"
          >
            {isMobileSidebarOpen ? (
              <XMarkIcon className="h-6 w-6" />
            ) : (
              <Bars3Icon className="h-6 w-6" />
            )}
          </IconButton>

          {/* 插件图标和名称 */}
          <div
            className="tap-highlight-transparent flex cursor-pointer touch-manipulation items-center space-x-2 sm:space-x-3"
            onClick={onTitleClick}
          >
            <img
              src={iconImage}
              alt={t("app.name")}
              className="h-7 w-7 rounded-lg shadow-sm sm:h-8 sm:w-8"
            />
            <div className="xs:block hidden">
              <Heading5 className="dark:text-dark-text-primary text-base font-semibold text-gray-900 sm:text-xl">
                {t("app.name")}
              </Heading5>
              <BodySmall className="dark:text-dark-text-tertiary hidden text-xs text-gray-500 sm:block sm:text-sm">
                {t("app.description")}
              </BodySmall>
            </div>
          </div>
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  )
}

export default Header
