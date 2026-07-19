import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { cn } from "~/lib/utils"

import { KILO_CODE_EXPORT_TEST_IDS } from "./kiloCodeExportTestIds"

const MAX_RENDERED_KILO_CODE_MODELS = 100

export interface KiloCodeDefaultModelSelectProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  value: string
  modelIds: string[]
  onChange: (value: string) => void
  allowCustomValue?: boolean
  placeholder?: string
  searchPlaceholder?: string
  portalContainer?: HTMLElement
}

interface BoundedModelResults {
  customValue?: string
  matchingCount: number
  renderedModelIds: string[]
  visibleMatchingCount: number
}

/** Filter the full catalog, then fit catalog, selected, and custom rows safely. */
function getBoundedModelResults({
  allowCustomValue,
  modelIds,
  search,
  value,
}: Pick<
  KiloCodeDefaultModelSelectProps,
  "allowCustomValue" | "modelIds" | "value"
> & { search: string }): BoundedModelResults {
  const normalizedSearch = search.trim()
  const normalizedQuery = normalizedSearch.toLocaleLowerCase()
  const isSearchActive = normalizedSearch.length > 0
  const matchingModelIds = modelIds.filter((modelId) =>
    modelId.toLocaleLowerCase().includes(normalizedQuery),
  )
  const customValue =
    allowCustomValue &&
    normalizedSearch.length > 0 &&
    !modelIds.includes(normalizedSearch)
      ? normalizedSearch
      : undefined
  const isSelectedInCatalog = modelIds.includes(value)
  const selectedMatchesSearch =
    !isSearchActive || value.toLocaleLowerCase().includes(normalizedQuery)
  const canRenderSelected =
    value.length > 0 &&
    selectedMatchesSearch &&
    (isSelectedInCatalog || Boolean(allowCustomValue)) &&
    customValue !== value
  const hasExternalSelectedRow = canRenderSelected && !isSelectedInCatalog
  const catalogBudget =
    MAX_RENDERED_KILO_CODE_MODELS -
    (customValue ? 1 : 0) -
    (hasExternalSelectedRow ? 1 : 0)
  const renderedModelIds = matchingModelIds.slice(0, catalogBudget)

  if (canRenderSelected && !renderedModelIds.includes(value)) {
    if (hasExternalSelectedRow || renderedModelIds.length < catalogBudget) {
      renderedModelIds.push(value)
    } else if (catalogBudget > 0) {
      renderedModelIds[catalogBudget - 1] = value
    }
  }

  const matchingModelIdSet = new Set(matchingModelIds)

  return {
    customValue,
    matchingCount: matchingModelIds.length,
    renderedModelIds,
    visibleMatchingCount: renderedModelIds.filter((modelId) =>
      matchingModelIdSet.has(modelId),
    ).length,
  }
}

/**
 * Select a Kilo Code default model without mounting an unbounded upstream
 * catalog in the DOM.
 */
export const KiloCodeDefaultModelSelect = React.forwardRef<
  HTMLButtonElement,
  KiloCodeDefaultModelSelectProps
>(function KiloCodeDefaultModelSelect(
  {
    value,
    modelIds,
    onChange,
    allowCustomValue = false,
    placeholder,
    searchPlaceholder,
    portalContainer,
    className,
    disabled,
    ...buttonProps
  },
  ref,
) {
  const { t } = useTranslation("ui")
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const { customValue, matchingCount, renderedModelIds, visibleMatchingCount } =
    React.useMemo(
      () =>
        getBoundedModelResults({
          allowCustomValue,
          modelIds,
          search,
          value,
        }),
      [allowCustomValue, modelIds, search, value],
    )
  const isLimited = matchingCount > visibleMatchingCount
  const limitedMessageValues = {
    visible: visibleMatchingCount,
    count: matchingCount,
  }
  const resolvedSearchPlaceholder =
    searchPlaceholder ?? t("searchableSelect.searchPlaceholder")
  const emptyMessage =
    modelIds.length === 0
      ? allowCustomValue
        ? t("searchableSelect.noOptionsAllowCustom")
        : t("searchableSelect.noOptions")
      : t("searchableSelect.empty")

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) setSearch("")
  }

  const handleSelect = (modelId: string) => {
    onChange(modelId)
    handleOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          {...buttonProps}
          ref={ref}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={
            buttonProps["aria-label"] ??
            (buttonProps["aria-labelledby"] ? undefined : value || placeholder)
          }
          data-testid={KILO_CODE_EXPORT_TEST_IDS.defaultModel}
          data-placeholder={value ? undefined : ""}
          disabled={disabled}
          className={cn(
            "dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary dark:text-dark-text-primary dark:hover:bg-dark-bg-secondary/80 flex w-full items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm whitespace-nowrap text-gray-900 shadow-xs transition-colors outline-none hover:bg-gray-50 focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-red-500 aria-invalid:focus-visible:ring-red-500/40 data-placeholder:text-gray-400 dark:aria-invalid:border-red-400 dark:aria-invalid:focus-visible:ring-red-400/40 dark:data-placeholder:text-gray-500",
            !value && "text-muted-foreground",
            className,
          )}
          rightIcon={
            <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
          }
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {value || placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        container={portalContainer}
        className="flex max-h-(--radix-popover-content-available-height) w-(--radix-popper-anchor-width) flex-col overflow-hidden p-0"
        collisionPadding={8}
      >
        <Command
          shouldFilter={false}
          label={resolvedSearchPlaceholder}
          className="min-h-0 flex-1 [&_[data-slot='command-input-wrapper']]:shrink-0"
        >
          <CommandInput
            aria-label={resolvedSearchPlaceholder}
            placeholder={resolvedSearchPlaceholder}
            value={search}
            onValueChange={setSearch}
            data-testid={KILO_CODE_EXPORT_TEST_IDS.defaultModelSearch}
          />
          {isLimited ? (
            <div
              role="status"
              className="text-muted-foreground shrink-0 border-b px-3 py-2 text-xs"
            >
              {t(
                "dialog.kiloCode.messages.modelSearchLimited",
                limitedMessageValues,
              )}
            </div>
          ) : null}
          <CommandList className="min-h-0 flex-1">
            {!renderedModelIds.length && !customValue ? (
              <CommandEmpty>{emptyMessage}</CommandEmpty>
            ) : null}
            <CommandGroup>
              {customValue ? (
                <CommandItem
                  value={customValue}
                  data-testid={KILO_CODE_EXPORT_TEST_IDS.modelOption}
                  onSelect={() => handleSelect(customValue)}
                >
                  <CheckIcon
                    className={cn(
                      "size-4",
                      value === customValue ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {t("searchableSelect.useValue", { value: customValue })}
                  </span>
                </CommandItem>
              ) : null}
              {renderedModelIds.map((modelId) => (
                <CommandItem
                  key={modelId}
                  value={modelId}
                  data-testid={KILO_CODE_EXPORT_TEST_IDS.modelOption}
                  onSelect={() => handleSelect(modelId)}
                >
                  <CheckIcon
                    className={cn(
                      "size-4",
                      value === modelId ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{modelId}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
})
