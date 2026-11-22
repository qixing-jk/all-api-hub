import { useEffect, useReducer } from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { formatRelativeTime } from "~/utils/core/formatters"

/** Show observation age beside its amount; keep the exact time available on focus or tap. */
export function FinancialObservationTime({
  observedAt,
}: {
  observedAt: number
}) {
  const { t, i18n } = useTranslation("account")
  const [, update] = useReducer((value: number) => value + 1, 0)
  useEffect(() => {
    const timer = setInterval(update, 60_000)
    window.addEventListener("focus", update)
    document.addEventListener("visibilitychange", update)
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", update)
      document.removeEventListener("visibilitychange", update)
    }
  }, [])

  const date = new Date(observedAt)
  if (!Number.isFinite(date.getTime())) return null
  const exact = date.toLocaleString(i18n.language)
  return (
    <Tooltip
      content={`${t("financial.observedAt")}: ${exact}`}
      anchorAsChild
      openOnClick
    >
      <time
        dateTime={date.toISOString()}
        title={exact}
        tabIndex={0}
        className="inline-block cursor-help rounded-sm text-xs font-normal text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {formatRelativeTime(date)}
      </time>
    </Tooltip>
  )
}
