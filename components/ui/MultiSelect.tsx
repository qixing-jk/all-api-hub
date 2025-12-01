import { Combobox, Transition } from "@headlessui/react"
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpDownIcon,
  DocumentDuplicateIcon,
  XMarkIcon
} from "@heroicons/react/20/solid"
import React, {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import { cn } from "~/lib/utils.ts"

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

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select...",
  label,
  disabled = false,
  allowCustom = false,
  parseCommaStrings = true,
  className,
  clearable = true
}: MultiSelectProps) {
  const { t } = useTranslation("ui")
  const [query, setQuery] = useState("")
  const [isSelectedExpanded, setIsSelectedExpanded] = useState(
    selected.length <= 5
  )
  const [dropdownPosition, setDropdownPosition] = useState<"bottom" | "top">(
    "bottom"
  )
  const hasUserToggledRef = useRef(false)
  const comboboxRef = useRef<HTMLDivElement>(null)
  const uid = useId()

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

  const handleSelect = (newSelected: MultiSelectOption[]) => {
    onChange(newSelected.map((opt) => opt.value))
  }

  const handleRemove = (value: string) => {
    onChange(selected.filter((v) => v !== value))
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    }
  }

  const previewLimit = 3
  const previewOptions = useMemo(
    () => selectedOptions.slice(0, previewLimit),
    [selectedOptions]
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
      console.error("Failed to copy selected values", error)
      toast.error(t("multiSelect.copyError"))
    }
  }

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <label className="dark:text-dark-text-primary mb-1 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <Combobox
        immediate
        value={selectedOptions}
        onChange={handleSelect}
        virtual={{ options: filteredOptions }}
        multiple
        disabled={disabled}>
        <div className="relative" ref={comboboxRef}>
          <div className="relative w-full">
            <Combobox.Input
              className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary dark:text-dark-text-primary w-full rounded-md border border-gray-300 bg-white py-2 pr-10 pl-3 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={placeholder}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              displayValue={() => query}
            />
            <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-2">
              {!disabled && query.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("")
                  }}
                  className="inline-flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:bg-gray-200 focus:text-gray-700 focus:outline-none"
                  aria-label={t("multiSelect.clearInput")}>
                  <XMarkIcon className="h-5 w-5" />
                </button>
              )}
              <Combobox.Button className="flex items-center">
                <ChevronUpDownIcon
                  className="h-5 w-5 text-gray-400"
                  aria-hidden="true"
                />
              </Combobox.Button>
            </div>
          </div>

          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
            afterLeave={() => setQuery("")}
            appear>
            {filteredOptions.length === 0 ? (
              <div
                className={cn(
                  "ring-opacity-5 dark:bg-dark-bg-secondary absolute z-50 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black focus:outline-none sm:text-sm",
                  dropdownPosition === "top"
                    ? "bottom-full mb-1"
                    : "top-full mt-1"
                )}>
                <div className="dark:text-dark-text-secondary relative cursor-default px-4 py-1 text-gray-700 select-none">
                  {allowCustom
                    ? query
                      ? t("multiSelect.emptyWithQueryAllowCustom", {
                          value: query
                        })
                      : t("multiSelect.noOptionsAllowCustom")
                    : t("multiSelect.noOptions")}
                </div>
              </div>
            ) : (
              <Combobox.Options
                className={cn(
                  "ring-opacity-5 dark:bg-dark-bg-secondary absolute z-50 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black focus:outline-none sm:text-sm",
                  dropdownPosition === "top"
                    ? "bottom-full mb-1"
                    : "top-full mt-1"
                )}>
                {({ option }) => (
                  <Combobox.Option
                    key={option.value}
                    className={({ active }) =>
                      cn(
                        "relative flex w-full cursor-pointer items-center py-2 pr-4 pl-10 select-none",
                        active
                          ? "bg-blue-600 text-white"
                          : "dark:text-dark-text-primary text-gray-900"
                      )
                    }
                    value={option}>
                    {({ selected, active }) => (
                      <>
                        <span
                          className={cn(
                            "block truncate",
                            selected ? "font-medium" : "font-normal"
                          )}
                          title={option.label}>
                          {option.label}
                        </span>
                        {selected ? (
                          <span
                            className={cn(
                              "absolute inset-y-0 left-0 flex items-center pl-3",
                              active ? "text-white" : "text-blue-600"
                            )}>
                            <CheckIcon className="h-5 w-5" aria-hidden="true" />
                          </span>
                        ) : null}
                      </>
                    )}
                  </Combobox.Option>
                )}
              </Combobox.Options>
            )}
          </Transition>
        </div>
      </Combobox>

      {selectedOptions.length > 0 && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary/60 dark:text-dark-text-primary dark:hover:bg-dark-bg-secondary flex w-full flex-1 items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              onClick={toggleSelectedExpanded}
              aria-expanded={isSelectedExpanded}
              aria-controls={`${uid}-selected-items`}>
              <span className="flex min-w-0 items-center gap-2">
                <ChevronDownIcon
                  className={cn(
                    "dark:text-dark-text-secondary h-4 w-4 shrink-0 text-gray-500 transition-transform",
                    isSelectedExpanded ? "rotate-180" : ""
                  )}
                />
                <span className="truncate">
                  Selected ({selectedOptions.length})
                </span>
              </span>
              {!isSelectedExpanded && (
                <span className="dark:text-dark-text-secondary ml-3 flex items-center gap-1 overflow-hidden text-xs text-gray-500">
                  {previewOptions.map((option) => (
                    <span
                      key={`preview-${option.value}`}
                      className="dark:bg-dark-bg-tertiary dark:text-dark-text-tertiary max-w-[100px] shrink-0 truncate rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600"
                      title={option.label}>
                      {option.label}
                    </span>
                  ))}
                  {remainingPreviewCount > 0 && (
                    <span className="dark:text-dark-text-tertiary shrink-0 text-xs text-gray-400">
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
                className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary/60 dark:text-dark-text-primary dark:hover:bg-dark-bg-secondary inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                title={t("multiSelect.clearSelected")}
                aria-label={t("multiSelect.clearSelected")}>
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleCopySelected}
              className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary/60 dark:text-dark-text-primary dark:hover:bg-dark-bg-secondary inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              title="Copy selected values"
              aria-label="Copy selected values">
              <DocumentDuplicateIcon className="h-4 w-4" />
            </button>
          </div>

          {isSelectedExpanded && (
            <div
              id={`${uid}-selected-items`}
              className="flex max-h-40 flex-wrap gap-2 overflow-y-auto p-1">
              {selectedOptions.map((option) => (
                <span
                  key={option.value}
                  className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                  title={option.label}>
                  <span className="max-w-[200px] truncate">{option.label}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => handleRemove(option.value)}
                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-blue-400 hover:bg-blue-200 hover:text-blue-500 focus:bg-blue-500 focus:text-white focus:outline-none dark:hover:bg-blue-800"
                      aria-label={`Remove ${option.label}`}>
                      <XMarkIcon className="h-3 w-3" />
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
