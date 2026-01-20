import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import iconImage from "~/assets/icon.png"
import { LanguageSwitcher } from "~/components/LanguageSwitcher"
import { BodySmall, Heading5, IconButton } from "~/components/ui"
import { VersionBadge } from "~/components/VersionBadge"
import { getRepository } from "~/utils/packageMeta"

interface HeaderProps {
  onTitleClick: () => void
  onMenuToggle?: () => void
  isMobileSidebarOpen?: boolean
}

/**
 * Sticky options-page header with menu toggle, app identity, and language switcher.
 * @param props Component props bundle.
 * @param props.onTitleClick Callback triggered when the app icon is clicked.
 * @param props.onMenuToggle Optional handler for toggling the mobile sidebar.
 * @param props.isMobileSidebarOpen Whether the mobile sidebar is currently open.
 */
function Header({
  onTitleClick,
  onMenuToggle,
  isMobileSidebarOpen,
}: HeaderProps) {
  const { t } = useTranslation("ui")
  const repositoryUrl = getRepository()

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
          <div className="tap-highlight-transparent flex touch-manipulation items-center space-x-2 sm:space-x-3">
            <button
              type="button"
              onClick={onTitleClick}
              className="tap-highlight-transparent touch-manipulation rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none"
              aria-label={t("app.name")}
            >
              <img
                src={iconImage}
                alt={t("app.name")}
                className="h-7 w-7 rounded-lg shadow-sm sm:h-8 sm:w-8"
              />
            </button>
            <div className="xs:block hidden">
              <div className="flex items-center gap-2">
                <Heading5 className="dark:text-dark-text-primary text-base font-semibold text-gray-900 sm:text-xl">
                  <a
                    href={repositoryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tap-highlight-transparent touch-manipulation underline-offset-4 hover:underline"
                  >
                    {t("app.name")}
                  </a>
                </Heading5>
                {/* Current extension version (links to the changelog). */}
                <VersionBadge className="text-xs" />
              </div>
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
