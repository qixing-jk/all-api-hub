import { ChevronDown, Search } from "lucide-react"
import { useId, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "~/lib/utils"

import { Button } from "./button"
import { Checkbox } from "./checkbox"
import { Input } from "./input"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import type { TagFilterOption } from "./TagFilter"

interface CompactTagFilterProps {
  options: TagFilterOption[]
  value: string[]
  onChange: (value: string[]) => void
  allLabel: string
}

const chipClassName =
  "inline-flex h-9 max-w-36 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap sm:h-8"

/** A single row of stable shortcuts with searchable access to every tag. */
export function CompactTagFilter({
  options,
  value,
  onChange,
  allLabel,
}: CompactTagFilterProps) {
  const { t } = useTranslation("common")
  const headingId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [visibleCount, setVisibleCount] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef(false)
  const shortcutsRef = useRef<HTMLDivElement>(null)
  const measurementRef = useRef<HTMLDivElement>(null)
  const selected = new Set(value)

  useLayoutEffect(() => {
    const shortcuts = shortcutsRef.current
    const measurement = measurementRef.current
    if (!shortcuts || !measurement) return

    const measure = () => {
      const children = Array.from(measurement.children) as HTMLElement[]
      let usedWidth = children[0]?.getBoundingClientRect().width ?? 0
      let count = 0
      for (const child of children.slice(1)) {
        usedWidth += 4 + child.getBoundingClientRect().width
        if (usedWidth > shortcuts.clientWidth) break
        count += 1
      }
      setVisibleCount(count)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(shortcuts)
    observer.observe(measurement)
    return () => observer.disconnect()
  }, [options, allLabel])

  const toggle = (id: string) => {
    onChange(
      selected.has(id) ? value.filter((item) => item !== id) : [...value, id],
    )
  }
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchingOptions = options.filter((option) =>
    option.label.toLocaleLowerCase().includes(normalizedQuery),
  )
  const renderLabel = (option: TagFilterOption) => (
    <>
      <span className="truncate">{option.label}</span>
      {typeof option.count === "number" && (
        <span className="shrink-0 text-[11px] opacity-70">{option.count}</span>
      )}
    </>
  )

  if (options.length === 0) return null

  return (
    <div
      className="relative flex min-w-0 items-center gap-2"
      data-slot="compact-tag-filter"
    >
      {/* Measure noninteractive copies so clipped shortcuts never remain tabbable. */}
      <div
        aria-hidden="true"
        inert
        className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden"
      >
        <div ref={measurementRef} className="flex w-max gap-1">
          <span className={chipClassName}>{allLabel}</span>
          {options.map((option) => (
            <span key={option.value} className={chipClassName}>
              {renderLabel(option)}
            </span>
          ))}
        </div>
      </div>
      <div
        ref={shortcutsRef}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
      >
        <button
          type="button"
          aria-pressed={value.length === 0}
          onClick={() => onChange([])}
          className={cn(
            chipClassName,
            "focus-visible:outline-ring focus-visible:outline-2",
            value.length === 0
              ? "bg-theme-50 text-theme-700 dark:bg-theme-950/50 dark:text-theme-300"
              : "text-muted-foreground hover:bg-muted dark:text-secondary-foreground dark:hover:bg-foreground/5",
          )}
        >
          {allLabel}
        </button>
        {options.slice(0, visibleCount).map((option) => (
          <button
            key={option.value}
            type="button"
            title={option.title ?? option.label}
            aria-pressed={selected.has(option.value)}
            disabled={option.disabled && !selected.has(option.value)}
            onClick={() => toggle(option.value)}
            className={cn(
              chipClassName,
              "focus-visible:outline-ring focus-visible:outline-2 disabled:opacity-50",
              selected.has(option.value)
                ? "bg-theme-50 text-theme-700 dark:bg-theme-950/50 dark:text-theme-300"
                : "text-muted-foreground hover:bg-muted dark:text-secondary-foreground dark:hover:bg-foreground/5",
            )}
          >
            {renderLabel(option)}
          </button>
        ))}
      </div>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) restoreFocusRef.current = false
          if (!next) setQuery("")
        }}
      >
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            aria-label={`${value.length > 0 ? t("tagFilter.selected") : t("tagFilter.allTags")} ${value.length > 0 ? value.length : options.length}`}
            variant="outline"
            size="sm"
            className="h-9 max-w-[60%] shrink-0 gap-1.5 px-2.5 text-xs shadow-none sm:h-8"
          >
            <span aria-hidden="true" className="grid min-w-0">
              <span
                className={cn(
                  "col-start-1 row-start-1 truncate",
                  value.length > 0 && "invisible",
                )}
              >
                {t("tagFilter.allTags")}
              </span>
              <span
                className={cn(
                  "col-start-1 row-start-1 truncate",
                  value.length === 0 && "invisible",
                )}
              >
                {t("tagFilter.selected")}
              </span>
            </span>
            <span
              className="tabular-nums"
              style={{
                minWidth: `${String(Math.max(options.length, value.length)).length}ch`,
              }}
            >
              {value.length > 0 ? value.length : options.length}
            </span>
            <ChevronDown aria-hidden="true" className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          onEscapeKeyDown={() => {
            restoreFocusRef.current = true
          }}
          onCloseAutoFocus={(event) => {
            if (!restoreFocusRef.current) return
            event.preventDefault()
            triggerRef.current?.focus({ preventScroll: true })
            restoreFocusRef.current = false
          }}
          collisionPadding={12}
          aria-labelledby={headingId}
          className="flex max-h-[var(--radix-popover-content-available-height)] w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-3 overflow-hidden p-3"
        >
          <div id={headingId} className="text-sm font-medium">
            {t("tagFilter.allTags")}
          </div>
          <Input
            aria-label={t("tagFilter.search")}
            placeholder={t("tagFilter.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            leftIcon={<Search aria-hidden="true" className="size-4" />}
            size="sm"
          />
          <div className="max-h-64 min-h-0 overflow-y-auto overscroll-contain">
            {matchingOptions.length === 0 ? (
              <p className="text-muted-foreground p-3 text-sm">
                {t("tagFilter.noResults")}
              </p>
            ) : (
              matchingOptions.map((option) => (
                <label
                  key={option.value}
                  className="hover:bg-surface-subtle dark:hover:bg-foreground/5 flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm"
                >
                  <Checkbox
                    aria-label={option.label}
                    checked={selected.has(option.value)}
                    disabled={option.disabled && !selected.has(option.value)}
                    onCheckedChange={() => toggle(option.value)}
                  />
                  <span className="min-w-0 flex-1 break-words">
                    {option.label}
                  </span>
                  {typeof option.count === "number" && (
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {option.count}
                    </span>
                  )}
                </label>
              ))
            )}
          </div>
          <div className="border-border dark:border-foreground/10 flex shrink-0 items-center justify-between gap-2 border-t pt-2">
            <span className="text-muted-foreground text-xs">
              {t("tagFilter.selected")} {value.length}
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={value.length === 0}
                onClick={() => onChange([])}
              >
                {t("actions.clear")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  restoreFocusRef.current = true
                  setOpen(false)
                  setQuery("")
                }}
              >
                {t("actions.close")}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
