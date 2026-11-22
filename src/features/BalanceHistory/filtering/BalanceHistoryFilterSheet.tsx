import { Funnel } from "lucide-react"
import { useRef, type ComponentProps, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet"
import { getBalanceHistoryQuickRangeLabel } from "~/features/BalanceHistory/reporting/presentation"
import type { useBalanceHistoryViewModel } from "~/features/BalanceHistory/workspace/useBalanceHistoryViewModel"
import { cn } from "~/lib/utils"

import { BalanceHistoryFilters } from "./BalanceHistoryFilters"

type FilterSummaryModel = Pick<
  ReturnType<typeof useBalanceHistoryViewModel>,
  | "effectiveRange"
  | "effectiveAccountCount"
  | "hasActiveFilters"
  | "resetFilters"
>

/** Show the report filter summary and open its controls on demand. */
export function BalanceHistoryFilterSheet({
  model,
  heading,
  periodEnd,
}: {
  heading?: string
  periodEnd?: ReactNode
  model: ComponentProps<typeof BalanceHistoryFilters>["model"] &
    FilterSummaryModel
}) {
  const { t, i18n } = useTranslation("balanceHistory")
  const titleRef = useRef<HTMLHeadingElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { startDayKey, endDayKey } = model.effectiveRange
  const dateRange = model.activeQuickRangeId
    ? getBalanceHistoryQuickRangeLabel(t, model.activeQuickRangeId)
    : new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
        dateStyle: "medium",
        timeZone: "UTC",
      }).formatRange(new Date(startDayKey), new Date(endDayKey))
  const selectedTags = model.tagOptions
    .filter((tag) => model.selectedTagIds.includes(tag.value))
    .map((tag) => tag.label)
  const tagSummary = new Intl.ListFormat(
    i18n.resolvedLanguage ?? i18n.language,
    {
      style: "short",
    },
  ).format(selectedTags)
  const summary = [
    dateRange,
    t("filters.accountCount", { count: model.effectiveAccountCount }),
    tagSummary,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div
      role="group"
      aria-label={t("filters.title")}
      className={cn(
        "max-w-full min-w-0 items-center gap-x-3 gap-y-density-1",
        heading ? "grid grid-cols-[minmax(0,1fr)_auto]" : "flex flex-wrap",
      )}
    >
      {heading && (
        <h2 className="col-start-1 row-start-1 text-sm font-semibold [overflow-wrap:anywhere]">
          {heading}
        </h2>
      )}
      <div
        className={cn(
          "flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-density-1 text-xs text-muted-foreground",
          heading && "col-span-2 col-start-1 row-start-2",
        )}
      >
        <span className="max-w-full min-w-0 truncate" title={summary}>
          {summary}
        </span>
        {periodEnd}
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center gap-x-2",
          heading && "col-start-2 row-start-1",
        )}
      >
        {model.hasActiveFilters && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              model.resetFilters()
              triggerRef.current?.focus()
            }}
          >
            {t("common:actions.reset")}
          </Button>
        )}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              ref={triggerRef}
              size="sm"
              variant="outline"
              leftIcon={<Funnel className="h-4 w-4" />}
            >
              {t("filters.title")}
            </Button>
          </SheetTrigger>
          <SheetContent
            className="w-full max-w-full gap-y-0 overflow-clip sm:max-w-xl"
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              titleRef.current?.focus()
            }}
          >
            <SheetHeader className="flex-row items-start gap-x-3 border-b border-border">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
                <Funnel aria-hidden="true" className="size-4" />
              </span>
              <div className="space-y-density-1">
                <SheetTitle
                  ref={titleRef}
                  tabIndex={-1}
                  className="outline-none"
                >
                  {t("filters.title")}
                </SheetTitle>
                <SheetDescription className="text-xs">
                  {t("filters.description")}
                </SheetDescription>
              </div>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4">
              <BalanceHistoryFilters model={model} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}
