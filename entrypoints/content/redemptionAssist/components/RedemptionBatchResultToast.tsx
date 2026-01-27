import React, { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Body,
  Button,
  Card,
  CardContent,
  CardHeader,
  Heading3,
} from "~/components/ui"
import { createLogger } from "~/utils/logger"

/**
 * Unified logger scoped to redemption assist batch result toasts.
 */
const logger = createLogger("RedemptionBatchResultToast")

export interface RedemptionBatchResultItem {
  code: string
  preview: string
  success: boolean
  message: string
  errorMessage?: string
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
  const [items, setItems] = useState<RedemptionBatchResultItem[]>(() => results)
  const [retryingCode, setRetryingCode] = useState<string | null>(null)

  const summary = useMemo(() => {
    let successCount = 0
    let failedCount = 0
    for (const item of items) {
      if (item.success) {
        successCount += 1
      } else {
        failedCount += 1
      }
    }
    return { successCount, failedCount, total: items.length }
  }, [items])

  const handleRetry = async (code: string) => {
    if (retryingCode) return
    setRetryingCode(code)
    try {
      const updated = await onRetry(code)
      setItems((prev) =>
        prev.map((item) => (item.code === code ? updated : item)),
      )
    } catch (error) {
      logger.error("Retry failed", error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : t("common:status.error")
      setItems((prev) =>
        prev.map((item) =>
          item.code === code
            ? {
                ...item,
                success: false,
                errorMessage,
                message: errorMessage,
              }
            : item,
        ),
      )
    } finally {
      setRetryingCode(null)
    }
  }

  return (
    <Card>
      <CardHeader padding="sm">
        <div className="flex items-center justify-between gap-2">
          <Heading3>{t("redemptionAssist:messages.batchResultTitle")}</Heading3>
          <Button size="sm" variant="secondary" onClick={onClose}>
            {t("common:actions.close")}
          </Button>
        </div>
      </CardHeader>
      <CardContent padding="sm">
        <Body>
          {t("redemptionAssist:messages.batchResultSummary", {
            total: summary.total,
            success: summary.successCount,
            failed: summary.failedCount,
          })}
        </Body>

        <div className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">
          {items.map((item, index) => (
            <div
              key={`${item.code}-${index}`}
              className="border-border/60 bg-muted/20 flex flex-col gap-1 rounded-md border px-2 py-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <code className="text-foreground font-mono">
                  {item.preview}
                </code>
                {item.success ? (
                  <span className="text-emerald-700 dark:text-emerald-300">
                    {t("common:status.success")}
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-rose-700 dark:text-rose-300">
                      {t("common:status.failed")}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={retryingCode !== null}
                      onClick={() => handleRetry(item.code)}
                    >
                      {retryingCode === item.code
                        ? t("common:status.loading")
                        : t("common:actions.retry")}
                    </Button>
                  </div>
                )}
              </div>
              <div className="text-muted-foreground whitespace-pre-line">
                {item.message}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
