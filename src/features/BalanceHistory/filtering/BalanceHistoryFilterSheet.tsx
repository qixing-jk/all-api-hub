import { Funnel } from "lucide-react"
import { useRef, type ComponentProps } from "react"
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

import { BalanceHistoryFilters } from "./BalanceHistoryFilters"

type FilterSummaryModel = Pick<
  ReturnType<typeof useBalanceHistoryViewModel>,
  | "effectiveRange"
  | "effectiveAccountCount"
  | "hasActiveFilters"
  | "resetFilters"
>

/** Keep reporting filters available without taking space above the overview. */
export function BalanceHistoryFilterSheet({
  model,
}: {
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
    <div className="gap-y-density-1 flex max-w-full min-w-0 flex-wrap items-center gap-x-2">
      <span
        className="text-muted-foreground max-w-full min-w-0 truncate text-xs"
        title={summary}
      >
        {summary}
      </span>
      <div className="flex shrink-0 items-center gap-x-2">
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
            <SheetHeader className="border-border flex-row items-start gap-x-3 border-b">
              <span className="bg-primary-soft text-primary-soft-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
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
