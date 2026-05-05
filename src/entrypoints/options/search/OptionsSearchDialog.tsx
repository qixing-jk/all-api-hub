import {
  FileTextIcon,
  FolderIcon,
  ListTreeIcon,
  SearchIcon,
  Settings2Icon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  BodySmall,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui"

import { navigateFromSearchItem } from "./navigation"
import {
  loadRecentSearchItemIds,
  resolveRecentSearchItems,
  saveRecentSearchItemSelection,
} from "./recentItems"
import type { OptionsSearchContext, OptionsSearchItem } from "./types"
import { useOptionsSearch } from "./useOptionsSearch"

interface OptionsSearchDialogProps {
  context: OptionsSearchContext
  onOpenChange: (open: boolean) => void
  onPageNavigate: (
    pageId: string,
    params?: Record<string, string | undefined>,
  ) => void
  open: boolean
}

const GROUP_ORDER = ["page", "tab", "control"] as const

/**
 * Returns the icon used to represent a search result item by kind.
 */
function getIconForItem(item: OptionsSearchItem) {
  switch (item.kind) {
    case "page":
      return <FolderIcon className="h-4 w-4" />
    case "tab":
      return <ListTreeIcon className="h-4 w-4" />
    case "section":
      return <FileTextIcon className="h-4 w-4" />
    case "control":
      return <Settings2Icon className="h-4 w-4" />
  }
}

/**
 * Renders the shared search result row used by both recent items and query results.
 */
function SearchResultItem({
  item,
  onSelect,
}: {
  item: OptionsSearchItem
  onSelect: () => void
}) {
  return (
    <CommandItem
      value={`${item.title} ${item.description ?? ""} ${item.breadcrumbs.join(" ")} ${item.keywords.join(" ")}`}
      onSelect={onSelect}
      className="items-start gap-3"
    >
      <div className="pt-0.5 text-gray-500">{getIconForItem(item)}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{item.title}</div>
        {item.description ? (
          <div className="truncate text-xs text-gray-500">
            {item.description}
          </div>
        ) : null}
        <div className="truncate text-xs text-gray-400">
          {item.breadcrumbs.join(" / ")}
        </div>
      </div>
    </CommandItem>
  )
}

/**
 * Renders the options search dialog with grouped results and recent items.
 */
export function OptionsSearchDialog({
  context,
  onOpenChange,
  onPageNavigate,
  open,
}: OptionsSearchDialogProps) {
  const { t } = useTranslation("ui")
  const [query, setQuery] = useState("")
  const { items, results } = useOptionsSearch(context, query)
  const hasQuery = query.trim().length > 0
  const [recentItemIds, setRecentItemIds] = useState<string[]>([])
  const recentItems = useMemo(
    () => resolveRecentSearchItems(items, recentItemIds),
    [items, recentItemIds],
  )

  useEffect(() => {
    let cancelled = false

    if (!open) {
      return () => {
        cancelled = true
      }
    }

    void loadRecentSearchItemIds().then((ids) => {
      if (!cancelled) {
        setRecentItemIds(ids)
      }
    })

    return () => {
      cancelled = true
    }
  }, [open])

  const groups = useMemo(() => {
    const pageItems: OptionsSearchItem[] = []
    const tabItems: OptionsSearchItem[] = []
    const controlItems: OptionsSearchItem[] = []

    results.forEach((item) => {
      if (item.kind === "page") {
        pageItems.push(item)
        return
      }

      if (item.kind === "tab") {
        tabItems.push(item)
        return
      }

      controlItems.push(item)
    })

    return {
      page: pageItems,
      tab: tabItems,
      control: controlItems,
    }
  }, [results])

  const handleSelect = (item: OptionsSearchItem) => {
    void saveRecentSearchItemSelection(item).then((ids) => {
      setRecentItemIds(ids)
    })
    navigateFromSearchItem(item, onPageNavigate)
    setQuery("")
    onOpenChange(false)
  }

  return (
    <CommandDialog
      open={open}
      shouldFilter={false}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setQuery("")
        }
        onOpenChange(nextOpen)
      }}
      title={t("optionsSearch.dialogTitle")}
      description={t("optionsSearch.dialogDescription")}
      className="max-w-2xl"
      contentClassName="min-h-[420px]"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t("optionsSearch.placeholder")}
        clearButtonLabel={t("common:actions.clear")}
        onClear={() => setQuery("")}
      />
      <CommandList className="max-h-[60vh]">
        {!hasQuery ? (
          recentItems.length > 0 ? (
            <CommandGroup heading={t("optionsSearch.groups.recent")}>
              {recentItems.map((item) => (
                <SearchResultItem
                  key={item.id}
                  item={item}
                  onSelect={() => handleSelect(item)}
                />
              ))}
            </CommandGroup>
          ) : (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 px-6 py-8 text-center">
              <SearchIcon className="h-5 w-5 opacity-50" />
              <div className="text-sm font-medium">
                {t("optionsSearch.idleTitle")}
              </div>
              <BodySmall>{t("optionsSearch.idleDescription")}</BodySmall>
            </div>
          )
        ) : (
          <CommandEmpty>
            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
              <SearchIcon className="h-5 w-5 opacity-50" />
              <div className="text-sm font-medium">
                {t("optionsSearch.emptyTitle")}
              </div>
              <BodySmall>{t("optionsSearch.emptyDescription")}</BodySmall>
            </div>
          </CommandEmpty>
        )}

        {hasQuery &&
          GROUP_ORDER.map((groupKey) => {
            const items = groups[groupKey]
            if (items.length === 0) {
              return null
            }

            return (
              <CommandGroup
                key={groupKey}
                heading={t(`optionsSearch.groups.${groupKey}`)}
              >
                {items.map((item) => (
                  <SearchResultItem
                    key={item.id}
                    item={item}
                    onSelect={() => handleSelect(item)}
                  />
                ))}
              </CommandGroup>
            )
          })}
      </CommandList>
    </CommandDialog>
  )
}
