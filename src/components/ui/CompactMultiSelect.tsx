import {
  CheckIcon,
  ChevronsUpDownIcon,
  ListChecksIcon,
  ListXIcon,
  XIcon,
} from "lucide-react"
import * as React from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { cn } from "~/lib/utils"
import { createLogger } from "~/utils/core/logger"

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

const logger = createLogger("CompactMultiSelect")

export interface CompactMultiSelectOption {
  value: string
  label: string
  count?: number
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
   * Trigger button size. Defaults to "default" to match regular form controls.
   */
  size?: React.ComponentProps<typeof Button>["size"]
  /**
   * Minimum selectable option count required before rendering chips-mode bulk action buttons.
   * Defaults to `0` to preserve the current always-visible behavior.
   */
  bulkActionsMinOptions?: number
  /** Enables chips-mode bulk actions scoped to the current search results. */
  enableFilteredBulkActions?: boolean
  /**
   * Optional stable selector for the searchable chips input.
   */
  inputTestId?: string
}

const getOptionAccessibleLabel = (option: CompactMultiSelectOption) =>
  typeof option.count === "number"
    ? `${option.label} ${option.count}`
    : option.label

const optionMatchesSearch = (
  option: CompactMultiSelectOption,
  normalizedSearchTerm: string,
) =>
  option.label.toLowerCase().includes(normalizedSearchTerm) ||
  option.value.toLowerCase().includes(normalizedSearchTerm)

