import { Clock3 } from "lucide-react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import type { BalancePosition } from "~/services/amounts/balance"
import { createUnixDayKeyFormatter } from "~/utils/core/dayKey"

type Window = NonNullable<BalancePosition["window"]>

/** Reuse the date for a same-day range and keep both endpoints when dates differ. */
function describeWindow(
  { start, end, timeZone, resetsAt }: Window,
  locale: string,
) {
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone,
  })
  const dateTime = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
    hourCycle: "h23",
    timeZone,
  })
  const startDay = date.format(start)
  const sameDay = startDay === date.format(end)
  const formatter = sameDay
    ? new Intl.DateTimeFormat(locale, {
        timeStyle: "medium",
        hourCycle: "h23",
        timeZone,
      })
    : dateTime
  const compact = new Intl.DateTimeFormat(locale, {
    ...(sameDay ? {} : { dateStyle: "medium" }),
    timeStyle: "short",
    hourCycle: "h23",
    timeZone,
  })
  const formatRange = (format: Intl.DateTimeFormat) =>
    format.formatRange?.(start, end) ??
    `${format.format(start)} – ${format.format(end)}`
  const range = formatRange(formatter)
  const sameMinute = compact.format(start) === compact.format(end)
  return {
    summary: sameMinute ? range : formatRange(compact),
    cutoff: (sameMinute ? formatter : compact).format(end),
    sameDay,
    range,
    context: sameDay ? `${startDay} · ${timeZone}` : timeZone,
    reset: resetsAt === undefined ? undefined : dateTime.format(resetsAt),
  }
}

/** Shows a compact clock range with precise times and the source timezone on demand. */
export function ObservationWindow({
  window,
  today = false,
}: {
  window: Window
  /** A day-to-date interval starts at the local day boundary and ends no later than the next one. */
  today?: boolean
}) {
  const { t, i18n } = useTranslation("account")
  let presentation
  let displayTimeZone = window.timeZone
  try {
    presentation = describeWindow(window, i18n.language)
  } catch {
    displayTimeZone = "UTC"
    presentation = describeWindow({ ...window, timeZone: "UTC" }, "en")
  }
  const dayKey = createUnixDayKeyFormatter(displayTimeZone)
  const startsAtDayBoundary =
    dayKey(window.start / 1000) !== dayKey((window.start - 1) / 1000)
  const summary =
    today && startsAtDayBoundary
      ? presentation.sameDay
        ? t("financial.observedThrough", { time: presentation.cutoff })
        : t("financial.fullDay")
      : presentation.summary
  return (
    <Tooltip
      anchorAsChild
      openOnClick
      content={[
        presentation.range,
        presentation.context,
        presentation.reset &&
          `${t("financial.resetsAt")} · ${presentation.reset}`,
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      <button
        type="button"
        aria-label={`${t("financial.window")} · ${summary}`}
        className="inline-flex max-w-full cursor-help items-center gap-1.5 rounded-sm text-left text-muted-foreground tabular-nums outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Clock3 aria-hidden="true" className="size-3 shrink-0" />
        <span className="min-w-0 break-words">{summary}</span>
      </button>
    </Tooltip>
  )
}
