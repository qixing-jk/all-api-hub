import {
  Bars3Icon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import iconImage from "~/assets/icon.png"
import { FeedbackDropdownMenu } from "~/components/FeedbackDropdownMenu"
import { LanguageSwitcher } from "~/components/LanguageSwitcher"
import { Heading5, IconButton } from "~/components/ui"
import { VersionBadge } from "~/components/VersionBadge"
import { Z_INDEX } from "~/constants/designTokens"
import { useIsMobile } from "~/hooks/useMediaQuery"
import { cn } from "~/lib/utils"
import { getRepository } from "~/utils/navigation/packageMeta"

import HeaderThemeSwitcher from "./HeaderThemeSwitcher"

interface HeaderProps {
  onSearchOpen: () => void
  onTitleClick: () => void
  onMenuToggle?: () => void
  isMobileSidebarOpen?: boolean
}

const MOBILE_SEARCH_HEADER_SCROLL_THRESHOLD = 24

interface SearchTriggerProps {
  onClick: () => void
  ariaLabel: string
  placeholder: string
  className?: string
  showShortcutHint?: boolean
}

/**
 * Shared search trigger button used by the options header across compact and expanded layouts.
 */
function SearchTrigger({
  onClick,
  ariaLabel,
  placeholder,
  className,
  showShortcutHint = true,
}: SearchTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "dark:border-dark-bg-tertiary dark:bg-dark-bg-primary dark:hover:bg-dark-bg-tertiary flex h-10 w-full items-center justify-between rounded-full border border-gray-200 bg-gray-50 px-4 text-left transition-colors hover:bg-gray-100",
        className,
      )}
      aria-label={ariaLabel}
    >
      <span className="flex min-w-0 items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <MagnifyingGlassIcon className="h-4 w-4 shrink-0" />
        <span className="truncate">{placeholder}</span>
      </span>
      {showShortcutHint ? (
        <span className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
          {navigator.platform.includes("Mac") ? "Cmd+K" : "Ctrl+K"}
        </span>
      ) : null}
    </button>
  )
}

/**
 * Sticky options-page header with menu toggle, app identity, and quick theme/language controls.
 * @param props Component props bundle.
 * @param props.onSearchOpen Callback triggered when the search dialog should open.
 * @param props.onTitleClick Callback triggered when the app icon is clicked.
 * @param props.onMenuToggle Optional handler for toggling the mobile sidebar.
 * @param props.isMobileSidebarOpen Whether the mobile sidebar is currently open.
 */
function Header({
  onSearchOpen,
  onTitleClick,
  onMenuToggle,
  isMobileSidebarOpen,
}: HeaderProps) {
  const { t, i18n } = useTranslation("ui")
  const repositoryUrl = getRepository()
  const isMobile = useIsMobile()
  const [isMobileSearchExpanded, setIsMobileSearchExpanded] = useState(false)

  useEffect(() => {
    if (!isMobile) {
      setIsMobileSearchExpanded(false)
      return
    }

    const updateMobileSearchState = () => {
      setIsMobileSearchExpanded(
        window.scrollY > MOBILE_SEARCH_HEADER_SCROLL_THRESHOLD,
      )
    }

    updateMobileSearchState()
    window.addEventListener("scroll", updateMobileSearchState, {
      passive: true,
    })

    return () => {
      window.removeEventListener("scroll", updateMobileSearchState)
    }
  }, [isMobile])

  const showMobileExpandedSearch = isMobile && isMobileSearchExpanded

  return (
    <header
      className={cn(
        "dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary sticky top-0 h-(--options-header-height) border-b border-gray-200 bg-white shadow-sm",
        Z_INDEX.pageHeader,
      )}
    >
      <div className="mx-auto h-full px-2 sm:px-4 md:px-6 lg:px-8">
        <div className="flex h-full items-center gap-2">
          <div
            className={cn(
              "flex min-w-0 items-center gap-2",
              showMobileExpandedSearch ? "shrink-0" : "flex-1",
            )}
          >
            {/* 移动端菜单按钮 */}
            <IconButton
              onClick={onMenuToggle}
              variant="ghost"
              size="default"
              className="tap-highlight-transparent touch-manipulation md:hidden"
              aria-label={t("navigation.toggleMenu")}
            >
              {isMobileSidebarOpen ? (
                <XMarkIcon className="h-6 w-6" />
              ) : (
                <Bars3Icon className="h-6 w-6" />
              )}
            </IconButton>

            {/* 插件图标和名称 */}
            <div className="tap-highlight-transparent flex min-w-0 touch-manipulation items-center space-x-2 sm:space-x-3">
              <button
                type="button"
                onClick={onTitleClick}
                className="tap-highlight-transparent touch-manipulation rounded-lg focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none"
                aria-label={t("app.name")}
              >
                <img
                  src={iconImage}
                  alt={t("app.name")}
                  className="h-7.5 w-7.5 rounded-lg shadow-sm sm:h-8.5 sm:w-8.5"
                />
              </button>
              {!showMobileExpandedSearch ? (
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Heading5 className="dark:text-dark-text-primary truncate text-sm leading-tight font-semibold text-gray-900 sm:text-lg">
                      <a
                        href={repositoryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tap-highlight-transparent touch-manipulation underline-offset-4 hover:underline"
                      >
                        {t("app.name")}
                      </a>
                    </Heading5>
                    <div className="xs:block hidden">
                      {/* Current extension version (links to the changelog). */}
                      <VersionBadge
                        size="sm"
                        className="w-fit self-start text-[0.7rem] leading-tight [&>a]:gap-1 [&>a]:leading-tight [&>a>svg]:size-3"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="ml-3 hidden min-w-0 flex-1 md:flex">
            <SearchTrigger
              onClick={onSearchOpen}
              ariaLabel={t("optionsSearch.open")}
              placeholder={t("optionsSearch.placeholder")}
              className="max-w-md"
            />
          </div>

          {showMobileExpandedSearch ? (
            <div className="min-w-0 flex-1 md:hidden">
              <SearchTrigger
                onClick={onSearchOpen}
                ariaLabel={t("optionsSearch.open")}
                placeholder={t("optionsSearch.placeholder")}
              />
            </div>
          ) : null}

          <div
            className={cn(
              "flex shrink-0 items-center gap-1.5 sm:gap-2",
              showMobileExpandedSearch && "hidden md:flex",
            )}
          >
            <IconButton
              onClick={onSearchOpen}
              variant="ghost"
              size="default"
              className="md:hidden"
              aria-label={t("optionsSearch.open")}
            >
              <MagnifyingGlassIcon className="h-5 w-5" />
            </IconButton>
            <HeaderThemeSwitcher />
            <FeedbackDropdownMenu language={i18n.language} />
            <LanguageSwitcher variant="icon-dropdown" />
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
