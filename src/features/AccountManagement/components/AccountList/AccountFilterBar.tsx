import { BadgeCheck, CirclePause, Globe2, RefreshCw } from "lucide-react"
import type { ComponentType, SVGProps } from "react"
import { useTranslation } from "react-i18next"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui"
import { cn } from "~/lib/utils"

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
  ) => {
    const selectedLabel = options.find(
      (option) => option.value === value,
    )?.label
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          size="sm"
          className={cn(
            "h-10 w-full min-w-0 gap-1.5 rounded-md border-gray-200 bg-transparent px-2 shadow-none hover:bg-gray-50 data-[size=sm]:h-10 dark:bg-transparent [&_[data-slot='select-value']]:min-w-0 [&_[data-slot='select-value']]:flex-1 [&_[data-slot='select-value']]:overflow-hidden [&_[data-slot='select-value']>div]:min-w-0 [@container(min-width:40rem)]:data-[size=sm]:h-9",
            value !== "all" &&
              "border-blue-200 bg-blue-50/60 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
          )}
          title={selectedLabel}
          data-testid={testId}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="dark:text-dark-text-tertiary flex size-4 shrink-0 items-center justify-center text-gray-500">
              <Icon className="size-3.5" />
            </span>
            <SelectValue
              placeholder={placeholder}
              className="min-w-0 flex-1 truncate text-xs text-gray-700 dark:text-gray-200"
            >
              {selectedLabel}
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent className="max-w-[calc(100vw-2rem)] min-w-[220px]">
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              data-count={option.count}
            >
              <div className="flex w-full min-w-0 items-center gap-3">
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
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
  }

  return (
    <div className="grid grid-cols-2 gap-2 [@container(min-width:40rem)]:grid-cols-4">
      {renderSelect(
        siteTypeValue,
        t("filter.siteType.placeholder"),
        siteTypeOptions,
        onSiteTypeChange,
        "account-filter-site-type",
        Globe2,
      )}
      {renderSelect(
        checkInValue,
        t("filter.checkIn.placeholder"),
        checkInOptions,
        onCheckInChange,
        "account-filter-check-in",
        BadgeCheck,
      )}
      {renderSelect(
        refreshValue,
        t("filter.refresh.placeholder"),
        refreshOptions,
        onRefreshChange,
        "account-filter-refresh",
        RefreshCw,
      )}
      {renderSelect(
        disabledValue,
        t("filter.disabled.placeholder"),
        disabledOptions,
        onDisabledChange,
        "account-filter-disabled",
        CirclePause,
      )}
    </div>
  )
}
