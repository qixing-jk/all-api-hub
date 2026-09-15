import { Check, ChevronDown, ChevronsUpDown, Copy, X } from "lucide-react"
import React, { useEffect, useId, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import toast from "~/lib/notify"
import { cn } from "~/lib/utils"
import { createLogger } from "~/utils/core/logger"

/**
 * Unified logger scoped to the shared MultiSelect UI component.
 */
const logger = createLogger("MultiSelect")

export interface MultiSelectOption {
  value: string
  label: string
}

export interface MultiSelectProps {
  options: MultiSelectOption[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder?: string
  label?: string
  disabled?: boolean
  allowCustom?: boolean
  parseCommaStrings?: boolean
  className?: string
  clearable?: boolean
}

/**
 * MultiSelect renders a searchable, multi-value combobox with optional custom entries.
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  label,
  disabled = false,
  allowCustom = false,
  parseCommaStrings = true,
  className,
  clearable = true,
}: MultiSelectProps) {
  const { t } = useTranslation("ui")
  const [query, setQuery] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [isSelectedExpanded, setIsSelectedExpanded] = useState(
    selected.length <= 5,
  )
  const [dropdownPosition, setDropdownPosition] = useState<"bottom" | "top">(
    "bottom",
  )
  const [activeOptionIndex, setActiveOptionIndex] = useState<number | null>(
    null,
  )
  const hasUserToggledRef = useRef(false)
  const comboboxRef = useRef<HTMLDivElement>(null)
  const uid = useId()

  useEffect(() => {
    const handleDocumentInteraction = (event: PointerEvent | FocusEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (comboboxRef.current?.contains(target)) return

      setIsOpen(false)
    }

    document.addEventListener("pointerdown", handleDocumentInteraction)
    document.addEventListener("focusin", handleDocumentInteraction)

    return () => {
      document.removeEventListener("pointerdown", handleDocumentInteraction)
      document.removeEventListener("focusin", handleDocumentInteraction)
    }
  }, [])

  useEffect(() => {
    if (selected.length === 0) {
      hasUserToggledRef.current = false
      setIsSelectedExpanded(false)
      return
    }

    if (!hasUserToggledRef.current) {
      setIsSelectedExpanded(selected.length <= 5)
    }
  }, [selected.length])

  // 检查下拉菜单位置，防止溢出屏幕
  useEffect(() => {
    const checkPosition = () => {
      if (comboboxRef.current) {
        const rect = comboboxRef.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        const spaceAbove = rect.top

        // 如果下方空间不足 250px 且上方空间更大，则向上展开
        if (spaceBelow < 250 && spaceAbove > spaceBelow) {
          setDropdownPosition("top")
        } else {
          setDropdownPosition("bottom")
        }
      }
    }

    checkPosition()
    window.addEventListener("scroll", checkPosition, true)
    window.addEventListener("resize", checkPosition)

    return () => {
      window.removeEventListener("scroll", checkPosition, true)
      window.removeEventListener("resize", checkPosition)
    }
  }, [])

  const optionMap = useMemo(() => {
    const map = new Map<string, MultiSelectOption>()
    for (const option of options) {
      map.set(option.value, option)
    }
    return map
  }, [options])

  const selectedOptions = useMemo(() => {
    return selected.map((value) => {
      const existing = optionMap.get(value)
      if (existing) {
        return existing
      }
      return { value, label: value }
    })
  }, [selected, optionMap])

  const filteredOptions = useMemo(() => {
    if (query === "") {
      return options
    }

    const q = query.toLowerCase()

    return options
      .filter((option) => option.label.toLowerCase().includes(q))
      .sort((a, b) => {
        const labelA = a.label.toLowerCase()
        const labelB = b.label.toLowerCase()

        // 匹配位置更靠前的优先
        const posA = labelA.indexOf(q)
        const posB = labelB.indexOf(q)
        if (posA !== posB) return posA - posB

        // 长度更短的优先
        if (labelA.length !== labelB.length)
          return labelA.length - labelB.length

        // 保持原始排序（例如按名字）
        return 0
      })
  }, [options, query])

  useEffect(() => {
    if (!isOpen || filteredOptions.length === 0) {
      setActiveOptionIndex(null)
      return
    }

    setActiveOptionIndex((currentIndex) =>
      currentIndex === null
        ? null
        : Math.min(currentIndex, filteredOptions.length - 1),
    )
  }, [filteredOptions.length, isOpen])

  const resolvedPlaceholder = placeholder ?? t("multiSelect.placeholder")
  const inputId = `${uid}-input`
  const listboxId = `${uid}-listbox`
  const activeOption =
    activeOptionIndex === null ? undefined : filteredOptions[activeOptionIndex]
  const activeOptionId = activeOption
    ? `${uid}-option-${activeOption.value}`
    : undefined

  const handleRemove = (value: string) => {
    onChange(selected.filter((v) => v !== value))
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && filteredOptions.length > 0) {
      e.preventDefault()
      setIsOpen(true)
      setActiveOptionIndex((currentIndex) =>
        currentIndex === null ? 0 : (currentIndex + 1) % filteredOptions.length,
      )
      return
    }

    if (e.key === "ArrowUp" && filteredOptions.length > 0) {
      e.preventDefault()
      setIsOpen(true)
      setActiveOptionIndex((currentIndex) =>
        currentIndex === null
          ? filteredOptions.length - 1
          : (currentIndex - 1 + filteredOptions.length) %
            filteredOptions.length,
      )
      return
    }

    if (e.key === "Enter" && isOpen && activeOptionIndex !== null) {
      const activeOption = filteredOptions[activeOptionIndex]
      if (activeOption) {
        e.preventDefault()
        handleOptionToggle(activeOption)
        return
      }
    }

    if (e.key === "Enter" && allowCustom && query.trim()) {
      e.preventDefault()

      if (parseCommaStrings && query.includes(",")) {
        // Parse comma-separated values
        const newValues = query
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0)
          .filter((v) => !selected.includes(v))

        if (newValues.length > 0) {
          onChange([...selected, ...newValues])
        }
      } else {
        // Single value
        const trimmedQuery = query.trim()
        if (!selected.includes(trimmedQuery)) {
          onChange([...selected, trimmedQuery])
        }
      }
      setQuery("")
      setIsOpen(false)
      return
    }

    if (e.key === "Escape") {
      setIsOpen(false)
    }
  }

  const previewLimit = 3
  const previewOptions = useMemo(
    () => selectedOptions.slice(0, previewLimit),
    [selectedOptions],
  )
  const remainingPreviewCount = selectedOptions.length - previewOptions.length

  const toggleSelectedExpanded = () => {
    hasUserToggledRef.current = true
    setIsSelectedExpanded((prev) => !prev)
  }

  const handleCopySelected = async () => {
    if (typeof navigator === "undefined") return
    const text = selectedOptions.map((option) => option.value).join(",")
    if (!text) return

    try {
      await navigator.clipboard.writeText(text)
      toast.success(t("multiSelect.copySuccess"))
    } catch (error) {
      logger.warn("Failed to copy selected values", error)
      toast.error(t("multiSelect.copyError"))
    }
  }

  const handleOptionToggle = (option: MultiSelectOption) => {
    if (disabled) return

    const nextSelected = selected.includes(option.value)
      ? selected.filter((value) => value !== option.value)
      : [...selected, option.value]

    onChange(nextSelected)
    setQuery("")
    setIsOpen(true)
    setActiveOptionIndex(null)
  }

  const optionListClassName = cn(
    "ring-opacity-5 absolute z-50 max-h-60 w-full overflow-auto rounded-lg corners-concentric [--corner-inset:--spacing(1)] bg-popover px-1 py-density-1 text-base shadow-lg ring-1 ring-shadow focus:outline-none sm:text-sm",
    dropdownPosition === "top" ? "bottom-full mb-1" : "top-full mt-1",
  )

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="dark:text-foreground text-secondary-foreground mb-1 block text-sm font-medium"
        >
          {label}
        </label>
      )}
      <div className="relative" ref={comboboxRef}>
        <div className="relative w-full">
          <input
            id={inputId}
            className="dark:border-border border-border-strong bg-card text-foreground focus:border-ring focus:ring-ring py-density-2 w-full rounded-md border pr-10 pl-3 text-sm shadow-sm focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={resolvedPlaceholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setIsOpen(true)
              setActiveOptionIndex(null)
            }}
            onClick={() => setIsOpen(true)}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleInputKeyDown}
            role="combobox"
            aria-expanded={isOpen}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            disabled={disabled}
          />
          <div className="gap-density-1 absolute inset-y-0 right-0 flex items-center pr-2">
            {!disabled && query.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQuery("")
                  setIsOpen(true)
                }}
                className="text-faint-foreground hover:bg-muted hover:text-muted-foreground focus:bg-secondary focus:text-secondary-foreground inline-flex items-center justify-center rounded-full focus:outline-none"
                aria-label={t("multiSelect.clearInput")}
              >
                <X className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              className="flex items-center"
              disabled={disabled}
              aria-label={t("multiSelect.placeholder")}
              aria-expanded={isOpen}
              aria-controls={listboxId}
              onClick={() => {
                setIsOpen((open) => !open)
                setActiveOptionIndex(null)
              }}
            >
              <ChevronsUpDown
                className="text-faint-foreground h-5 w-5"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {isOpen &&
          (filteredOptions.length === 0 ? (
            <div className={optionListClassName}>
              <div
                id={listboxId}
                role="listbox"
                data-slot="multiselect-listbox"
                aria-multiselectable="true"
              >
                <div className="text-secondary-foreground py-density-1 relative cursor-default px-3 select-none">
                  {allowCustom
                    ? query
                      ? t("multiSelect.emptyWithQueryAllowCustom", {
                          value: query,
                        })
                      : t("multiSelect.noOptionsAllowCustom")
                    : t("multiSelect.noOptions")}
                </div>
              </div>
            </div>
          ) : (
            <div
              id={listboxId}
              role="listbox"
              data-slot="multiselect-listbox"
              aria-multiselectable="true"
              className={optionListClassName}
            >
              {filteredOptions.map((option, index) => {
                const isSelected = selected.includes(option.value)
                const isActive = index === activeOptionIndex

                return (
                  <button
                    key={option.value}
                    id={`${uid}-option-${option.value}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      "text-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground py-density-2 relative flex w-full cursor-pointer items-center rounded-[var(--corner-inner-radius)] pr-3 pl-9 text-left select-none focus:outline-none",
                      isActive && "bg-primary text-primary-foreground",
                    )}
                    onMouseEnter={() => setActiveOptionIndex(index)}
                    onClick={() => handleOptionToggle(option)}
                  >
                    <span
                      className={cn(
                        "block truncate",
                        isSelected ? "font-medium" : "font-normal",
                      )}
                      title={option.label}
                    >
                      {option.label}
                    </span>
                    {isSelected ? (
                      <span className="absolute inset-y-0 left-0 flex items-center pl-2 text-current">
                        <Check className="h-5 w-5" aria-hidden="true" />
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ))}
      </div>

      {selectedOptions.length > 0 && (
        <div className="space-y-density-2 mt-2">
          <div className="gap-density-2 flex flex-col sm:flex-row">
            <button
              type="button"
              className="dark:bg-card/60 dark:text-foreground dark:hover:bg-card border-border bg-surface-subtle text-secondary-foreground hover:bg-muted focus:ring-ring py-density-2 flex w-full flex-1 items-center justify-between rounded-md border px-3 text-left text-sm font-medium transition focus:ring-2 focus:outline-none"
              onClick={toggleSelectedExpanded}
              aria-expanded={isSelectedExpanded}
              aria-controls={`${uid}-selected-items`}
            >
              <span className="gap-density-2 flex min-w-0 items-center">
                <ChevronDown
                  className={cn(
                    "dark:text-secondary-foreground text-muted-foreground h-4 w-4 shrink-0 transition-transform",
                    isSelectedExpanded ? "rotate-180" : "",
                  )}
                />
                <span className="truncate">
                  {t("multiSelect.selected")} ({selectedOptions.length})
                </span>
              </span>
              {!isSelectedExpanded && (
                <span className="dark:text-secondary-foreground text-muted-foreground gap-density-1 ml-3 flex items-center overflow-hidden text-xs">
                  {previewOptions.map((option) => (
                    <span
                      key={`preview-${option.value}`}
                      className="bg-secondary text-muted-foreground max-w-[100px] shrink-0 truncate rounded-full px-2 py-0.5 text-xs"
                      title={option.label}
                    >
                      {option.label}
                    </span>
                  ))}
                  {remainingPreviewCount > 0 && (
                    <span className="dark:text-muted-foreground text-faint-foreground shrink-0 text-xs">
                      +{remainingPreviewCount}
                    </span>
                  )}
                </span>
              )}
            </button>
            {clearable && !disabled && selectedOptions.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onChange([])
                }}
                className="dark:bg-card/60 dark:text-foreground dark:hover:bg-card border-border bg-card text-secondary-foreground hover:bg-surface-subtle focus:ring-ring py-density-2 inline-flex items-center justify-center rounded-md border px-3 text-sm font-medium transition focus:ring-2 focus:outline-none"
                title={t("multiSelect.clearSelected")}
                aria-label={t("multiSelect.clearSelected")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleCopySelected}
              className="dark:bg-card/60 dark:text-foreground dark:hover:bg-card border-border bg-card text-secondary-foreground hover:bg-surface-subtle focus:ring-ring py-density-2 inline-flex items-center justify-center rounded-md border px-3 text-sm font-medium transition focus:ring-2 focus:outline-none"
              title={t("multiSelect.copySelectedValues")}
              aria-label={t("multiSelect.copySelectedValues")}
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>

          {isSelectedExpanded && (
            <div
              id={`${uid}-selected-items`}
              className="gap-density-2 py-density-1 flex max-h-40 flex-wrap overflow-y-auto px-1"
            >
              {selectedOptions.map((option) => (
                <span
                  key={option.value}
                  className="bg-theme-100 text-theme-800 dark:bg-theme-900 dark:text-theme-200 gap-density-1 inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                  title={option.label}
                >
                  <span className="max-w-[200px] truncate">{option.label}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => handleRemove(option.value)}
                      className="text-theme-400 hover:bg-theme-200 hover:text-theme-500 focus:bg-theme-500 focus:text-primary-foreground dark:hover:bg-theme-800 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full focus:outline-none"
                      aria-label={t("multiSelect.removeValue", {
                        value: option.label,
                      })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
