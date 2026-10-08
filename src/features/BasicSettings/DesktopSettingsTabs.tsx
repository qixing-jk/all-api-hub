import { ChevronDown } from "lucide-react"
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import { type BasicSettingsTabId as TabId } from "~/constants/basicSettingsTabs"

import type { SettingsTabItem } from "./settingsTabRegistry"

const DESKTOP_TAB_GAP_PX = 8

/**
 * Returns the shared desktop tab button classes for selected and idle states.
 */
function getTabButtonClass(selected: boolean) {
  return `border-b-2 px-3 py-density-3 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none ${
    selected
      ? "border-theme-600 text-theme-600 dark:border-theme-500 dark:text-theme-400"
      : "border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground dark:hover:text-secondary-foreground"
  }`
}

/**
 * Compute the total desktop row width for the provided tab ids.
 */
function getDesktopTabRowWidth(
  tabIds: TabId[],
  tabWidthsById: Readonly<Partial<Record<TabId, number>>>,
) {
  if (tabIds.length <= 0) return 0

  return tabIds.reduce((sum, tabId, index) => {
    const width = tabWidthsById[tabId] ?? 0
    return sum + width + (index > 0 ? DESKTOP_TAB_GAP_PX : 0)
  }, 0)
}

/**
 * Renders the desktop tabs.
 */
export function DesktopSettingsTabs({
  tabs,
  selectedTabId,
  onTabSelect,
}: {
  tabs: SettingsTabItem[]
  selectedTabId: TabId
  onTabSelect: (tabId: TabId) => void
}) {
  const { t } = useTranslation(["settings", "common"])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const moreMeasureRef = useRef<HTMLButtonElement | null>(null)
  const tabMeasureRefs = useRef<
    Partial<Record<TabId, HTMLButtonElement | null>>
  >({})
  const [visibleTabIds, setVisibleTabIds] = useState<TabId[]>(() =>
    tabs.map((tab) => tab.id),
  )
  const [overflowTabIds, setOverflowTabIds] = useState<TabId[]>([])

  const tabsById = useMemo(
    () =>
      Object.fromEntries(tabs.map((tab) => [tab.id, tab])) as Record<
        TabId,
        SettingsTabItem
      >,
    [tabs],
  )
  const orderedTabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs])

  const recalculateVisibleTabs = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const availableWidth = container.clientWidth
    if (availableWidth <= 0) return

    const tabWidths = orderedTabIds.map(
      (tabId) =>
        tabMeasureRefs.current[tabId]?.getBoundingClientRect().width ?? 0,
    )
    const moreWidth = moreMeasureRef.current?.getBoundingClientRect().width ?? 0

    if (tabWidths.some((width) => width <= 0)) {
      return
    }

    const tabWidthsById = Object.fromEntries(
      orderedTabIds.map((tabId, index) => [tabId, tabWidths[index] ?? 0]),
    ) as Record<TabId, number>

    const getTotalWidth = (count: number) => {
      if (count <= 0) return 0
      const contentWidth = tabWidths
        .slice(0, count)
        .reduce((sum, width) => sum + width, 0)
      return contentWidth + DESKTOP_TAB_GAP_PX * (count - 1)
    }

    if (getTotalWidth(orderedTabIds.length) <= availableWidth) {
      setVisibleTabIds(orderedTabIds)
      setOverflowTabIds([])
      return
    }

    const reservedWidth = moreWidth + DESKTOP_TAB_GAP_PX
    const maxVisibleWidth = Math.max(availableWidth - reservedWidth, 0)

    let usedWidth = 0
    let visibleCount = 0

    for (const width of tabWidths) {
      const nextWidth =
        visibleCount === 0 ? width : usedWidth + DESKTOP_TAB_GAP_PX + width
      if (nextWidth > maxVisibleWidth) {
        break
      }
      usedWidth = nextWidth
      visibleCount += 1
    }

    let nextVisibleTabIds = orderedTabIds.slice(0, visibleCount)

    if (!nextVisibleTabIds.includes(selectedTabId)) {
      nextVisibleTabIds = [...nextVisibleTabIds, selectedTabId]

      while (
        nextVisibleTabIds.length > 1 &&
        getDesktopTabRowWidth(nextVisibleTabIds, tabWidthsById) >
          maxVisibleWidth
      ) {
        nextVisibleTabIds.splice(nextVisibleTabIds.length - 2, 1)
      }
    }

    nextVisibleTabIds = orderedTabIds.filter((tabId) =>
      nextVisibleTabIds.includes(tabId),
    )

    const nextOverflowTabIds = orderedTabIds.filter(
      (tabId) => !nextVisibleTabIds.includes(tabId),
    )

    setVisibleTabIds(nextVisibleTabIds)
    setOverflowTabIds(nextOverflowTabIds)
  }, [orderedTabIds, selectedTabId])

  useLayoutEffect(() => {
    recalculateVisibleTabs()

    const container = containerRef.current
    if (!container || typeof ResizeObserver === "undefined") {
      return
    }

    const resizeObserver = new ResizeObserver(() => {
      recalculateVisibleTabs()
    })

    resizeObserver.observe(container)
    return () => {
      resizeObserver.disconnect()
    }
  }, [recalculateVisibleTabs])

  return (
    <div
      ref={containerRef}
      className="border-border gap-y-density-2 relative -mb-px hidden items-center gap-x-2 border-b md:flex"
    >
      <div
        aria-hidden="true"
        className="gap-y-density-2 pointer-events-none absolute top-0 left-0 -z-10 flex w-full gap-x-2 overflow-hidden opacity-0"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(node) => {
              tabMeasureRefs.current[tab.id] = node
            }}
            type="button"
            className={getTabButtonClass(false)}
            tabIndex={-1}
          >
            {tab.label}
          </button>
        ))}
        <button
          ref={moreMeasureRef}
          type="button"
          className={getTabButtonClass(false)}
          tabIndex={-1}
        >
          <span className="gap-y-density-1-5 inline-flex items-center gap-x-1.5">
            {t("common:actions.more")}
            <ChevronDown className="h-4 w-4" />
          </span>
        </button>
      </div>

      <div className="gap-y-density-2 flex min-w-0 flex-1 items-center gap-x-2 overflow-hidden">
        {visibleTabIds.map((tabId) => {
          const tab = tabsById[tabId]
          const isSelected = selectedTabId === tab.id

          return (
            <button
              key={tab.id}
              type="button"
              className={getTabButtonClass(isSelected)}
              aria-pressed={isSelected}
              onClick={() => onTabSelect(tab.id)}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {overflowTabIds.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={getTabButtonClass(false)}
              aria-label={t("common:actions.more")}
            >
              <span className="gap-y-density-1-5 inline-flex items-center gap-x-1.5">
                {t("common:actions.more")}
                <ChevronDown className="h-4 w-4" />
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {overflowTabIds.map((tabId) => {
              const tab = tabsById[tabId]

              return (
                <DropdownMenuItem
                  key={tab.id}
                  onClick={() => onTabSelect(tab.id)}
                  className={
                    selectedTabId === tab.id ? "font-medium" : undefined
                  }
                >
                  {tab.label}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
