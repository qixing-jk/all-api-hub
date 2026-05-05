import type { OptionsSearchItem } from "./types"

const OPTIONS_SEARCH_RECENT_IDS_KEY = "options-search-recent-item-ids"
const MAX_RECENT_ITEM_IDS = 8

/**
 * Returns whether recent-search persistence can use browser localStorage.
 */
function canUseLocalStorage() {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  )
}

/**
 * Normalizes stored recent item ids by removing empty values and enforcing the size limit.
 */
function sanitizeRecentItemIds(ids: string[]) {
  return ids.filter(Boolean).slice(0, MAX_RECENT_ITEM_IDS)
}

/**
 * Loads the recent search item id list from localStorage.
 */
export function loadRecentSearchItemIds() {
  if (!canUseLocalStorage()) {
    return []
  }

  try {
    const raw = window.localStorage.getItem(OPTIONS_SEARCH_RECENT_IDS_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return sanitizeRecentItemIds(
      parsed.filter((item): item is string => typeof item === "string"),
    )
  } catch {
    return []
  }
}

/**
 * Saves the selected search item id to the front of the recent items list.
 */
export function saveRecentSearchItemSelection(
  item: Pick<OptionsSearchItem, "id">,
) {
  if (!canUseLocalStorage()) {
    return
  }

  try {
    const nextIds = sanitizeRecentItemIds([
      item.id,
      ...loadRecentSearchItemIds().filter(
        (existingId) => existingId !== item.id,
      ),
    ])

    window.localStorage.setItem(
      OPTIONS_SEARCH_RECENT_IDS_KEY,
      JSON.stringify(nextIds),
    )
  } catch {
    // Ignore storage failures; recent items are a non-critical enhancement.
  }
}

/**
 * Resolves stored recent item ids into the current localized search items.
 */
export function resolveRecentSearchItems(
  allItems: OptionsSearchItem[],
  recentIds = loadRecentSearchItemIds(),
) {
  if (recentIds.length === 0) {
    return []
  }

  const itemsById = new Map(allItems.map((item) => [item.id, item]))

  return recentIds
    .map((id) => itemsById.get(id))
    .filter((item): item is OptionsSearchItem => Boolean(item))
}
