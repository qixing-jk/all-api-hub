import { Pin } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { LdohIcon } from "~/components/icons/LdohIcon"
import Tooltip from "~/components/Tooltip"
import { Badge, BodySmall, Button, IconButton } from "~/components/ui"
import { SiteInfoCheckInIndicators } from "~/features/AccountManagement/components/AccountList/SiteInfoCheckInIndicators"
import { SiteInfoDetails } from "~/features/AccountManagement/components/AccountList/SiteInfoDetails"
import { SiteInfoHealthIndicator } from "~/features/AccountManagement/components/AccountList/SiteInfoHealthIndicator"
import { SiteInfoHighlightedText } from "~/features/AccountManagement/components/AccountList/SiteInfoHighlightedText"
import { useAccountActionsContext } from "~/features/AccountManagement/hooks/AccountActionsContext"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import type { SearchResultWithHighlight } from "~/features/AccountManagement/hooks/useAccountSearch"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { useLdohSiteLookupContext } from "~/features/LdohSiteLookup/hooks/LdohSiteLookupContext"
import toast from "~/lib/notify"
import type { DisplaySiteData } from "~/types"
import { createTab } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { openAccountBaseUrl } from "~/utils/navigation"

interface SiteInfoProps {
  site: DisplaySiteData
  highlights?: SearchResultWithHighlight["highlights"]
  showContextBoost?: boolean
  showCreatedAt?: boolean
}

const SITE_INFO_REFRESH_TARGETS = {
  STALE_CHECK_IN: "stale_check_in",
  HEALTH: "health",
} as const

type SiteInfoRefreshTarget =
  (typeof SITE_INFO_REFRESH_TARGETS)[keyof typeof SITE_INFO_REFRESH_TARGETS]

/**
 * Logger scoped to account list rows so navigation failures can be diagnosed without leaking account secrets.
 */
const logger = createLogger("AccountList.SiteInfo")

/**
 * Site info row combining metadata, status chips, and context actions for a display account entry.
 */
