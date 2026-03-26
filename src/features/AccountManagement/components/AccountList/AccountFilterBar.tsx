import {
  ArrowPathIcon,
  CheckBadgeIcon,
  GlobeAltIcon,
  PauseCircleIcon,
} from "@heroicons/react/24/outline"
import type { ComponentType, SVGProps } from "react"
import { useTranslation } from "react-i18next"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"

export interface AccountFilterSelectOption {
  value: string
  label: string
  count?: number
}

type FilterIcon = ComponentType<SVGProps<SVGSVGElement>>

interface AccountFilterBarProps {
  disabledValue: string
  siteTypeValue: string
  refreshValue: string
  checkInValue: string
  disabledOptions: AccountFilterSelectOption[]
  siteTypeOptions: AccountFilterSelectOption[]
  refreshOptions: AccountFilterSelectOption[]
  checkInOptions: AccountFilterSelectOption[]
  onDisabledChange: (value: string) => void
  onSiteTypeChange: (value: string) => void
  onRefreshChange: (value: string) => void
  onCheckInChange: (value: string) => void
}

/**
 * Compact filter bar for account-list status filters that deserve dedicated controls
 * instead of being mixed into the tag chip strip.
 */
export default function AccountFilterBar({
  disabledValue,
  siteTypeValue,
  refreshValue,
  checkInValue,
  disabledOptions,
  siteTypeOptions,
  refreshOptions,
  checkInOptions,
  onDisabledChange,
  onSiteTypeChange,
  onRefreshChange,
  onCheckInChange,
}: AccountFilterBarProps) {
  const { t } = useTranslation("account")

  const renderSelect = (
    value: string,
    placeholder: string,
    options: AccountFilterSelectOption[],
    onChange: (value: string) => void,
    testId: string,
    Icon: FilterIcon,
  ) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary/70 h-10 w-full min-w-0 rounded-lg border border-gray-200 bg-white pr-2 pl-2.5 shadow-xs transition-colors hover:border-gray-300 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500/50 md:min-w-[140px] xl:min-w-[160px]"
        data-testid={testId}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="dark:text-dark-text-tertiary flex h-5 w-5 shrink-0 items-center justify-center text-gray-500">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <SelectValue
            placeholder={placeholder}
            className="min-w-0 text-[13px] font-medium text-gray-700 dark:text-gray-200"
          />
        </div>
      </SelectTrigger>
      <SelectContent className="min-w-[220px]">
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            data-count={option.count}
          >
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="truncate">{option.label}</span>
              {typeof option.count === "number" && (
                <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                  {option.count}
                </span>
              )}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
      {renderSelect(
        siteTypeValue,
        t("filter.siteType.placeholder"),
        siteTypeOptions,
        onSiteTypeChange,
        "account-filter-site-type",
        GlobeAltIcon,
      )}
      {renderSelect(
        checkInValue,
        t("filter.checkIn.placeholder"),
        checkInOptions,
        onCheckInChange,
        "account-filter-check-in",
        CheckBadgeIcon,
      )}
      {renderSelect(
        refreshValue,
        t("filter.refresh.placeholder"),
        refreshOptions,
        onRefreshChange,
        "account-filter-refresh",
        ArrowPathIcon,
      )}
      {renderSelect(
        disabledValue,
        t("filter.disabled.placeholder"),
        disabledOptions,
        onDisabledChange,
        "account-filter-disabled",
        PauseCircleIcon,
      )}
    </div>
  )
}
