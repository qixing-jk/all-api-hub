import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react"
import * as React from "react"
import { useTranslation } from "react-i18next"

import { cn } from "~/lib/utils"

import { Badge } from "./badge"
import { Button } from "./button"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "./combobox"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

export interface CompactMultiSelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface CompactMultiSelectProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  options: CompactMultiSelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  /**
   * Optional field label rendered above the control (mirrors legacy `MultiSelect` usage).
   */
  label?: string
  /**
   * Controls how selected values are displayed.
   * - `summary`: button trigger with preview text + count
   * - `chips`: inline chips with a searchable input
   */
  displayMode?: "summary" | "chips"
  /**
   * Placeholder shown when no selection is made.
   * Defaults to the localized `ui:multiSelect.placeholder` string.
   */
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  /**
   * When enabled, pressing Enter with a non-empty search term can add values that are not present
   * in `options` (useful for model ids / group ids that may not be listed yet).
   */
  allowCustom?: boolean
  /**
   * When `allowCustom` is enabled, Enter can parse comma-separated values and add them in batch.
   */
  parseCommaStrings?: boolean
  /**
   * Max number of selected labels shown in the trigger before collapsing to a "+N" suffix.
   */
  maxDisplayValues?: number
  searchPlaceholder?: string
  emptyMessage?: string
  /**
   * Trigger button size. Defaults to "sm" to keep the control compact.
   */
  size?: React.ComponentProps<typeof Button>["size"]
}

/**
 * CompactMultiSelect
 *
 * A compact multi-select combobox built from shadcn-style primitives (Popover + Command).
 *
 * Compared to the legacy `MultiSelect`, this aims to take less vertical space by using a
 * button trigger (with a summary + count badge) instead of an always-visible input field.
 */
