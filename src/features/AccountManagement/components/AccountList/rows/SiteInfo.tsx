import { Pin } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { LdohIcon } from "~/components/icons/LdohIcon"
import { WorkflowTransitionIcon } from "~/components/icons/WorkflowTransitionIcon"
import Tooltip from "~/components/Tooltip"
import { Badge, BodySmall, Button, IconButton } from "~/components/ui"
import { useAccountActionsContext } from "~/features/AccountManagement/actions/AccountActionsContext"
import type { SearchResultWithHighlight } from "~/features/AccountManagement/components/AccountList/filtering/useAccountSearch"
import { SiteInfoCheckInIndicators } from "~/features/AccountManagement/components/AccountList/rows/SiteInfoCheckInIndicators"
import { SiteInfoDetails } from "~/features/AccountManagement/components/AccountList/rows/SiteInfoDetails"
import { SiteInfoHealthIndicator } from "~/features/AccountManagement/components/AccountList/rows/SiteInfoHealthIndicator"
import { SiteInfoHighlightedText } from "~/features/AccountManagement/components/AccountList/rows/SiteInfoHighlightedText"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { useLdohSiteLookupContext } from "~/features/LdohSiteLookup/hooks/LdohSiteLookupContext"
import toast from "~/lib/notify"
import { ACCOUNT_CONTEXT_BOOSTS } from "~/services/preferences/utils/sortingPriority"
import type { DisplaySiteData } from "~/types"
import { createTab } from "~/utils/browser/tabs"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { openAccountBaseUrl } from "~/utils/navigation/sitePages"

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
    contextBoost === ACCOUNT_CONTEXT_BOOSTS.OpenTabs ||
    contextBoost === ACCOUNT_CONTEXT_BOOSTS.ActiveTab
  const contextHint =
    contextBoost === ACCOUNT_CONTEXT_BOOSTS.CurrentSite
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
  const openSiteTooltip =
    site.name && site.name.trim() !== (site.baseUrl ?? "").trim()
      ? `${t("actions.openSite")}: ${site.name} (${site.baseUrl})`
      : `${t("actions.openSite")}: ${site.baseUrl}`

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
    <div className="flex w-full min-w-0 items-center gap-x-2 gap-y-density-2 @max-sm/account-row:contents">
      <div className="flex shrink-0 flex-col items-center justify-center gap-x-2 gap-y-density-2 self-stretch @max-sm/account-row:col-start-1 @max-sm/account-row:row-span-2 @max-sm/account-row:row-start-1 @max-sm/account-row:self-start @max-sm/account-row:pt-1">
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
                className="h-3 w-3 -rotate-12 text-faint-foreground transition-colors dark:text-muted-foreground"
                aria-hidden="true"
              />
            </IconButton>
          </Tooltip>
        )}
      </div>

      <div className="min-w-0 flex-1 @max-sm/account-row:contents">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-density-1 sm:gap-x-2 @max-sm/account-row:col-start-2 @max-sm/account-row:row-start-1 @max-sm/account-row:flex-col @max-sm/account-row:items-start @max-sm/account-row:self-start @max-sm/account-row:overflow-x-clip">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-density-1-5">
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

          <div className="flex min-w-0 items-center gap-x-0.5 gap-y-density-1 sm:gap-x-1 @max-sm/account-row:order-first @max-sm/account-row:w-full">
            {/* Keep the site URL clickable even when the account is disabled so users can still open the provider site. */}
            {/* Avoid `bleed`/non-shrinking button layout that can overflow into the action buttons column. */}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="group/site-link h-auto min-h-0 min-w-0 flex-1 shrink items-center justify-start gap-x-0.5 p-0 text-left has-[>svg]:p-0 has-[>svg]:px-0"
              title={openSiteTooltip}
              onClick={handleOpenAccountSite}
              data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.rowOpenButton}
            >
              <BodySmall
                weight="medium"
                className="min-w-0 truncate transition-colors group-hover/site-link:text-primary"
              >
                <SiteInfoHighlightedText
                  fragments={highlights?.name}
                  fallback={site.name}
                />
              </BodySmall>
              <WorkflowTransitionIcon
                className="h-3 w-3 shrink-0 text-muted-foreground opacity-40 transition-all group-hover/site-link:text-primary group-hover/site-link:opacity-100 group-focus-visible/site-link:text-primary group-focus-visible/site-link:opacity-100"
                aria-hidden="true"
              />
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

        <div className="min-w-0 @max-sm/account-row:col-start-2 @max-sm/account-row:row-start-2 @max-sm/account-row:self-start">
          <SiteInfoDetails
            site={site}
            highlights={highlights}
            showCreatedAt={showCreatedAt}
          />
        </div>
      </div>
    </div>
  )
}
