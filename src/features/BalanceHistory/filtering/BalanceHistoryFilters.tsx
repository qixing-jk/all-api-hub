import { Info } from "lucide-react"
import { useTranslation } from "react-i18next"

import { SegmentedControl } from "~/components/SegmentedControl"
import { ActionGroup, Button, Label } from "~/components/ui"
import { useDatePickerLocale } from "~/components/ui/useDatePickerLocale"
import { QUICK_RANGES } from "~/features/BalanceHistory/contracts"
import { BalanceHistoryDateField } from "~/features/BalanceHistory/filtering/BalanceHistoryDateField"
import { BalanceHistoryOptionFilter } from "~/features/BalanceHistory/filtering/BalanceHistoryOptionFilter"
import { getBalanceHistoryQuickRangeLabel } from "~/features/BalanceHistory/reporting/presentation"
import { type useBalanceHistoryViewModel } from "~/features/BalanceHistory/workspace/useBalanceHistoryViewModel"

/** Render this reporting section from its existing ViewModel snapshot. */
export function BalanceHistoryFilters({
  model,
}: {
  model: Pick<
    ReturnType<typeof useBalanceHistoryViewModel>,
    | "tagOptions"
    | "selectedTagIds"
    | "setSelectedTagIds"
    | "accountOptions"
    | "selectedAccountIds"
    | "setSelectedAccountIds"
    | "currencyType"
    | "handleCurrencyChange"
    | "safeRetentionDays"
    | "activeQuickRangeId"
    | "applyQuickRange"
    | "startDayKey"
    | "minDayKey"
    | "maxDayKey"
    | "setStartDayKey"
    | "endDayKey"
    | "setEndDayKey"
    | "snapshotAvailableDays"
    | "snapshotCompleteDays"
    | "cashflowAvailableDays"
    | "perAccountSeries"
  >
}) {
  const { t, i18n } = useTranslation("balanceHistory")
  const calendarLocale = useDatePickerLocale(
    undefined,
    i18n.resolvedLanguage ?? i18n.language,
  )
  const {
    tagOptions,
    selectedTagIds,
    setSelectedTagIds,
    accountOptions,
    selectedAccountIds,
    setSelectedAccountIds,
    currencyType,
    handleCurrencyChange,
    safeRetentionDays,
    activeQuickRangeId,
    applyQuickRange,
    startDayKey,
    minDayKey,
    maxDayKey,
    setStartDayKey,
    endDayKey,
    setEndDayKey,
    snapshotAvailableDays,
    snapshotCompleteDays,
    cashflowAvailableDays,
    perAccountSeries,
  } = model
  return (
    <div className="divide-border divide-y">
      <BalanceHistoryOptionFilter
        title={t("filters.tags")}
        hint={t("filters.tagsHint")}
        searchLabel={t("filters.searchTags")}
        options={tagOptions}
        value={selectedTagIds}
        onChange={setSelectedTagIds}
        allLabel={t("filters.allTags")}
        maxVisibleLines={2}
      />
      <BalanceHistoryOptionFilter
        title={t("filters.accounts")}
        hint={t("filters.accountsHint")}
        searchLabel={t("filters.searchAccounts")}
        options={accountOptions}
        value={selectedAccountIds}
        onChange={setSelectedAccountIds}
        allLabel={t("filters.allAccounts")}
        maxVisibleLines={3}
      />

      <div className="py-density-4 gap-y-density-2 flex flex-wrap items-center justify-between gap-x-3">
        <div>
          <Label className="text-sm font-medium">
            {t("settings:display.currencyUnit")}
          </Label>
          <div className="text-muted-foreground text-xs">
            {t("settings:display.currencyDesc")}
          </div>
        </div>

        <SegmentedControl
          layout="fit"
          size="sm"
          aria-label={t("settings:display.currencyUnit")}
          value={currencyType}
          onValueChange={handleCurrencyChange}
          options={[
            { value: "USD", label: t("settings:display.usd") },
            { value: "CNY", label: t("settings:display.cny") },
          ]}
        />
      </div>

      <div className="space-y-density-3 py-density-4">
        <div>
          <Label className="text-sm font-medium">{t("filters.range")}</Label>
          <div className="text-muted-foreground text-xs">
            {t("filters.rangeHint", { days: safeRetentionDays })}
          </div>
        </div>

        <ActionGroup className="items-stretch justify-start">
          {QUICK_RANGES.map((preset) => {
            const label = getBalanceHistoryQuickRangeLabel(t, preset.id)
            const active = activeQuickRangeId === preset.id
            return (
              <Button
                key={preset.id}
                size="sm"
                variant={active ? "default" : "secondary"}
                aria-pressed={active}
                onClick={() => applyQuickRange(preset.days)}
              >
                {label}
              </Button>
            )
          })}
        </ActionGroup>

        <div className="gap-y-density-3 grid grid-cols-1 gap-x-3 sm:grid-cols-2">
          <BalanceHistoryDateField
            label={t("filters.startDay")}
            value={startDayKey}
            minDayKey={minDayKey}
            maxDayKey={
              endDayKey && endDayKey < maxDayKey ? endDayKey : maxDayKey
            }
            locale={calendarLocale}
            onChange={setStartDayKey}
          />
          <BalanceHistoryDateField
            label={t("filters.endDay")}
            value={endDayKey}
            minDayKey={startDayKey > minDayKey ? startDayKey : minDayKey}
            maxDayKey={maxDayKey}
            locale={calendarLocale}
            onChange={setEndDayKey}
          />
        </div>
      </div>

      <div className="text-muted-foreground py-density-3 flex items-start gap-2 text-xs">
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {t("summary.coverage", {
            snapshotAvailableDays,
            snapshotCompleteDays: snapshotCompleteDays.snapshotComplete,
            cashflowAvailableDays,
            cashflowCompleteDays: snapshotCompleteDays.cashflowComplete,
            totalDays: perAccountSeries.dayKeys.length,
          })}
        </span>
      </div>
    </div>
  )
}
