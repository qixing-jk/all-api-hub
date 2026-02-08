import React from "react"
import { useTranslation } from "react-i18next"

import { cn } from "~/lib/utils"

import { Badge } from "./badge"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { ToggleButton } from "./ToggleButton"

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"]

export interface TagFilterOption {
  /** Unique value of the tag, used in callbacks. */
  value: string
  /** Display label of the tag. */
  label: string
  /**
   * Optional native `title` text shown on hover/focus.
   * When omitted, the label is used.
   */
  title?: string
  /** Optional count to display next to the label. */
  count?: number
  /** Optional visual style variant for the count badge. */
  variant?: BadgeVariant
  /** Optional icon displayed before the label. */
  icon?: React.ReactNode
}

interface CommonTagFilterProps {
  /** Available tag options. */
  options: TagFilterOption[]
  /** Optional class name for the outer container. */
  className?: string
  /**
   * Maximum number of tag options displayed inline before collapsing the
   * remaining ones behind a "More" control. This does not include the
   * optional "All" chip.
   */
  maxVisible?: number
  maxVisibleLines?: number
  /**
   * How to display overflow tags once the visible limit is reached.
   *
   * - "expand" (default): Clicking "More" expands and shows all tags inline.
   * - "popover": Keeps the legacy overflow popover panel behavior.
   */
  overflowDisplay?: "expand" | "popover"
  /** Whether to render an "All" chip that represents no active selection. */
  includeAllOption?: boolean
  /** Label for the "All" chip. If omitted, a localized "Total" label is used. */
  allLabel?: string
  /** Optional count to show on the "All" chip. */
  allCount?: number
  /** Disable all interactions. */
  disabled?: boolean
}

interface MultipleModeProps {
  /** Selection mode. When omitted, multiple selection is used. */
  mode?: "multiple"
  /** Selected tag values in multiple selection mode. */
  value: string[]
  /** Change handler for multiple selection mode. */
  onChange: (value: string[]) => void
}

interface SingleModeProps {
  /** Selection mode. */
  mode: "single"
  /** Selected tag value in single selection mode. `null` means no selection. */
  value: string | null
  /** Change handler for single selection mode. */
  onChange: (value: string | null) => void
}

export type TagFilterProps = CommonTagFilterProps &
  (MultipleModeProps | SingleModeProps)

/**
 * TagFilter renders a row of pill-like tag buttons that supports both single
 * and multiple selection modes. It optionally shows an "All" chip when there
 * is no active selection and can expand overflow tags inline or render them in
 * a legacy popover.
 */
