import { useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"

import {
  Body,
  Button,
  Card,
  CardContent,
  CardHeader,
  Heading3,
} from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  recordShieldBypassPromptDismissed,
  recordShieldBypassSettingsVisited,
} from "~/services/productAnalytics/shieldBypassSummary"

const MAX_TITLE_CORRECTIONS = 2

/** Removes a previously applied prefix from a title string. */
function stripPrefixedTitle(title: string, prefix: string) {
  const trimmed = title.trim()
  const withDot = `${prefix} · `
  if (trimmed.startsWith(withDot)) {
    return trimmed.slice(withDot.length)
  }
  if (trimmed.startsWith(prefix)) {
    return trimmed.slice(prefix.length).trim().replace(/^·\s*/, "")
  }
  return title
}

/**
 * Prefixes the current page title so users can recognize the temporary
 * shield-bypass context, even while the host page changes its own title.
 */
function usePrefixedDocumentTitle(prefix: string) {
  const normalizedPrefix = prefix.trim()

  useEffect(() => {
    if (!normalizedPrefix) return

    let disposed = false
    let applying = false

    const apply = () => {
      if (disposed || applying) return false
      applying = true
      try {
        const current = typeof document.title === "string" ? document.title : ""
        const base = stripPrefixedTitle(current || "", normalizedPrefix).trim()
        const next = base ? `${normalizedPrefix} · ${base}` : normalizedPrefix
        if (document.title !== next) {
          document.title = next
          return true
        }
        return false
      } finally {
        applying = false
      }
    }

    apply()

    const titleEl = document.querySelector("title")
    let correctionCount = 0
    const observer = new MutationObserver(() => {
      if (apply()) {
        correctionCount += 1
        if (correctionCount >= MAX_TITLE_CORRECTIONS) {
          observer.disconnect()
        }
      }
    })
    if (titleEl) {
      observer.observe(titleEl, { childList: true, subtree: true })
    }

    return () => {
      disposed = true
      observer.disconnect()

      try {
        const current = typeof document.title === "string" ? document.title : ""
        const stripped = stripPrefixedTitle(current || "", normalizedPrefix)
        const base = stripped.trim()
        if (stripped !== current && document.title !== base) {
          document.title = base
        }
      } catch {
        // ignore
      }
    }
  }, [normalizedPrefix])
}

/**
 * Toast/prompt shown inside the temporary tab/window used for shield/protection bypass.
 */
export function ShieldBypassPromptToast({
  onDismiss,
  onOpenSettings,
}: {
  onDismiss: () => void
  onOpenSettings: () => void
}) {
  const { t } = useTranslation("shieldBypass")

  const titlePrefix = useMemo(() => t("titlePrefix"), [t])
  usePrefixedDocumentTitle(titlePrefix)
  const handleDismiss = () => {
    void recordShieldBypassPromptDismissed()
    onDismiss()
  }
  const handleOpenSettings = () => {
    void recordShieldBypassSettingsVisited()
    onOpenSettings()
  }

  return (
    <ProductAnalyticsScope
      entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Content}
      featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ShieldBypassAssist}
      surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.ContentShieldBypassPromptToast}
    >
      <Card>
        <CardHeader padding="sm">
          <Heading3>{t("toast.title")}</Heading3>
        </CardHeader>
        <CardContent padding="sm">
          <Body className="whitespace-pre-line">{t("toast.body")}</Body>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              variant="secondary"
              analyticsAction={
                PRODUCT_ANALYTICS_ACTION_IDS.ShieldBypassPromptDismissed
              }
              onClick={handleDismiss}
            >
              {t("toast.actions.dismiss")}
            </Button>
            <Button
              analyticsAction={
                PRODUCT_ANALYTICS_ACTION_IDS.ShieldBypassSettingsVisited
              }
              onClick={handleOpenSettings}
            >
              {t("toast.actions.openSettings")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </ProductAnalyticsScope>
  )
}
