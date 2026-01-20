import {
  ArrowPathIcon,
  ArrowsPointingOutIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline"
import { PanelRightClose } from "lucide-react"
import { useCallback } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import iconImage from "~/assets/icon.png"
import Tooltip from "~/components/Tooltip"
import { Badge, BodySmall, Caption, IconButton } from "~/components/ui"
import { COLORS } from "~/constants/designTokens"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { isExtensionSidePanel } from "~/utils/browser"
import { getManifest } from "~/utils/browserApi"
import { getDocsChangelogUrl } from "~/utils/docsLinks"
import {
  openFullAccountManagerPage,
  openSettingsPage,
  openSidePanelPage,
} from "~/utils/navigation"

import CompactThemeToggle from "./ThemeToggle"

/**
 * Popup header with app identity (including version), theme toggle, and navigation controls.
 * Provides refresh, account manager, settings, and side panel shortcuts.
 */
export default function HeaderSection() {
  const { t } = useTranslation(["ui", "account", "common"])
  const { isRefreshing, handleRefresh } = useAccountDataContext()
  const inSidePanel = isExtensionSidePanel()
  const { version } = getManifest()
  const changelogUrl = getDocsChangelogUrl(version)

  const handleGlobalRefresh = useCallback(async () => {
    try {
      await toast.promise(handleRefresh(true), {
        loading: t("account:refresh.refreshingAll"),
        success: (result) => {
          if (result.failed > 0) {
            return t("account:refresh.refreshComplete", {
              success: result.success,
              failed: result.failed,
            })
          }
          return t("account:refresh.refreshSuccess")
        },
        error: t("account:refresh.refreshFailed"),
      })
    } catch (error) {
      console.error("Error during global refresh:", error)
    }
  }, [handleRefresh, t])

  const handleOpenFullAccountManagerPage = async () => {
    await openFullAccountManagerPage()
  }

  const handleOpenSetting = async () => {
    await openSettingsPage()
  }

  const handleOpenSidePanel = async () => {
    await openSidePanelPage()
  }

  return (
    <header
      className={`flex items-center justify-between px-3 py-2 sm:px-5 sm:py-3 ${COLORS.background.primary} ${COLORS.border.default} shrink-0 border-b`}
    >
      {/* Logo and Title Section */}
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <img
          src={iconImage}
          alt={t("ui:app.name")}
          className="h-6 w-6 shrink-0 rounded-lg shadow-sm sm:h-7 sm:w-7"
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            <BodySmall weight="semibold" className="truncate">
              {t("ui:app.name")}
            </BodySmall>
            {/* Keep version visible and link to the changelog, matching the options header behavior. */}
            <Badge asChild variant="secondary" size="sm" className="shrink-0">
              <a
                href={changelogUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-highlight-transparent touch-manipulation"
                aria-label={`v${version} changelog`}
              >
                v{version}
              </a>
            </Badge>
          </div>
          <Caption className="xs:block hidden truncate">
            {t("ui:app.description")}
          </Caption>
        </div>
      </div>

      {/* Action Buttons Section */}
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <CompactThemeToggle />

        <Tooltip content={t("common:actions.refresh")}>
          <IconButton
            onClick={handleGlobalRefresh}
            disabled={isRefreshing}
            variant="outline"
            size="sm"
            aria-label={t("common:actions.refresh")}
            className="touch-manipulation"
          >
            <ArrowPathIcon
              className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </IconButton>
        </Tooltip>

        <Tooltip content={t("ui:navigation.account")}>
          <IconButton
            onClick={handleOpenFullAccountManagerPage}
            variant="outline"
            size="sm"
            aria-label={t("ui:navigation.account")}
            className="touch-manipulation"
          >
            <ArrowsPointingOutIcon className="h-4 w-4" />
          </IconButton>
        </Tooltip>

        <Tooltip content={t("common:labels.settings")}>
          <IconButton
            onClick={handleOpenSetting}
            variant="outline"
            size="sm"
            aria-label={t("common:labels.settings")}
            className="touch-manipulation"
          >
            <Cog6ToothIcon className="h-4 w-4" />
          </IconButton>
        </Tooltip>
        {!inSidePanel && (
          <Tooltip content={t("common:actions.openSidePanel")}>
            <IconButton
              aria-label={t("common:actions.openSidePanel")}
              size="sm"
              variant="outline"
              onClick={handleOpenSidePanel}
            >
              <PanelRightClose className="h-4 w-4" />
            </IconButton>
          </Tooltip>
        )}
      </div>
    </header>
  )
}
