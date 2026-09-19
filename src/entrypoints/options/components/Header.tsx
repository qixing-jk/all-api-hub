import { Menu, Search, X } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import iconImage from "~/assets/icon.png"
import { FeedbackDropdownMenu } from "~/components/FeedbackDropdownMenu"
import { LanguageSwitcher } from "~/components/LanguageSwitcher"
import { Heading5, IconButton } from "~/components/ui"
import { VersionBadge } from "~/components/VersionBadge"
import { Z_INDEX } from "~/constants/designTokens"
import HeaderAppearanceButton from "~/features/Appearance/HeaderAppearanceButton"
import HeaderThemeSwitcher from "~/features/Appearance/HeaderThemeSwitcher"
import { ProductAnnouncementButton } from "~/features/ProductAnnouncements/ProductAnnouncementButton"
import {
  PRODUCT_TOUR_TARGET_ATTRIBUTE,
  PRODUCT_TOUR_TARGETS,
} from "~/features/ProductTour/constants"
import { useIsMobile } from "~/hooks/useMediaQuery"
import { cn } from "~/lib/utils"
import { getRepository } from "~/utils/navigation/packageMeta"

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
  productTourTarget?: string
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
  productTourTarget,
  showShortcutHint = true,
}: SearchTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-border/70 bg-surface-subtle hover:border-border-strong hover:bg-muted focus-visible:ring-ring flex h-(--density-control-lg) w-full items-center justify-between gap-2 rounded-xl border px-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        className,
      )}
      aria-label={ariaLabel}
      {...{
        [PRODUCT_TOUR_TARGET_ATTRIBUTE]: productTourTarget,
      }}
    >
      <span className="text-muted-foreground gap-y-density-2 flex min-w-0 items-center gap-x-2 text-sm">
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">{placeholder}</span>
      </span>
      {showShortcutHint ? (
        <span className="border-border bg-card text-muted-foreground shrink-0 rounded-md border px-1.5 py-0.5 text-xs shadow-xs">
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
        "border-workspace-border bg-workspace sticky top-0 h-(--options-header-height) border-b",
        Z_INDEX.pageHeader,
      )}
    >
      <div className="mx-auto h-full px-2 sm:px-4 md:px-5">
        <div className="gap-y-density-2 flex h-full items-center gap-x-2">
          <div
            className={cn(
              "gap-y-density-2 flex min-w-0 items-center gap-x-2",
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
              {...{
                [PRODUCT_TOUR_TARGET_ATTRIBUTE]:
                  PRODUCT_TOUR_TARGETS.MobileMenu,
              }}
            >
              {isMobileSidebarOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </IconButton>

            {/* 插件图标和名称 */}
            <div className="tap-highlight-transparent @container flex min-w-7.5 flex-1 touch-manipulation items-center gap-x-2 sm:min-w-8.5 sm:gap-x-3">
              <button
                type="button"
                onClick={onTitleClick}
                className="tap-highlight-transparent focus-visible:ring-ring shrink-0 touch-manipulation rounded-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                aria-label={t("app.name")}
                title={t("app.name")}
              >
                <img
                  src={iconImage}
                  alt={t("app.name")}
                  className="h-7.5 w-7.5 rounded-lg object-contain shadow-sm sm:h-8.5 sm:w-8.5"
                />
              </button>
              {!showMobileExpandedSearch ? (
                <div className="hidden min-w-0 @min-[8rem]:block">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Heading5 className="text-foreground truncate text-sm leading-tight font-semibold tracking-tight sm:text-lg">
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
                        className="[&>a]:gap-y-density-1 w-fit self-start text-[length:calc(0.7rem+var(--text-size-increment))] leading-tight [&>a]:gap-x-1 [&>a]:leading-tight [&>a>svg]:size-3"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="mr-3 ml-auto hidden w-60 min-w-0 md:flex lg:w-72">
            <SearchTrigger
              onClick={onSearchOpen}
              ariaLabel={t("optionsSearch.open")}
              placeholder={t("optionsSearch.placeholder")}
              productTourTarget={PRODUCT_TOUR_TARGETS.Workspace}
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
              "flex shrink-0 items-center gap-1 sm:gap-2",
              showMobileExpandedSearch && "hidden md:flex",
            )}
          >
            <IconButton
              onClick={onSearchOpen}
              variant="ghost"
              size="sm"
              className="md:hidden"
              aria-label={t("optionsSearch.open")}
            >
              <Search className="h-5 w-5" />
            </IconButton>
            <ProductAnnouncementButton surface="options-header" />
            <FeedbackDropdownMenu language={i18n.language} />
            <div className="border-border flex items-center gap-1 sm:gap-2 sm:border-s sm:ps-3">
              <LanguageSwitcher variant="icon-dropdown" />
              <HeaderThemeSwitcher />
              <HeaderAppearanceButton />
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
