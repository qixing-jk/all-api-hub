import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { cn } from "~/lib/utils"

import { Button } from "./button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

/**
 * Option type for the `SearchableSelect` component.
 *
 * Each option has a string `value` and human‑readable `label`.
 */
export interface SearchableSelectOption {
  value: string
  label: string
  disabled?: boolean
}

/**
 * Props for the `SearchableSelect` component.
 *
 * This component renders a single‑select combobox built on top of
 * the existing `Button`, `Popover`, and `Command` primitives.
 * It is intended as a drop‑in replacement for simple `Select`
 * usages where search is required.
 */
export interface SearchableSelectProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  /**
   * Available options to choose from.
   */
  options: SearchableSelectOption[]

  /**
   * Current selected value. Use an empty string when nothing is selected.
   */
  value: string

  /**
   * Callback fired when the selected value changes.
   */
  onChange: (value: string) => void

  /**
   * Placeholder text shown when no option is selected.
   */
  placeholder?: string

  /**
   * Custom placeholder for the search input inside the popover.
   * Falls back to the i18n key `ui:searchableSelect.searchPlaceholder`.
   */
  searchPlaceholder?: string

  /**
   * Custom message shown when no options match the current search.
   * Falls back to the i18n key `ui:searchableSelect.empty`.
   */
  emptyMessage?: string

  /**
   * Allow selecting a custom value not present in `options`.
   *
   * When enabled, typing in the search input will offer an extra row to use the
   * current search term as the selected value.
   */
  allowCustomValue?: boolean

  /**
   * Optional portal container for the dropdown.
   *
   * When rendering inside a ShadowRoot (content-script UI), portaling to
   * `document.body` would escape styles and be hidden behind high z-index overlays.
   */
  portalContainer?: HTMLElement
}

/**
 * `SearchableSelect` – a searchable single‑select combobox.
 *
 * This component is designed to replace simple `Select` usages on
 * pages like Model List and Key Management, while keeping styling
 * consistent with the existing design system.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  allowCustomValue = false,
  portalContainer,
  className,
  disabled,
  ...buttonProps
}: SearchableSelectProps) {
  const { t } = useTranslation("ui")
  const [open, setOpen] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")

  const selectedOption = React.useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  )

  const displayedLabel = selectedOption
    ? selectedOption.label
    : value || placeholder

  const resolvedSearchPlaceholder =
    searchPlaceholder ?? t("searchableSelect.searchPlaceholder")

  // Provide a better default empty-state message when there are no options at all,
  // especially for allowCustomValue flows where the user is expected to type.
  const defaultEmptyMessage =
    options.length === 0
      ? allowCustomValue
        ? t("searchableSelect.noOptionsAllowCustom")
        : t("searchableSelect.noOptions")
      : t("searchableSelect.empty")

  const resolvedEmptyMessage = emptyMessage ?? defaultEmptyMessage

  const isDisabled = disabled ?? false

  React.useEffect(() => {
    if (!open) setSearchTerm("")
  }, [open])

  const normalizedSearchTerm = searchTerm.trim()
  const canUseCustomValue =
    allowCustomValue &&
    normalizedSearchTerm.length > 0 &&
    !options.some((option) => option.value === normalizedSearchTerm)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          data-slot="searchable-select-trigger"
          className={cn(
            "dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary dark:text-dark-text-primary dark:hover:bg-dark-bg-secondary/80 flex w-full items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-3 text-sm whitespace-nowrap text-gray-900 shadow-xs transition-colors outline-none hover:bg-gray-50 focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-red-500 aria-invalid:focus-visible:ring-red-500/40 data-placeholder:text-gray-400 dark:aria-invalid:border-red-400 dark:aria-invalid:focus-visible:ring-red-400/40 dark:data-placeholder:text-gray-500",
            !selectedOption && "text-muted-foreground",
            className,
          )}
          disabled={isDisabled}
          {...buttonProps}
          rightIcon={
            <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
          }
        >
          {/* Prevent long option labels from overflowing the trigger button. */}
          <span className="min-w-0 flex-1 truncate text-left">
            {displayedLabel}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        container={portalContainer}
        className="w-(--radix-popper-anchor-width) p-0"
      >
        <Command>
          <CommandInput
            placeholder={resolvedSearchPlaceholder}
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
          <CommandList>
            {options.length === 0 && !canUseCustomValue ? (
              <div
                data-slot="searchable-select-empty"
                className="py-6 text-center text-sm"
              >
                {resolvedEmptyMessage}
              </div>
            ) : null}

            {options.length > 0 ? (
              <CommandEmpty>{resolvedEmptyMessage}</CommandEmpty>
            ) : null}
            <CommandGroup>
              {canUseCustomValue ? (
                <CommandItem
                  key={`__custom__:${normalizedSearchTerm}`}
                  value={normalizedSearchTerm}
                  onSelect={() => {
                    onChange(normalizedSearchTerm)
                    setOpen(false)
                  }}
                >
                  <span className="truncate">
                    {t("searchableSelect.useValue", {
                      value: normalizedSearchTerm,
                    })}
                  </span>
                </CommandItem>
              ) : null}
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  disabled={option.disabled}
                  onSelect={() => {
                    if (option.disabled) return
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "size-4",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span>{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
