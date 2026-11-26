import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { DialogLoadingIndicator } from "~/components/ui/Dialog/DialogLoadingIndicator"

import {
  TOKEN_SITE_FALLBACK_REASONS,
  type NewApiTokenSiteFallbackReason,
} from "./NewApiTokenSiteFallback"

const SLOW_LOAD_MS = 3_000

/** Preserve the elapsed wait when session acquisition hands off to form loading. */
export function NewApiTokenSetupLoading({
  startedAt,
  renderSiteFallback,
}: {
  startedAt?: number
  renderSiteFallback?: (reason: NewApiTokenSiteFallbackReason) => ReactNode
}) {
  const { t } = useTranslation("accountDialog")
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const elapsed = startedAt === undefined ? 0 : Date.now() - startedAt
    setSlow(elapsed >= SLOW_LOAD_MS)
    if (elapsed >= SLOW_LOAD_MS) return
    const timer = setTimeout(() => setSlow(true), SLOW_LOAD_MS - elapsed)
    return () => clearTimeout(timer)
  }, [startedAt])

  return (
    <div className="space-y-density-3">
      <DialogLoadingIndicator
        label={
          slow ? t("tokenCreation.slowLoading") : t("common:status.loading")
        }
      />
      {slow && renderSiteFallback?.(TOKEN_SITE_FALLBACK_REASONS.SLOW)}
    </div>
  )
}
