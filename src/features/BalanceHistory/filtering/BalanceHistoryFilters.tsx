import { useTranslation } from "react-i18next"

import { SegmentedControl } from "~/components/SegmentedControl"
import {
  ActionGroup,
  Button,
  Card,
  Input,
  Label,
  TagFilter,
} from "~/components/ui"
import { QUICK_RANGES } from "~/features/BalanceHistory/contracts"
import { getBalanceHistoryQuickRangeLabel } from "~/features/BalanceHistory/reporting/presentation"
import { type useBalanceHistoryViewModel } from "~/features/BalanceHistory/workspace/useBalanceHistoryViewModel"
import { subtractDaysFromDayKey } from "~/utils/core/dayKey"

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
  const { t } = useTranslation("balanceHistory")
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
    <Card padding="md">
      <div className="space-y-density-4">
        <div>
          <Label className="text-sm font-medium">{t("filters.tags")}</Label>
          <div className="text-muted-foreground text-xs">
            {t("filters.tagsHint")}
          </div>
        </div>
        <TagFilter
          options={tagOptions}
          value={selectedTagIds}
          onChange={setSelectedTagIds}
          includeAllOption
          allLabel={t("filters.allTags")}
          maxVisibleLines={2}
          disabled={tagOptions.length === 0}
        />

        <div>
          <Label className="text-sm font-medium">{t("filters.accounts")}</Label>
          <div className="text-muted-foreground text-xs">
            {t("filters.accountsHint")}
          </div>
        </div>
        <TagFilter
          options={accountOptions}
          value={selectedAccountIds}
          onChange={setSelectedAccountIds}
          includeAllOption
          allLabel={t("filters.allAccounts")}
          maxVisibleLines={3}
          disabled={accountOptions.length === 0}
        />

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
          size="default"
          aria-label={t("settings:display.currencyUnit")}
          value={currencyType}
          onValueChange={handleCurrencyChange}
          options={[
            { value: "USD", label: t("settings:display.usd") },
            { value: "CNY", label: t("settings:display.cny") },
          ]}
        />

        <div>
          <Label className="text-sm font-medium">{t("filters.range")}</Label>
          <div className="text-muted-foreground text-xs">
            {t("filters.rangeHint", { days: safeRetentionDays })}
          </div>
        </div>

        <div className="gap-y-density-3 grid grid-cols-1 gap-x-3 md:grid-cols-2">
          <div className="space-y-density-2">
            <Label className="text-sm font-medium">
              {t("filters.startDay")}
            </Label>
            <Input
              type="date"
              value={startDayKey}
              min={minDayKey || undefined}
              max={maxDayKey || undefined}
              aria-label={t("filters.startDay")}
              onChange={(event) => setStartDayKey(event.target.value)}
              disabled={!minDayKey}
            />
          </div>
          <div className="space-y-density-2">
            <Label className="text-sm font-medium">{t("filters.endDay")}</Label>
            <Input
              type="date"
              value={endDayKey}
              min={minDayKey || undefined}
              max={maxDayKey || undefined}
              aria-label={t("filters.endDay")}
              onChange={(event) => setEndDayKey(event.target.value)}
              disabled={!maxDayKey}
            />
          </div>
        </div>

        <ActionGroup className="items-stretch justify-start">
          {QUICK_RANGES.map((preset) => {
            const label = getBalanceHistoryQuickRangeLabel(t, preset.id)
            return (
              <Button
                key={preset.id}
                size="sm"
                variant="outline"
                onClick={() => {
                  const desired = Math.min(preset.days, safeRetentionDays)
                  setEndDayKey(maxDayKey)
                  setStartDayKey(subtractDaysFromDayKey(maxDayKey, desired - 1))
                }}
              >
                {label}
              </Button>
            )
          })}
        </ActionGroup>

        <div className="text-muted-foreground text-xs">
          {t("summary.coverage", {
            snapshotAvailableDays,
            snapshotCompleteDays: snapshotCompleteDays.snapshotComplete,
            cashflowAvailableDays,
            cashflowCompleteDays: snapshotCompleteDays.cashflowComplete,
            totalDays: perAccountSeries.dayKeys.length,
          })}
        </div>
      </div>
    </Card>
  )
}
