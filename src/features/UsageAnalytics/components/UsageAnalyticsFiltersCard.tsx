import { useTranslation } from "react-i18next"

import { Card, Input, Label, TagFilter } from "~/components/ui"

type UsageAnalyticsFilterOption = {
  value: string
  label: string
  title?: string
  count?: number
}

interface UsageAnalyticsFiltersCardProps {
  siteOptions: UsageAnalyticsFilterOption[]
  selectedSiteIds: string[]
  onSiteChange: (value: string[]) => void
  accountOptions: UsageAnalyticsFilterOption[]
  selectedAccountIds: string[]
  onAccountChange: (value: string[]) => void
  isAccountFilterDisabled: boolean
  tokenOptions: UsageAnalyticsFilterOption[]
  selectedTokenIds: string[]
  onTokenChange: (value: string[]) => void
  startDay: string
  endDay: string
  minDay: string
  maxDay: string
  onStartDayChange: (value: string) => void
  onEndDayChange: (value: string) => void
}

/**
 * Renders the usage analytics filters card.
 */
export default function UsageAnalyticsFiltersCard({
  siteOptions,
  selectedSiteIds,
  onSiteChange,
  accountOptions,
  selectedAccountIds,
  onAccountChange,
  isAccountFilterDisabled,
  tokenOptions,
  selectedTokenIds,
  onTokenChange,
  startDay,
  endDay,
  minDay,
  maxDay,
  onStartDayChange,
  onEndDayChange,
}: UsageAnalyticsFiltersCardProps) {
  const { t } = useTranslation("usageAnalytics")

  return (
    <Card padding="md">
      <div className="space-y-3">
        {/*site filter*/}
        <div>
          <Label className="text-sm font-medium">{t("filters.sites")}</Label>
          <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
            {t("filters.sitesHint")}
          </div>
        </div>
        <TagFilter
          options={siteOptions}
          value={selectedSiteIds}
          onChange={onSiteChange}
          includeAllOption
          allLabel={t("filters.allSites")}
          maxVisibleLines={2}
          disabled={siteOptions.length === 0}
        />

        {/*account filter*/}
        <div>
          <Label className="text-sm font-medium">{t("filters.accounts")}</Label>
          <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
            {t("filters.accountsHint")}
          </div>
        </div>
        <TagFilter
          options={accountOptions}
          value={selectedAccountIds}
          onChange={onAccountChange}
          includeAllOption
          allLabel={t("filters.allAccounts")}
          maxVisibleLines={2}
          disabled={isAccountFilterDisabled}
        />

        {/*API token filter*/}
        <div>
          <Label className="text-sm font-medium">{t("filters.tokens")}</Label>
          <div className="dark:text-dark-text-tertiary text-xs text-gray-500">
            {t("filters.tokensHint")}
          </div>
        </div>
        <TagFilter
          options={tokenOptions}
          value={selectedTokenIds}
          onChange={onTokenChange}
          includeAllOption
          allLabel={t("filters.allTokens")}
          maxVisibleLines={2}
          disabled={tokenOptions.length === 0}
        />

        {/*Date range filter*/}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {t("filters.startDay")}
            </Label>
            <Input
              type="date"
              value={startDay}
              min={minDay || undefined}
              max={maxDay || undefined}
              onChange={(event) => onStartDayChange(event.target.value)}
              disabled={!minDay}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("filters.endDay")}</Label>
            <Input
              type="date"
              value={endDay}
              min={minDay || undefined}
              max={maxDay || undefined}
              onChange={(event) => onEndDayChange(event.target.value)}
              disabled={!maxDay}
            />
          </div>
        </div>
      </div>
    </Card>
  )
}
