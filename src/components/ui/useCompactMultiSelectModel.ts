import * as React from "react"

export interface CompactMultiSelectOption {
  value: string
  label: string
  count?: number
  disabled?: boolean
}

export type ChipsItem = CompactMultiSelectOption & { __selectedOnly?: true }

type SelectionModelInput = {
  options: CompactMultiSelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  disabled: boolean
  allowCustom: boolean
  parseCommaStrings: boolean
  maxDisplayValues: number
  bulkActionsMinOptions: number
  enableFilteredBulkActions: boolean
  localizedPlaceholder: string
  restoreChipsInputFocus: () => void
}

const optionMatchesSearch = (
  option: CompactMultiSelectOption,
  normalizedSearchTerm: string,
) =>
  option.label.toLowerCase().includes(normalizedSearchTerm) ||
  option.value.toLowerCase().includes(normalizedSearchTerm)

/** Owns selection, filtered bulk commands and custom input for both display modes. */
export function useCompactMultiSelectModel({
  options,
  selected,
  onChange,
  disabled,
  allowCustom,
  parseCommaStrings,
  maxDisplayValues,
  bulkActionsMinOptions,
  enableFilteredBulkActions,
  localizedPlaceholder,
  restoreChipsInputFocus,
}: SelectionModelInput) {
  const [searchTerm, setSearchTerm] = React.useState("")
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

  return {
    searchTerm,
    setSearchTerm,
    selection: {
      hasSelection,
      triggerText,
      selectableOptionValues,
      showBulkActions,
      allSelectableOptionsSelected,
      selectAllSelectableOptions,
      toggleValue,
      clearSelection,
    },
    filtered: {
      filteredMatchCount: filteredSelectableOptionValues.length,
      showFilteredBulkActions,
      filteredSelectedCount,
      allFilteredOptionsSelected,
      hasFilteredSelection,
      selectAllFilteredOptions,
      invertFilteredOptions,
      deselectAllFilteredOptions,
    },
    chips: {
      chipsItems,
      chipsSelectedItems,
      chipsFilter,
      chipsIsItemEqualToValue,
    },
    custom: { commitCustomValues, handleCustomKeyDown, handleCustomPaste },
  }
}