export function CompactMultiSelect({
  options,
  selected,
  onChange,
  label,
  displayMode = "chips",
  placeholder,
  disabled = false,
  clearable = true,
  allowCustom = false,
  parseCommaStrings = true,
  maxDisplayValues = 2,
  searchPlaceholder,
  emptyMessage,
  size = "sm",
  className,
  ...buttonProps
}: CompactMultiSelectProps) {
  const { t } = useTranslation("ui")
  const localizedPlaceholder = placeholder ?? t("ui:multiSelect.placeholder")
  const [open, setOpen] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")
  const chipsAnchor = useComboboxAnchor()
  const actionsRef = React.useRef<HTMLDivElement | null>(null)
  const [actionsOrientation, setActionsOrientation] = React.useState<
    "horizontal" | "vertical"
  >("horizontal")
  const reactId = React.useId()
  const labelId = label ? `${reactId}-label` : undefined

  const optionsByValue = React.useMemo(() => {
    return new Map(options.map((option) => [option.value, option]))
  }, [options])

  const selectableOptionValues = React.useMemo(() => {
    return options
      .filter((option) => !option.disabled)
      .map((option) => option.value)
  }, [options])

  const allSelectableOptionsSelected = React.useMemo(() => {
    if (selectableOptionValues.length === 0) return false
    const selectedSet = new Set(selected)
    return selectableOptionValues.every((value) => selectedSet.has(value))
  }, [selectableOptionValues, selected])

  const selectAllSelectableOptions = React.useCallback(() => {
    if (disabled) return
    if (selectableOptionValues.length === 0) return

    const selectedSet = new Set(selected)
    const next = [...selected]

    for (const value of selectableOptionValues) {
      if (!selectedSet.has(value)) next.push(value)
    }

    onChange(next)
    setSearchTerm("")
  }, [disabled, onChange, selectableOptionValues, selected])

  const selectedLabels = React.useMemo(() => {
    return selected.map((value) => optionsByValue.get(value)?.label ?? value)
  }, [optionsByValue, selected])

  const hasSelection = selected.length > 0

  const triggerText = React.useMemo(() => {
    if (!hasSelection) return localizedPlaceholder

    const safeMaxDisplayValues = Math.max(1, maxDisplayValues)
    const preview = selectedLabels.slice(0, safeMaxDisplayValues)
    const remaining = selectedLabels.length - preview.length

    const base = preview.join(", ")
    if (remaining > 0) return `${base} +${remaining}`
    return base
  }, [hasSelection, localizedPlaceholder, maxDisplayValues, selectedLabels])

  const resolvedSearchPlaceholder =
    searchPlaceholder ?? t("ui:searchableSelect.searchPlaceholder")

  const defaultEmptyMessage =
    options.length === 0
      ? t("ui:searchableSelect.noOptions")
      : t("ui:searchableSelect.empty")

  const resolvedEmptyMessage = emptyMessage ?? defaultEmptyMessage

  React.useEffect(() => {
    if (!open) setSearchTerm("")
  }, [open])

  React.useEffect(() => {
    if (displayMode !== "chips") return

    const element = chipsAnchor.current
    if (!element) return

    const computeOrientation = () => {
      const chipsHeight = element.getBoundingClientRect().height
      const actionsEl = actionsRef.current
      const actionButtons = actionsEl?.querySelectorAll("button") ?? []
      const firstButton = actionButtons[0] as HTMLButtonElement | undefined

      if (!firstButton) {
        setActionsOrientation("horizontal")
        return
      }

      const buttonHeight = firstButton.getBoundingClientRect().height
      if (!Number.isFinite(buttonHeight) || buttonHeight <= 0) {
        setActionsOrientation("horizontal")
        return
      }

      // Switch to vertical only when the chips control is tall enough to host two icon buttons
      // without increasing total row height (i.e. the buttons can stretch to match the chips).
      const canUseVertical = chipsHeight >= buttonHeight * 2
      setActionsOrientation(canUseVertical ? "vertical" : "horizontal")
    }

    computeOrientation()

    const observer = new ResizeObserver(() => {
      computeOrientation()
    })

    observer.observe(element)
    if (actionsRef.current) observer.observe(actionsRef.current)

    return () => observer.disconnect()
  }, [chipsAnchor, displayMode])

  const normalizeCustomValues = React.useCallback(
    (raw: string) => {
      const trimmed = (raw ?? "").trim()
      if (!trimmed) return []

      // When parsing custom values, accept both comma-separated and newline-separated
      // input (e.g. pasted lists). This keeps `allowCustom` + `parseCommaStrings`
      // behavior consistent across typing and paste.
      const shouldSplit =
        allowCustom && parseCommaStrings && /[,\r\n]+/.test(trimmed)
      const parts = shouldSplit ? trimmed.split(/[,\r\n]+/) : [trimmed]

      return parts
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    },
    [allowCustom, parseCommaStrings],
  )

  const commitCustomValues = React.useCallback(
    (raw: string) => {
      if (!allowCustom || disabled) return

      const nextValues = normalizeCustomValues(raw).filter(
        (value) => !selected.includes(value),
      )

      if (nextValues.length > 0) {
        onChange([...selected, ...nextValues])
      }

      setSearchTerm("")
    },
    [allowCustom, disabled, normalizeCustomValues, onChange, selected],
  )

  const toggleValue = React.useCallback(
    (value: string) => {
      const next = selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value]

      onChange(next)
      setSearchTerm("")
    },
    [onChange, selected],
  )

  const clearSelection = React.useCallback(() => {
    onChange([])
    setSearchTerm("")
  }, [onChange])

  const clearButtonSize: React.ComponentProps<typeof Button>["size"] =
    size === "sm" ? "icon-sm" : size === "lg" ? "icon-lg" : "icon"

  type ChipsItem = CompactMultiSelectOption & { __selectedOnly?: true }

  const chipsSelectedItems = React.useMemo<ChipsItem[]>(() => {
    return selected.map(
      (value) =>
        (optionsByValue.get(value) as ChipsItem | undefined) ?? {
          value,
          label: value,
          __selectedOnly: true,
        },
    )
  }, [optionsByValue, selected])

  const chipsItems = React.useMemo<ChipsItem[]>(() => {
    if (chipsSelectedItems.length === 0) return options as ChipsItem[]

    const unknownSelectedItems = chipsSelectedItems.filter(
      (item) => !optionsByValue.has(item.value),
    )

    if (unknownSelectedItems.length === 0) return options as ChipsItem[]
    return [...(options as ChipsItem[]), ...unknownSelectedItems]
  }, [chipsSelectedItems, options, optionsByValue])

  const chipsFilter = React.useCallback((item: ChipsItem, query: string) => {
    if (item.__selectedOnly) return false
    if (!query.trim()) return true
    return item.label.toLowerCase().includes(query.trim().toLowerCase())
  }, [])

  const chipsIsItemEqualToValue = React.useCallback(
    (item: ChipsItem, value: ChipsItem) => item.value === value.value,
    [],
  )

  const chipsInputPlaceholder = hasSelection
    ? resolvedSearchPlaceholder
    : localizedPlaceholder

  const chipsInputAriaLabel =
    typeof buttonProps["aria-label"] === "string"
      ? buttonProps["aria-label"]
      : undefined

  const chipsInputAriaLabelledBy =
    typeof buttonProps["aria-labelledby"] === "string"
      ? buttonProps["aria-labelledby"]
      : labelId

  const hasMatchingOption = React.useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    if (!q) return false
    return options.some((option) => {
      return (
        option.label.toLowerCase().includes(q) ||
        option.value.toLowerCase().includes(q)
      )
    })
  }, [options, searchTerm])

  const handleCustomKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!allowCustom || disabled) return
      if (event.key !== "Enter") return

      const raw = searchTerm.trim()
      if (!raw) return

      const shouldCommit =
        (parseCommaStrings && raw.includes(",")) || !hasMatchingOption

      if (!shouldCommit) return

      event.preventDefault()
      commitCustomValues(raw)
    },
    [
      allowCustom,
      commitCustomValues,
      disabled,
      hasMatchingOption,
      parseCommaStrings,
      searchTerm,
    ],
  )

  const handleCustomPaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLInputElement>) => {
      if (!allowCustom || disabled || !parseCommaStrings) return

      const pasted = event.clipboardData.getData("text")
      if (!pasted) return

      const shouldCommit = pasted.includes(",") || pasted.includes("\n")
      if (!shouldCommit) return

      event.preventDefault()
      commitCustomValues(pasted)
    },
    [allowCustom, commitCustomValues, disabled, parseCommaStrings],
  )

  if (displayMode === "chips") {
    const chipsControl = (
      <div className="flex w-full items-center gap-2">
        <Combobox
          multiple
          autoHighlight
          items={chipsItems}
          value={chipsSelectedItems}
          onValueChange={(value) => {
            onChange(value.map((item) => item.value))
            setSearchTerm("")
          }}
          inputValue={searchTerm}
          onInputValueChange={(value) => setSearchTerm(value)}
          open={open}
          onOpenChange={setOpen}
          disabled={disabled}
          filter={chipsFilter}
          isItemEqualToValue={chipsIsItemEqualToValue}
        >
          <ComboboxChips
            ref={chipsAnchor}
            className={cn(
              "max-h-24 min-w-0 flex-1 overflow-x-hidden overflow-y-auto",
              className,
            )}
          >
            <ComboboxValue>
              {(values) => (
                <React.Fragment>
                  {Array.isArray(values)
                    ? values.map((item: ChipsItem) => (
                        <ComboboxChip key={item.value} showRemove={!disabled}>
                          <span
                            className="max-w-48 truncate"
                            title={item.label}
                          >
                            {item.label}
                          </span>
                        </ComboboxChip>
                      ))
                    : null}
                  <ComboboxChipsInput
                    aria-label={chipsInputAriaLabel}
                    aria-labelledby={chipsInputAriaLabelledBy}
                    placeholder={chipsInputPlaceholder}
                    disabled={disabled}
                    onKeyDown={handleCustomKeyDown}
                    onPaste={handleCustomPaste}
                  />
                </React.Fragment>
              )}
            </ComboboxValue>
          </ComboboxChips>

          <ComboboxContent anchor={chipsAnchor}>
            <ComboboxEmpty>{resolvedEmptyMessage}</ComboboxEmpty>
            <ComboboxList>
              {(item) => (
                <ComboboxItem
                  key={item.value}
                  value={item}
                  disabled={disabled || Boolean(item.disabled)}
                >
                  <span className="truncate">{item.label}</span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>

        <div
          ref={actionsRef}
          data-testid="compact-multiselect-bulk-actions"
          data-orientation={actionsOrientation}
          className={cn(
            "shrink-0",
            actionsOrientation === "vertical"
              ? "flex flex-col items-start gap-2 self-stretch"
              : "flex flex-row items-center gap-2",
          )}
        >
          <Button
            type="button"
            variant="outline"
            size={clearButtonSize}
            onClick={selectAllSelectableOptions}
            aria-label={t("ui:multiSelect.selectAll")}
            title={t("ui:multiSelect.selectAll")}
            disabled={
              disabled ||
              selectableOptionValues.length === 0 ||
              allSelectableOptionsSelected
            }
            className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary dark:text-dark-text-primary dark:hover:bg-dark-bg-secondary/80"
          >
            <CheckIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size={clearButtonSize}
            onClick={clearSelection}
            aria-label={t("ui:multiSelect.cancelSelected")}
            title={t("ui:multiSelect.cancelSelected")}
            disabled={disabled || !hasSelection || !clearable}
            className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary dark:text-dark-text-primary dark:hover:bg-dark-bg-secondary/80"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>
    )

    return (
      <div className="w-full">
        {label && (
          <label
            id={labelId}
            className="dark:text-dark-text-primary mb-1 block text-sm font-medium text-gray-700"
          >
            {label}
          </label>
        )}
        {chipsControl}
      </div>
    )
  }

  const triggerAriaLabelledBy =
    typeof buttonProps["aria-labelledby"] === "string"
      ? buttonProps["aria-labelledby"]
      : labelId

  return (
    <div className="w-full">
      {label && (
        <label
          id={labelId}
          className="dark:text-dark-text-primary mb-1 block text-sm font-medium text-gray-700"
        >
          {label}
        </label>
      )}
      <div className="flex w-full items-center gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size={size}
              role="combobox"
              aria-expanded={open}
              aria-labelledby={triggerAriaLabelledBy}
              className={cn(
                "dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary dark:text-dark-text-primary dark:hover:bg-dark-bg-secondary/80 flex min-w-0 flex-1 items-center justify-between gap-2 overflow-hidden text-left",
                !hasSelection && "text-muted-foreground",
                className,
              )}
              disabled={disabled}
              {...buttonProps}
            >
              <span className="min-w-0 flex-1 truncate">{triggerText}</span>
              <span className="flex shrink-0 items-center gap-2">
                {hasSelection && (
                  <Badge variant="secondary" size="sm">
                    {selected.length}
                  </Badge>
                )}
                <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popper-anchor-width) p-0">
            <Command>
              <CommandInput
                placeholder={resolvedSearchPlaceholder}
                value={searchTerm}
                onValueChange={setSearchTerm}
                onClear={() => setSearchTerm("")}
                clearButtonLabel={t("ui:multiSelect.clearInput")}
              />
              <CommandList>
                <CommandEmpty>{resolvedEmptyMessage}</CommandEmpty>
                <CommandGroup>
                  {allowCustom && searchTerm.trim().length > 0 && (
                    <CommandItem
                      key={`__custom__${searchTerm}`}
                      value={searchTerm}
                      disabled={disabled}
                      onSelect={() => commitCustomValues(searchTerm)}
                    >
                      <CheckIcon className="size-4 opacity-0" />
                      <span className="truncate">{searchTerm}</span>
                    </CommandItem>
                  )}
                  {options.map((option) => {
                    const isSelected = selected.includes(option.value)
                    const isOptionDisabled =
                      disabled || Boolean(option.disabled)

                    return (
                      <CommandItem
                        key={option.value}
                        value={option.label}
                        disabled={isOptionDisabled}
                        onSelect={() => toggleValue(option.value)}
                      >
                        <CheckIcon
                          className={cn(
                            "size-4",
                            isSelected ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="truncate">{option.label}</span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Keep selection clearing out of the options list to avoid it being mistaken as a real option. */}
        {clearable && !disabled && hasSelection && (
          <Button
            type="button"
            variant="outline"
            size={clearButtonSize}
            onClick={clearSelection}
            aria-label={t("ui:multiSelect.clearSelected")}
            title={t("ui:multiSelect.clearSelected")}
            className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary dark:text-dark-text-primary dark:hover:bg-dark-bg-secondary/80 shrink-0"
          >
            <XIcon className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
