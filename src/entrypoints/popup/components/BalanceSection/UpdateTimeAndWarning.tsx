import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Badge, Caption } from "~/components/ui"
import { useProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { RELATIVE_TIME_REFRESH_INTERVAL_MS } from "~/entrypoints/popup/summaryConfig"
import { POPUP_TEST_IDS } from "~/entrypoints/popup/testIds"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import { resolveProductAnalyticsActionContext } from "~/services/productAnalytics/actionConfig"
import { trackProductAnalyticsActionStarted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
} from "~/services/productAnalytics/contracts"
import { normalizeSearchUrl } from "~/services/search/accountSearch"
import { formatFullTime, formatRelativeTime } from "~/utils/core/formatters"

interface UpdateTimeAndWarningProps {
  /**
   * Requests filtering the account list down to the currently detected site.
   * When absent, the detected-accounts badge stays a static hint.
   */
  onFilterCurrentSiteAccounts?: (query: string) => void
}

/**
 * Extracts a searchable domain query from a detected account's site URL.
 *
 * The account search index keeps `baseUrl` in its normalized original form, so
 * the query must go through the same `normalizeSearchUrl` pipeline instead of
 * `URL.host`, which would punycode-encode internationalized domains and never
 * match the index. Returns null when no domain exists so the badge stays
 * non-interactive.
 */
function resolveDetectedSiteSearchQuery(
  siteUrl: string | undefined,
): string | null {
  const domain = siteUrl ? normalizeSearchUrl(siteUrl).split("/")[0] : ""
  return domain || null
}

export const UpdateTimeAndWarning = ({
  onFilterCurrentSiteAccounts,
}: UpdateTimeAndWarningProps) => {
  const { t } = useTranslation("account")
  const analyticsScope = useProductAnalyticsScope()
  const { displayData, lastUpdateTime, detectedAccount, detectedSiteAccounts } =
    useAccountDataContext()
  const [, setTick] = useState(0)
  const accountNameById = useMemo(
    () =>
      new Map(
        displayData.map((account) => [account.id, account.name] as const),
      ),
    [displayData],
  )

  const detectedAccountName = detectedAccount
    ? accountNameById.get(detectedAccount.id) ?? detectedAccount.site_name
    : null
  const [detectedSiteAccount] = detectedSiteAccounts
  const detectedSiteAccountName = detectedSiteAccount
    ? accountNameById.get(detectedSiteAccount.id) ??
      detectedSiteAccount.site_name
    : null
  const hasMultipleDetectedSiteAccounts =
    !detectedAccount && detectedSiteAccounts.length > 1

  const detectedSiteSearchQuery = useMemo(
    () => resolveDetectedSiteSearchQuery(detectedSiteAccount?.site_url),
    [detectedSiteAccount],
  )
  const isSiteFilterAvailable =
    typeof onFilterCurrentSiteAccounts === "function" &&
    detectedSiteSearchQuery !== null

  useEffect(() => {
    // 每隔一段时间更新 tick，以触发相对时间的重新计算
    // 这样可以确保 "更新于 X 分钟前" 这样的文本是动态更新的
    // 而不是仅在组件初次渲染时计算一次
    const timer = setInterval(
      () => setTick((t) => t + 1),
      RELATIVE_TIME_REFRESH_INTERVAL_MS,
    )
    return () => clearInterval(timer)
  }, [])

  const handleFilterCurrentSite = () => {
    if (detectedSiteSearchQuery === null) return

    const analyticsContext = resolveProductAnalyticsActionContext(
      {
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterAccounts,
      },
      analyticsScope,
    )
    if (analyticsContext) {
      void trackProductAnalyticsActionStarted(analyticsContext)
    }
    onFilterCurrentSiteAccounts?.(detectedSiteSearchQuery)
  }

  const detectedMessage = detectedAccount
    ? t("currentLoginAdded", { siteName: detectedAccountName })
    : hasMultipleDetectedSiteAccounts
      ? t("currentSiteAddedCount", {
          count: detectedSiteAccounts.length,
        })
      : t("currentSiteAdded", {
          siteName: detectedSiteAccountName,
        })

  return (
    <div className="gap-y-density-2 flex items-center justify-between gap-x-2">
      <Tooltip
        content={formatFullTime(lastUpdateTime)}
        wrapperClassName="shrink-0"
      >
        <Caption className="cursor-help whitespace-nowrap">
          {t("common:time.updatedAt", {
            time: formatRelativeTime(lastUpdateTime),
          })}
        </Caption>
      </Tooltip>
      {detectedSiteAccounts.length > 0 &&
        (isSiteFilterAvailable ? (
          <Tooltip
            content={t("currentSiteFilterHint")}
            anchorAsChild
            position="top"
          >
            <Badge asChild variant="info" size="sm">
              <button
                type="button"
                onClick={handleFilterCurrentSite}
                className="min-w-0 cursor-pointer"
                data-testid={POPUP_TEST_IDS.detectedSiteFilterButton}
              >
                {/* The site name truncates while the action word stays visible. */}
                <span className="min-w-0 truncate">{detectedMessage}</span>
                <span className="shrink-0">
                  <span aria-hidden="true"> · </span>
                  {t("currentSiteFilterAction")}
                </span>
              </button>
            </Badge>
          </Tooltip>
        ) : (
          <Badge variant="info" size="sm" className="min-w-0">
            <span className="min-w-0 truncate">{detectedMessage}</span>
          </Badge>
        ))}
    </div>
  )
}