export default function SiteInfo({
  site,
  highlights,
  showCreatedAt = false,
  showContextBoost = true,
}: SiteInfoProps) {
  const { t } = useTranslation(["account", "messages", "common"])
  const {
    detectedSiteAccounts,
    getAccountContextBoost,
    isAccountPinned,
    togglePinAccount,
    isPinFeatureEnabled,
  } = useAccountDataContext()
  const { handleRefreshAccount, refreshingAccountId } =
    useAccountActionsContext()
  const { getLdohSearchUrlForAccountUrl } = useLdohSiteLookupContext()
  const [activeRefreshTarget, setActiveRefreshTarget] =
    useState<SiteInfoRefreshTarget | null>(null)
  const isDetectedAccount = detectedSiteAccounts.some(
    (account) => account.id === site.id,
  )

  const contextBoost = showContextBoost
    ? getAccountContextBoost?.(site.id)
    : undefined
  // Both related-page tiers share one badge; the viewed tab only changes ordering.
  const isRelatedPageOpen =
    contextBoost === "open-tabs" || contextBoost === "active-tab"
  const contextHint =
    contextBoost === "current-site"
      ? t("list.site.currentSiteBoostHint")
      : isRelatedPageOpen
        ? t("list.site.openTabsBoostHint")
        : t("list.site.currentSiteExists")

  const isPinned = isAccountPinned(site.id)
  const pinTooltipLabel = isPinned ? t("actions.unpin") : t("actions.pin")
  const isRefreshing = refreshingAccountId === site.id
  const isRefreshLocked = isRefreshing || activeRefreshTarget !== null
  const isAccountDisabled = site.disabled === true
  const ldohSearchUrl = getLdohSearchUrlForAccountUrl(site.baseUrl)
  const siteTypeLabel = t("list.site.siteType")

  const handleOpenAccountSite = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await openAccountBaseUrl(site)
    } catch (error) {
      logger.error("Failed to open account base URL", {
        error,
        accountId: site.id,
        baseUrl: site.baseUrl,
      })
    }
  }

  const handleOpenLdoh = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!ldohSearchUrl) return
    try {
      await createTab(ldohSearchUrl, true)
    } catch (error) {
      const msg = getErrorMessage(error)
      logger.error("Failed to open LDOH site lookup", {
        error: msg,
        accountId: site.id,
        baseUrl: site.baseUrl,
      })
    }
  }

  const handlePinClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const success = await togglePinAccount(site.id)
    if (success) {
      const message = isPinned
        ? t("messages:toast.success.accountUnpinned", {
            accountName: site.name,
          })
        : t("messages:toast.success.accountPinned", {
            accountName: site.name,
          })
      toast.success(message)
    }
  }

  const refreshAccount = async (target: SiteInfoRefreshTarget) => {
    if (isAccountDisabled || isRefreshLocked) return

    setActiveRefreshTarget(target)
    try {
      await handleRefreshAccount(site, true)
    } catch (error) {
      logger.error("Failed to refresh account row", {
        error,
        accountId: site.id,
        target,
      })
    } finally {
      setActiveRefreshTarget(null)
    }
  }

  return (
    <div className="gap-y-density-2 flex w-full min-w-0 items-center gap-x-2">
      <div className="gap-y-density-2 flex shrink-0 flex-col items-center justify-center gap-x-2 self-stretch">
        <SiteInfoHealthIndicator
          site={site}
          isRefreshing={isRefreshing}
          isHealthRefreshing={
            activeRefreshTarget === SITE_INFO_REFRESH_TARGETS.HEALTH
          }
          isRefreshLocked={isRefreshLocked}
          onRefresh={() => refreshAccount(SITE_INFO_REFRESH_TARGETS.HEALTH)}
        />

        {!isAccountDisabled && isPinFeatureEnabled && isPinned && (
          <Tooltip content={pinTooltipLabel} position="right">
            <IconButton
              onClick={handlePinClick}
              variant="ghost"
              size="none"
              aria-label={pinTooltipLabel}
            >
              <Pin
                className="dark:text-muted-foreground text-faint-foreground h-3 w-3 -rotate-12 transition-colors"
                aria-hidden="true"
              />
            </IconButton>
          </Tooltip>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="gap-y-density-1 flex flex-wrap items-center gap-x-1">
          <div className="gap-y-density-1-5 flex min-w-0 flex-wrap items-center gap-x-1.5">
            {(contextBoost || isDetectedAccount) && (
              <Tooltip content={contextHint} anchorAsChild position="top">
                <Badge
                  tabIndex={0}
                  variant="info"
                  size="sm"
                  className="whitespace-nowrap"
                >
                  {isRelatedPageOpen
                    ? t("list.site.openTabsBoost")
                    : t("list.site.currentSite")}
                </Badge>
              </Tooltip>
            )}
            {isAccountDisabled && (
              <Badge
                variant="secondary"
                size="sm"
                className="whitespace-nowrap"
              >
                {t("list.site.disabled")}
              </Badge>
            )}
            <Tooltip
              content={`${siteTypeLabel}: ${site.siteType}`}
              position="top"
            >
              <Badge
                variant="secondary"
                size="sm"
                className="max-w-[10rem] shrink-0 truncate whitespace-nowrap"
              >
                {site.siteType}
              </Badge>
            </Tooltip>
          </div>

          <div className="gap-y-density-1 sm:gap-y-density-1-5 flex min-w-0 items-center gap-x-1 sm:gap-x-1.5">
            {/* Keep the site URL clickable even when the account is disabled so users can still open the provider site. */}
            {/* Avoid `bleed`/non-shrinking button layout that can overflow into the action buttons column. */}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto min-h-0 min-w-0 flex-1 shrink justify-start p-0 text-left"
              title={site.name}
              onClick={handleOpenAccountSite}
              data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.rowOpenButton}
            >
              <BodySmall weight="medium" className="truncate">
                <SiteInfoHighlightedText
                  fragments={highlights?.name}
                  fallback={site.name}
                />
              </BodySmall>
            </Button>

            <SiteInfoCheckInIndicators
              site={site}
              isRefreshing={
                activeRefreshTarget === SITE_INFO_REFRESH_TARGETS.STALE_CHECK_IN
              }
              isRefreshLocked={isRefreshLocked}
              onRefresh={() =>
                refreshAccount(SITE_INFO_REFRESH_TARGETS.STALE_CHECK_IN)
              }
            />

            {ldohSearchUrl && (
              <Tooltip
                content={t("actions.viewOnLdoh")}
                position="top"
                wrapperClassName="flex shrink-0 items-center"
              >
                <IconButton
                  onClick={(e) => void handleOpenLdoh(e)}
                  variant="ghost"
                  size="xs"
                  aria-label={t("actions.viewOnLdoh")}
                  data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.rowLdohLookupButton}
                >
                  <span aria-hidden="true">
                    <LdohIcon />
                  </span>
                </IconButton>
              </Tooltip>
            )}
          </div>
        </div>

        <SiteInfoDetails
          site={site}
          highlights={highlights}
          showCreatedAt={showCreatedAt}
        />
      </div>
    </div>
  )
}