export function TagFilter(props: TagFilterProps) {
  const {
    options,
    className,
    maxVisible = 6,
    includeAllOption = true,
    allLabel,
    allCount,
    disabled = false,
    maxVisibleLines,
    overflowDisplay = "expand",
  } = props

  const { t } = useTranslation(["common"])

  const [lineVisibleCount, setLineVisibleCount] = React.useState<number | null>(
    null,
  )
  const [isOverflowExpanded, setIsOverflowExpanded] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  // Normalize current selection into a set for quick lookup.
  const selectedValues: string[] =
    props.mode === "single" ? (props.value ? [props.value] : []) : props.value
  const selectedSet = new Set(selectedValues)
  const hasSelection = selectedSet.size > 0

  const useLineBasedLimit =
    typeof maxVisibleLines === "number" && maxVisibleLines > 0

  const normalizedMaxVisible = Math.max(1, maxVisible)

  // Split options into inline and overflow parts.
  let visibleOptions = options
  let overflowOptions: TagFilterOption[] = []

  const shouldCollapseOverflow =
    overflowDisplay === "popover" ||
    (overflowDisplay === "expand" && !isOverflowExpanded)

  if (shouldCollapseOverflow) {
    if (useLineBasedLimit) {
      if (
        lineVisibleCount !== null &&
        lineVisibleCount >= 0 &&
        lineVisibleCount < options.length
      ) {
        visibleOptions = options.slice(0, lineVisibleCount)
        overflowOptions = options.slice(lineVisibleCount)
      } else {
        visibleOptions = options
        overflowOptions = []
      }
    } else if (options.length > normalizedMaxVisible) {
      const visibleCount = Math.max(1, normalizedMaxVisible - 1)
      visibleOptions = options.slice(0, visibleCount)
      overflowOptions = options.slice(visibleCount)
    }
  }

  React.useLayoutEffect(() => {
    if (!useLineBasedLimit) {
      setLineVisibleCount(null)
      return
    }

    if (typeof window === "undefined") {
      return
    }

    const maxLines = Math.max(1, maxVisibleLines as number)

    const measure = () => {
      const container = containerRef.current
      if (!container) {
        return
      }

      const chipNodes = container.querySelectorAll<HTMLElement>(
        '[data-tag-filter-chip="true"]',
      )

      const totalChips = chipNodes.length

      if (totalChips === 0) {
        setLineVisibleCount(null)
        return
      }

      const lineTops: number[] = []
      let visibleCountByLines = totalChips
      let hasOverflow = false

      for (let i = 0; i < totalChips; i += 1) {
        const top = chipNodes[i].offsetTop
        const existingIndex = lineTops.findIndex(
          (value) => Math.abs(value - top) < 1,
        )
        if (existingIndex === -1) {
          lineTops.push(top)
        }
        const lineIndex = lineTops.length
        if (lineIndex > maxLines) {
          visibleCountByLines = i
          hasOverflow = true
          break
        }
      }

      if (!hasOverflow) {
        if (totalChips === options.length) {
          setLineVisibleCount(null)
        }
        return
      }

      setLineVisibleCount(visibleCountByLines)
    }

    measure()

    let frame: number | null = null

    const handleResize = () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame)
      }
      frame = window.requestAnimationFrame(measure)
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      if (frame !== null) {
        window.cancelAnimationFrame(frame)
      }
    }
  }, [useLineBasedLimit, maxVisibleLines, options])

  const overflowSelectedCount = overflowOptions.reduce(
    (count, option) => (selectedSet.has(option.value) ? count + 1 : count),
    0,
  )

  const handleAllClick = () => {
    if (props.mode === "single") {
      props.onChange(null)
    } else {
      props.onChange([])
    }
  }

  const handleTagClick = (value: string) => {
    if (props.mode === "single") {
      const current = props.value
      if (current === value) {
        props.onChange(null)
      } else {
        props.onChange(value)
      }
      return
    }

    const current = props.value
    if (current.includes(value)) {
      props.onChange(current.filter((item) => item !== value))
    } else {
      props.onChange([...current, value])
    }
  }

  const renderTagButton = (option: TagFilterOption, isInOverflow: boolean) => {
    const isActive = selectedSet.has(option.value)
    const handleClick = () => {
      if (!disabled) {
        handleTagClick(option.value)
      }
    }

    const count = option.count

    const chipBaseClasses = isActive
      ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-400/70 dark:bg-emerald-900/40 dark:text-emerald-100"
      : "border-gray-200 bg-white text-gray-800 dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary/60 dark:text-dark-text-secondary"

    return (
      <ToggleButton
        key={option.value}
        type="button"
        variant="ghost"
        size="sm"
        shape="pill"
        isActive={isActive}
        disabled={disabled}
        data-tag-filter-chip="true"
        className={cn(
          "border px-3 py-1 text-xs shadow-xs sm:text-[13px]",
          chipBaseClasses,
          isInOverflow && "w-full justify-between",
        )}
        onClick={handleClick}
      >
        <span className="flex min-w-0 items-center gap-1">
          {option.icon && <span className="shrink-0">{option.icon}</span>}
          <span className="truncate" title={option.title ?? option.label}>
            {option.label}
          </span>
          {typeof count === "number" && (
            <Badge
              variant={option.variant ?? (isActive ? "success" : "outline")}
              size="sm"
              className="shrink-0 border-transparent px-1.5 text-[11px]"
            >
              {count}
            </Badge>
          )}
        </span>
      </ToggleButton>
    )
  }

  const moreLabel = t("common:actions.more")

  return (
    <div
      ref={containerRef}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {includeAllOption && (
        <ToggleButton
          type="button"
          variant="ghost"
          size="sm"
          shape="pill"
          isActive={!hasSelection}
          disabled={disabled}
          className={cn(
            "border px-3 py-1 text-xs font-medium shadow-xs sm:text-[13px]",
            !hasSelection
              ? "border-emerald-500 bg-emerald-500 text-white dark:border-emerald-400 dark:bg-emerald-500/90 dark:text-white"
              : "dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary/70 dark:text-dark-text-primary border-gray-200 bg-white text-gray-900",
          )}
          onClick={handleAllClick}
          aria-pressed={!hasSelection}
        >
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate">{allLabel ?? t("common:total")}</span>
            {typeof allCount === "number" && (
              <Badge
                variant={!hasSelection ? "success" : "outline"}
                size="sm"
                className="shrink-0 border-transparent px-1.5 text-[11px]"
              >
                {allCount}
              </Badge>
            )}
          </span>
        </ToggleButton>
      )}

      {/* Inline tag options */}
      {visibleOptions.map((option) => renderTagButton(option, false))}

      {overflowOptions.length > 0 &&
        (overflowDisplay === "popover" ? (
          <Popover>
            <PopoverTrigger asChild>
              <ToggleButton
                type="button"
                variant="ghost"
                size="sm"
                shape="pill"
                disabled={disabled}
                className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary/70 dark:text-dark-text-primary border border-gray-200 bg-white px-3 py-1 text-xs text-gray-900 shadow-xs sm:text-[13px]"
                aria-label={moreLabel}
              >
                <span className="flex items-center gap-1">
                  <span>{moreLabel}</span>
                  <Badge
                    variant="outline"
                    size="sm"
                    className="border-transparent px-1.5 text-[11px]"
                  >
                    +{overflowOptions.length}
                  </Badge>
                  {overflowSelectedCount > 0 && (
                    <Badge
                      variant="info"
                      size="sm"
                      className="border-transparent px-1.5 text-[11px]"
                    >
                      {overflowSelectedCount}
                    </Badge>
                  )}
                </span>
              </ToggleButton>
            </PopoverTrigger>
            <PopoverContent className="flex max-h-64 flex-col gap-2 overflow-y-auto p-2">
              {overflowOptions.map((option) => renderTagButton(option, true))}
            </PopoverContent>
          </Popover>
        ) : (
          <ToggleButton
            type="button"
            variant="ghost"
            size="sm"
            shape="pill"
            disabled={disabled}
            className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary/70 dark:text-dark-text-primary border border-gray-200 bg-white px-3 py-1 text-xs text-gray-900 shadow-xs sm:text-[13px]"
            aria-label={moreLabel}
            onClick={() => {
              if (!disabled) {
                setIsOverflowExpanded(true)
              }
            }}
          >
            <span className="flex items-center gap-1">
              <span>{moreLabel}</span>
              <Badge
                variant="outline"
                size="sm"
                className="border-transparent px-1.5 text-[11px]"
              >
                +{overflowOptions.length}
              </Badge>
              {overflowSelectedCount > 0 && (
                <Badge
                  variant="info"
                  size="sm"
                  className="border-transparent px-1.5 text-[11px]"
                >
                  {overflowSelectedCount}
                </Badge>
              )}
            </span>
          </ToggleButton>
        ))}
    </div>
  )
}
