import React, { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  ContentNotice,
  ContentNoticeAction,
} from "~/components/toast/ContentNotice"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { createLogger } from "~/utils/core/logger"

import type { RedemptionBatchResultItem } from "../contracts"
import { getUnconfirmedRedemptionOutcome } from "../redemptionOutcome"

export type { RedemptionBatchResultItem } from "../contracts"

/**
 * Unified logger scoped to redemption assist batch result toasts.
 */
const logger = createLogger("RedemptionBatchResultToast")

/**
 * Reads the retry result's structured analytics category.
 */
function getRetryErrorCategory(item?: RedemptionBatchResultItem) {
  return (
    item?.analyticsErrorCategory ?? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
  )
}

export interface RedemptionBatchResultToastProps {
  results: RedemptionBatchResultItem[]
  onRetry: (code: string) => Promise<RedemptionBatchResultItem>
  onClose: () => void
}

export const RedemptionBatchResultToast: React.FC<
  RedemptionBatchResultToastProps
> = ({ results, onRetry, onClose }) => {
  const { t } = useTranslation("redemptionAssist")
  const [items, setItems] = useState<
    Array<RedemptionBatchResultItem & { retryReplyLost?: boolean }>
  >(() => results)
  const [retryingCode, setRetryingCode] = useState<string | null>(null)

  const summary = useMemo(() => {
    let successCount = 0
    let failedCount = 0
    let unconfirmedCount = 0
    for (const item of items) {
      if (item.success) {
        successCount += 1
      } else if (item.outcomeUncertain) {
        unconfirmedCount += 1
      } else {
        failedCount += 1
      }
    }
    return { successCount, failedCount, unconfirmedCount, total: items.length }
  }, [items])

  const handleRetry = async (code: string) => {
    if (retryingCode) return
    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RetryRedemptionCode,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionBatchResultToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })

    setRetryingCode(code)
    try {
      const updated = await onRetry(code)
      setItems((prev) =>
        prev.map((item) => (item.code === code ? updated : item)),
      )
      if (updated.success) {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      } else {
        tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          errorCategory: getRetryErrorCategory(updated),
        })
      }
    } catch (error) {
      logger.error("Retry failed", error)
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : ""
      setItems((prev) =>
        prev.map((item) =>
          item.code === code
            ? {
                ...item,
                ...getUnconfirmedRedemptionOutcome(code, t),
                errorMessage,
                retryReplyLost: true,
              }
            : item,
        ),
      )
    } finally {
      setRetryingCode(null)
    }
  }

  return (
    <ProductAnalyticsScope
      entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Content}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist}
      surfaceId={
        PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionBatchResultToast
      }
    >
      <ContentNotice
        title={t("redemptionAssist:messages.batchResultTitle")}
        onClose={onClose}
        closeAnalyticsAction={
          PRODUCT_ANALYTICS_ACTION_IDS.CloseRedemptionBatchResult
        }
      >
        <p>
          {t(
            summary.unconfirmedCount
              ? "redemptionAssist:messages.batchResultSummaryUnconfirmed"
              : "redemptionAssist:messages.batchResultSummary",
            {
              total: summary.total,
              success: summary.successCount,
              failed: summary.failedCount,
              unconfirmed: summary.unconfirmedCount,
            },
          )}
        </p>

        <div className="max-h-60 space-y-density-2 overflow-y-auto pr-1">
          {items.map((item, index) => (
            <div
              key={`${item.code}-${index}`}
              className="flex flex-col gap-x-1 gap-y-density-1 rounded-md border border-border/60 bg-muted/20 px-2 py-density-2 text-xs"
            >
              <div className="flex items-center justify-between gap-x-2 gap-y-density-2">
                <code className="font-mono text-foreground">
                  {item.preview}
                </code>
                {item.success ? (
                  <span className="text-success-text">
                    {t("common:status.success")}
                  </span>
                ) : (
                  <div className="flex items-center gap-x-2 gap-y-density-2">
                    <span
                      className={
                        item.outcomeUncertain
                          ? "text-muted-foreground"
                          : "text-destructive-text"
                      }
                    >
                      {item.outcomeUncertain
                        ? t("redemptionAssist:messages.claimUnconfirmed")
                        : t("common:status.failed")}
                    </span>
                    {item.retryable !== false && (
                      <ContentNoticeAction
                        disabled={retryingCode !== null}
                        loading={retryingCode === item.code}
                        onClick={() => handleRetry(item.code)}
                      >
                        {retryingCode === item.code
                          ? t("common:status.retrying")
                          : t("common:actions.retry")}
                      </ContentNoticeAction>
                    )}
                  </div>
                )}
              </div>
              <div className="whitespace-pre-line text-muted-foreground">
                {item.retryReplyLost
                  ? getUnconfirmedRedemptionOutcome(item.code, t).message
                  : item.message}
              </div>
            </div>
          ))}
        </div>
      </ContentNotice>
    </ProductAnalyticsScope>
  )
}
