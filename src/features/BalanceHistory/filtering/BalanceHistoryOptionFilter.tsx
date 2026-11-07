import { Search } from "lucide-react"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Input, Label, TagFilter } from "~/components/ui"
import type { TagFilterOption } from "~/components/ui/TagFilter"
import { useMediaQuery } from "~/hooks/useMediaQuery"
import { cn } from "~/lib/utils"

/** Search the available choices without discarding selections outside the query. */
export function BalanceHistoryOptionFilter({
  title,
  hint,
  searchLabel,
  allLabel,
  options,
  value,
  onChange,
  maxVisibleLines,
}: {
  title: string
  hint: string
  searchLabel: string
  allLabel: string
  options: TagFilterOption[]
  value: string[]
  onChange: (value: string[]) => void
  maxVisibleLines: number
}) {
  const { t } = useTranslation("balanceHistory")
  const [query, setQuery] = useState("")
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)")
  const animateOptions =
    !reduceMotion && typeof Element.prototype.animate === "function"
  const listRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const list = listRef.current
    const content = contentRef.current
    if (
      !animateOptions ||
      !list ||
      !content ||
      typeof ResizeObserver === "undefined"
    )
      return

    let height: number | undefined
    let animation: Animation | undefined
    const observer = new ResizeObserver(() => {
      const nextHeight = content.getBoundingClientRect().height
      if (height === undefined) {
        // The first observation already includes the chip list's collapsed layout.
        height = nextHeight
        return
      }
      if (nextHeight === height) return

      // Retarget from the visible height when the user types again mid-animation.
      const from =
        animation?.playState === "running"
          ? list.getBoundingClientRect().height
          : height
      animation?.cancel()
      height = nextHeight
      animation = list.animate(
        { height: [`${from}px`, `${nextHeight}px`] },
        { duration: 260, easing: "cubic-bezier(0.32, 0, 0.18, 1)" },
      )
    })
    observer.observe(content)

    return () => {
      observer.disconnect()
      animation?.cancel()
    }
  }, [animateOptions])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchingOptions = useMemo(
    () =>
      normalizedQuery
        ? options.filter((option) =>
            option.label.toLocaleLowerCase().includes(normalizedQuery),
          )
        : options,
    [normalizedQuery, options],
  )

  return (
    <section className="space-y-density-2 py-density-4" aria-label={title}>
      <div className="gap-y-density-1 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3">
        <Label className="text-sm font-medium">{title}</Label>
        <div
          className={cn(
            "group/search relative w-8 max-w-full justify-self-end [transition:width_300ms_cubic-bezier(0.32,0,0.18,1)]! motion-reduce:transition-none!",
            options.length > 0 && "focus-within:w-40 hover:w-40",
            query && "w-40",
          )}
        >
          <Input
            type="search"
            size="sm"
            className="bg-surface-subtle dark:bg-surface-subtle group-focus-within/search:placeholder:text-faint-foreground group-hover/search:placeholder:text-faint-foreground pr-0 pl-7 text-xs shadow-none placeholder:text-transparent placeholder:transition-colors placeholder:duration-150 group-focus-within/search:placeholder:delay-75 group-hover/search:placeholder:delay-75 focus:ring-1 focus-visible:ring-1 motion-reduce:placeholder:transition-none [&::-webkit-search-cancel-button]:appearance-none"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={() => setQuery("")}
            clearButtonLabel={t("common:actions.clear")}
            placeholder={searchLabel}
            aria-label={searchLabel}
            disabled={options.length === 0}
          />
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.25 size-3.5 -translate-y-1/2"
          />
        </div>
        <div className="text-muted-foreground col-span-2 text-xs">{hint}</div>
      </div>
      <div
        ref={listRef}
        className={cn(
          animateOptions && "overflow-clip [overflow-clip-margin:4px]",
        )}
      >
        <div ref={contentRef} className="space-y-density-2">
          <TagFilter
            animateInlineOptions={animateOptions}
            className="[&>button]:max-w-full [&>button]:min-w-0"
            options={matchingOptions}
            value={value}
            onChange={onChange}
            includeAllOption={!normalizedQuery}
            allLabel={allLabel}
            maxVisible={normalizedQuery ? matchingOptions.length : undefined}
            maxVisibleLines={normalizedQuery ? undefined : maxVisibleLines}
            disabled={options.length === 0}
          />
          {normalizedQuery && matchingOptions.length === 0 && (
            <div role="status" className="text-muted-foreground text-sm">
              {t("filters.noResults")}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
