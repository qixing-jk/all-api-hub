import React, { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Body,
  Button,
  Caption,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Heading3,
  Link,
} from "~/components/ui"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useProductAnalyticsActionTracking } from "~/hooks/useProductAnalyticsActionTracking"
import { trackProductAnalyticsActionStarted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to redemption assist prompt toast interactions.
 */
const logger = createLogger("RedemptionPromptToast")

export type RedemptionPromptAction = "auto" | "cancel"

export interface RedemptionPromptResult {
  action: RedemptionPromptAction
  selectedCodes: string[]
}

export interface RedemptionPromptCodeItem {
  code: string
  preview: string
}

interface RedemptionPromptToastProps {
  message: string
  codes: RedemptionPromptCodeItem[]
  onAction: (result: RedemptionPromptResult) => void
}

export const RedemptionPromptToast: React.FC<RedemptionPromptToastProps> = ({
  message,
  codes,
  onAction,
}) => {
  const { t } = useTranslation("redemptionAssist")

  const codeValues = useMemo(() => codes.map((c) => c.code), [codes])
  const initialSelected = useMemo(() => new Set(codeValues), [codeValues])
  const [selected, setSelected] = useState<Set<string>>(() => initialSelected)

  const allSelected = selected.size > 0 && selected.size === codes.length
  const someSelected = selected.size > 0 && !allSelected
  const settingsLinkAnalytics = useProductAnalyticsActionTracking({
    analyticsAction: {
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.VisitRedemptionAssistSettingsFromPrompt,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionPromptToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    },
  })

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    void trackProductAnalyticsActionStarted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CancelRedemptionPrompt,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionPromptToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    onAction({ action: "cancel", selectedCodes: [] })
  }

  const handleAutoRedeem = (e: React.MouseEvent) => {
    e.stopPropagation()
    void trackProductAnalyticsActionStarted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ConfirmRedemptionPrompt,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionPromptToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    onAction({
      action: "auto",
      selectedCodes: codeValues.filter((c) => selected.has(c)),
    })
  }

  const handleOpenSettings = async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    settingsLinkAnalytics.getActionTrackingProps().onClick(e)
    try {
      await sendRuntimeMessage({
        action: RuntimeActionIds.OpenSettingsCheckinRedeem,
      })
    } catch (error) {
      logger.error("Failed to open settings page", error)
    }
  }

  const toggleCode = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
  }

  const handleToggleAll = () => {
    setSelected((prev) => {
      if (prev.size === codes.length) return new Set()
      return new Set(codeValues)
    })
  }

  const selectedCount = selected.size

  return (
    <ProductAnalyticsScope
      entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Content}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist}
      surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionPromptToast}
    >
      <Card>
        <CardHeader padding="sm">
          <Heading3>{t("redemptionAssist:messages.promptTitle")}</Heading3>
        </CardHeader>
        <CardContent padding="sm">
          <Body>{message}</Body>
          {codes.length > 1 && (
            <div className="mt-2 flex items-center gap-2">
              <Checkbox
                aria-label={t("redemptionAssist:messages.selectAll")}
                checked={someSelected ? "indeterminate" : allSelected}
                onCheckedChange={handleToggleAll}
              />
              <span className="text-foreground text-xs">
                {t("redemptionAssist:messages.selectAll")}
              </span>
            </div>
          )}
          {codes.length > 0 && (
            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
              {codes.map(({ code, preview }) => (
                <div
                  key={code}
                  className="border-border/60 hover:bg-muted/70 flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs"
                  onClick={() => toggleCode(code)}
                >
                  <Checkbox
                    aria-label={preview}
                    checked={selected.has(code)}
                    onCheckedChange={() => toggleCode(code)}
                    onClick={(event) => event.stopPropagation()}
                  />
                  <code className="text-foreground font-mono">{preview}</code>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1">
            <Caption>{t("redemptionAssist:messages.promptSource")}</Caption>
            <Link size="xs" href="#" onClick={handleOpenSettings}>
              {t("redemptionAssist:messages.promptSettingsLink")}
            </Link>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={handleCancel}>
              {t("common:actions.cancel")}
            </Button>
            <Button disabled={selectedCount === 0} onClick={handleAutoRedeem}>
              {t("redemptionAssist:actions.autoRedeem")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </ProductAnalyticsScope>
  )
}
