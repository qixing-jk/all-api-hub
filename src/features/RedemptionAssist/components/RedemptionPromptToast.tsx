import React, { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  ContentNotice,
  ContentNoticeAction,
} from "~/components/toast/ContentNotice"
import { Link } from "~/components/ui"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { useProductAnalyticsActionTracking } from "~/hooks/analytics/useProductAnalyticsActionTracking"
import { trackProductAnalyticsActionStarted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { sendRuntimeMessage } from "~/utils/browser/runtimeMessages"
import { createLogger } from "~/utils/core/logger"

import {
  REDEMPTION_PROMPT_ACTIONS,
  type RedemptionPromptCodeItem,
  type RedemptionPromptResult,
} from "../contracts"

export type {
  RedemptionPromptAction,
  RedemptionPromptCodeItem,
  RedemptionPromptResult,
} from "../contracts"

/**
 * Unified logger scoped to redemption assist prompt toast interactions.
 */
const logger = createLogger("RedemptionPromptToast")

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

  const selectAllRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const el = selectAllRef.current
    if (!el) return
    el.indeterminate = someSelected
  }, [someSelected])

  const handleCancel = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    void trackProductAnalyticsActionStarted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CancelRedemptionPrompt,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionPromptToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    onAction({ action: REDEMPTION_PROMPT_ACTIONS.Cancel, selectedCodes: [] })
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
      action: REDEMPTION_PROMPT_ACTIONS.Auto,
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
      <ContentNotice
        title={t("redemptionAssist:messages.promptTitle")}
        onClose={handleCancel}
        actions={
          <>
            <ContentNoticeAction variant="secondary" onClick={handleCancel}>
              {t("common:actions.cancel")}
            </ContentNoticeAction>
            <ContentNoticeAction
              onClick={handleAutoRedeem}
              disabled={selectedCount === 0}
            >
              {t("redemptionAssist:actions.autoRedeem")}
            </ContentNoticeAction>
          </>
        }
      >
        <p>{message}</p>
        {codes.length > 1 && (
          <label className="flex items-center gap-x-2 gap-y-density-2">
            <input
              ref={selectAllRef}
              type="checkbox"
              className="h-3 w-3"
              checked={allSelected}
              onChange={handleToggleAll}
            />
            <span className="text-xs text-foreground">
              {t("redemptionAssist:messages.selectAll")}
            </span>
          </label>
        )}
        {codes.length > 0 && (
          <div className="max-h-44 space-y-density-1 overflow-y-auto pr-1">
            {codes.map(({ code, preview }) => (
              <label
                key={code}
                className="flex cursor-pointer items-center gap-x-2 gap-y-density-2 rounded-md border border-border/60 px-2 py-density-1-5 text-xs hover:bg-muted/70"
              >
                <input
                  type="checkbox"
                  className="h-3 w-3"
                  checked={selected.has(code)}
                  onChange={() => toggleCode(code)}
                />
                <code className="font-mono text-foreground">{preview}</code>
              </label>
            ))}
          </div>
        )}
        <div>
          <Link size="sm" href="#" onClick={handleOpenSettings}>
            {t("redemptionAssist:messages.promptSettingsLink")}
          </Link>
        </div>
      </ContentNotice>
    </ProductAnalyticsScope>
  )
}
