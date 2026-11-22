import { useId } from "react"
import { useTranslation } from "react-i18next"

import { HelpHintIcon } from "~/components/icons/productIcons"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover"
import { cn } from "~/lib/utils"

type MetricGuideEntry = {
  key: string
  label: string
  description: string
  currencyCode?: string
}

/** Explains the chart metrics and units beside the metric selector. */
export function BalanceHistoryMetricHelp({
  chart,
  options,
  selectedKey,
}: {
  chart: string
  options: MetricGuideEntry[]
  selectedKey: string
}) {
  const { t, i18n } = useTranslation("balanceHistory")
  const titleId = useId()
  const descriptionId = useId()
  const selected = options.find(({ key }) => key === selectedKey)
  const entries = selected
    ? [selected, ...options.filter(({ key }) => key !== selectedKey)]
    : options
  const currencyNames = new Intl.DisplayNames(i18n.resolvedLanguage, {
    type: "currency",
    fallback: "none",
  })
  const currencies = [
    ...new Set(
      entries.flatMap(({ currencyCode }) =>
        currencyCode ? [currencyCode] : [],
      ),
    ),
  ].flatMap((code) => {
    const name = currencyNames.of(code)
    return name ? [`${code} · ${name}`] : []
  })

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("metricHelp.trigger", { chart })}
          className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded-md px-1 text-xs whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <HelpHintIcon aria-hidden="true" className="size-3.5" />
          {t("metricHelp.title")}
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-labelledby={titleId}
        aria-describedby={currencies.length ? descriptionId : undefined}
        align="start"
        collisionPadding={12}
        className="max-h-(--radix-popover-content-available-height) w-md max-w-(--radix-popover-content-available-width) space-y-3 overflow-y-auto overscroll-contain"
      >
        <PopoverHeader>
          <PopoverTitle id={titleId}>{t("metricHelp.title")}</PopoverTitle>
          {currencies.length > 0 && (
            <PopoverDescription id={descriptionId} className="text-xs">
              {currencies.join(" / ")}
            </PopoverDescription>
          )}
        </PopoverHeader>
        <dl className="space-y-2 border-t pt-3 text-sm leading-snug">
          {entries.map(({ key, label, description }) => (
            <div
              key={key}
              className={cn(
                "px-2",
                key === selectedKey && "rounded-md bg-muted py-2",
              )}
            >
              <dt
                aria-current={key === selectedKey ? "true" : undefined}
                className="font-medium"
              >
                {label}
              </dt>
              <dd className="mt-0.5 text-muted-foreground">{description}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  )
}