const OptionCountBadge = ({ count }: { count?: number }) =>
  typeof count === "number" ? (
    <Badge
      variant="secondary"
      size="sm"
      className="ml-auto shrink-0 tabular-nums"
    >
      {count}
    </Badge>
  ) : null

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
  size = "default",
  bulkActionsMinOptions = 0,
  enableFilteredBulkActions = true,
  inputTestId,
  className,
  ...buttonProps
}: CompactMultiSelectProps) {
  const { t } = useTranslation("ui")
  const localizedPlaceholder = placeholder ?? t("ui:multiSelect.placeholder")
  const [open, setOpen] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")
  const chipsAnchor = useComboboxAnchor()
  const chipsInputRef = React.useRef<HTMLInputElement | null>(null)
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

  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const filteredSelectableOptionValues = React.useMemo(() => {
    if (!normalizedSearchTerm) return []

    return options
      .filter(
        (option) =>
          !option.disabled && optionMatchesSearch(option, normalizedSearchTerm),
      )
      .map((option) => option.value)
  }, [normalizedSearchTerm, options])

  const allSelectableOptionsSelected = React.useMemo(() => {
    if (selectableOptionValues.length === 0) return false
    const selectedSet = new Set(selected)
    return selectableOptionValues.every((value) => selectedSet.has(value))
  }, [selectableOptionValues, selected])

  const filteredSelectedCount = React.useMemo(() => {
    const selectedSet = new Set(selected)
    return filteredSelectableOptionValues.filter((value) =>
      selectedSet.has(value),
    ).length
  }, [filteredSelectableOptionValues, selected])

  const allFilteredOptionsSelected =
    filteredSelectableOptionValues.length > 0 &&
    filteredSelectedCount === filteredSelectableOptionValues.length
  const hasFilteredSelection = filteredSelectedCount > 0
  const showFilteredBulkActions =
    enableFilteredBulkActions && filteredSelectableOptionValues.length >= 2

  const restoreChipsInputFocus = React.useCallback(() => {
    chipsInputRef.current?.focus()
  }, [])

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

  const selectAllFilteredOptions = React.useCallback(() => {
    if (disabled || filteredSelectableOptionValues.length === 0) return

    const selectedSet = new Set(selected)
    onChange([
      ...selected,
      ...filteredSelectableOptionValues.filter(
        (value) => !selectedSet.has(value),
      ),
    ])
    restoreChipsInputFocus()
  }, [
    disabled,
    filteredSelectableOptionValues,
    onChange,
    restoreChipsInputFocus,
    selected,
  ])

  const invertFilteredOptions = React.useCallback(() => {
    if (disabled || filteredSelectableOptionValues.length === 0) return

    const filteredSet = new Set(filteredSelectableOptionValues)
    const selectedSet = new Set(selected)
    onChange([
      ...selected.filter((value) => !filteredSet.has(value)),
      ...filteredSelectableOptionValues.filter(
        (value) => !selectedSet.has(value),
      ),
    ])
    restoreChipsInputFocus()
  }, [
    disabled,
    filteredSelectableOptionValues,
    onChange,
    restoreChipsInputFocus,
    selected,
  ])

  const deselectAllFilteredOptions = React.useCallback(() => {
    if (disabled || filteredSelectableOptionValues.length === 0) return

    const filteredSet = new Set(filteredSelectableOptionValues)
    onChange(selected.filter((value) => !filteredSet.has(value)))
    restoreChipsInputFocus()
  }, [
    disabled,
    filteredSelectableOptionValues,
    onChange,
    restoreChipsInputFocus,
    selected,
  ])

  const selectedLabels = React.useMemo(() => {
    return selected.map((value) => optionsByValue.get(value)?.label ?? value)
  }, [optionsByValue, selected])

  const hasSelection = selected.length > 0
  const selectAllButtonLabel = t("ui:multiSelect.selectAll")
  const showBulkActions = selectableOptionValues.length >= bulkActionsMinOptions

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
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return true
    return optionMatchesSearch(item, normalizedQuery)
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

  const chipsInputAriaDescribedBy =
    typeof buttonProps["aria-describedby"] === "string"
      ? buttonProps["aria-describedby"]
      : undefined

  const chipsInputAriaInvalid = buttonProps["aria-invalid"]
  const chipsInputAriaRequired = buttonProps["aria-required"]

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

  const copyChipText = React.useCallback(
    async (text: string) => {
      if (typeof navigator === "undefined") return
      if (!navigator.clipboard?.writeText) {
        toast.error(t("ui:multiSelect.copyError"))
        return
      }

      try {
        await navigator.clipboard.writeText(text)
        toast.success(
          t("ui:multiSelect.chipCopied", {
            value: text,
          }),
        )
      } catch (error) {
        logger.warn("Failed to copy selected chip text", error)
        toast.error(t("ui:multiSelect.copyError"))
      }
    },
    [t],
  )

  const handleChipTextClick = React.useCallback(
    (event: React.MouseEvent<HTMLSpanElement>, text: string) => {
      event.stopPropagation()

      const selectedText = window.getSelection()?.toString().trim()
      if (selectedText) return

      void copyChipText(text)
    },
    [copyChipText],
  )

  const handleChipTextKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLSpanElement>, text: string) => {
      if (event.key !== "Enter" && event.key !== " ") return

      event.preventDefault()
      event.stopPropagation()
      void copyChipText(text)
    },
    [copyChipText],
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
                            className="max-w-48 cursor-copy truncate select-text"
                            title={item.label}
                            role="button"
                            tabIndex={0}
                            aria-label={t("ui:multiSelect.copyChipValue", {
                              value: item.label,
                            })}
                            onClick={(event) =>
                              handleChipTextClick(event, item.label)
                            }
                            onKeyDown={(event) =>
                              handleChipTextKeyDown(event, item.label)
                            }
                          >
                            {item.label}
                          </span>
                        </ComboboxChip>
                      ))
                    : null}
                  <ComboboxChipsInput
                    ref={chipsInputRef}
                    data-testid={inputTestId}
                    aria-label={chipsInputAriaLabel}
                    aria-labelledby={chipsInputAriaLabelledBy}
                    aria-describedby={chipsInputAriaDescribedBy}
                    aria-invalid={chipsInputAriaInvalid}
                    aria-required={chipsInputAriaRequired}
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
            {showFilteredBulkActions ? (
              <div
                role="group"
                aria-label={t("multiSelect.filteredResultsScope")}
                className="border-border bg-muted/40 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b px-2 py-1.5 pointer-coarse:gap-y-2 pointer-coarse:px-3 pointer-coarse:py-2"
              >
                <p
                  className="text-muted-foreground mr-auto text-xs tabular-nums"
                  aria-live="polite"
                >
                  {t("multiSelect.filteredMatchCount", {
                    count: filteredSelectableOptionValues.length,
                  })}
                  {" · "}
                  {t("multiSelect.filteredSelectedCount", {
                    count: filteredSelectedCount,
                  })}
                </p>
                <div className="flex max-w-full flex-wrap items-center justify-end gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={selectAllFilteredOptions}
                    aria-label={t("multiSelect.selectAllMatches")}
                    disabled={
                      disabled ||
                      filteredSelectableOptionValues.length === 0 ||
                      allFilteredOptionsSelected
                    }
                    className="h-7 px-2 text-xs pointer-coarse:h-11 pointer-coarse:px-3 pointer-coarse:text-sm"
                  >
                    {t("multiSelect.selectAll")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={invertFilteredOptions}
                    aria-label={t("multiSelect.invertMatches")}
                    disabled={
                      disabled || filteredSelectableOptionValues.length === 0
                    }
                    className="h-7 px-2 text-xs pointer-coarse:h-11 pointer-coarse:px-3 pointer-coarse:text-sm"
                  >
                    {t("multiSelect.invert")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={deselectAllFilteredOptions}
                    aria-label={t("multiSelect.deselectMatches")}
                    disabled={disabled || !hasFilteredSelection}
                    className="h-7 px-2 text-xs pointer-coarse:h-11 pointer-coarse:px-3 pointer-coarse:text-sm"
                  >
                    {t("multiSelect.deselect")}
                  </Button>
                </div>
              </div>
            ) : null}
            <ComboboxEmpty>{resolvedEmptyMessage}</ComboboxEmpty>
            <ComboboxList>
              {(item) => (
                <ComboboxItem
                  key={item.value}
                  value={item}
                  disabled={disabled || Boolean(item.disabled)}
                  aria-label={getOptionAccessibleLabel(item)}
                >
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <OptionCountBadge count={item.count} />
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>

        {showBulkActions ? (
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
              aria-label={selectAllButtonLabel}
              title={selectAllButtonLabel}
              disabled={
                disabled ||
                selectableOptionValues.length === 0 ||
                allSelectableOptionsSelected
              }
              className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary dark:text-dark-text-primary dark:hover:bg-dark-bg-secondary/80"
            >
              <ListChecksIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size={clearButtonSize}
              onClick={clearSelection}
              aria-label={t("multiSelect.cancelSelected")}
              title={t("multiSelect.cancelSelected")}
              disabled={disabled || !hasSelection || !clearable}
              className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary dark:text-dark-text-primary dark:hover:bg-dark-bg-secondary/80"
            >
              <ListXIcon className="size-4" />
            </Button>
          </div>
        ) : null}
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
                clearButtonLabel={t("multiSelect.clearInput")}
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
                        value={option.value}
                        keywords={[option.label]}
                        disabled={isOptionDisabled}
                        aria-label={getOptionAccessibleLabel(option)}
                        onSelect={() => toggleValue(option.value)}
                      >
                        <CheckIcon
                          className={cn(
                            "size-4",
                            isSelected ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {option.label}
                        </span>
                        <OptionCountBadge count={option.count} />
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
            aria-label={t("multiSelect.clearSelected")}
            title={t("multiSelect.clearSelected")}
            className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary dark:text-dark-text-primary dark:hover:bg-dark-bg-secondary/80 shrink-0"
          >
            <XIcon className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
