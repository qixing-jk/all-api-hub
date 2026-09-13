import { Storage } from "@plasmohq/storage"

import { OPTIONS_SEARCH_STORAGE_KEYS } from "~/services/core/storageKeys"

import type { OptionsSearchItem } from "./types"

const MAX_RECENT_ITEM_IDS = 8
const LEGACY_OPTIONS_SEARCH_RECENT_IDS_KEY = "options-search-recent-item-ids"
const storage = new Storage({ area: "local" })

/**
 * Normalizes stored recent item ids by removing empty values and enforcing the size limit.
 */
function sanitizeRecentItemIds(ids: unknown) {
  if (!Array.isArray(ids)) {
    return []
  }

  return ids
    .filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    )
    .slice(0, MAX_RECENT_ITEM_IDS)
}

/**
 * Attempts a one-time migration from the legacy localStorage key into extension storage.
 */
async function migrateLegacyRecentItemIds() {
  if (
    typeof window === "undefined" ||
    typeof window.localStorage === "undefined"
  ) {
    return undefined
  }

  const raw = window.localStorage.getItem(LEGACY_OPTIONS_SEARCH_RECENT_IDS_KEY)
  if (!raw) {
    return undefined
  }

  let migratedIds: string[]
  try {
    migratedIds = sanitizeRecentItemIds(JSON.parse(raw))
  } catch {
    window.localStorage.removeItem(LEGACY_OPTIONS_SEARCH_RECENT_IDS_KEY)
    return undefined
  }

  await storage.set(OPTIONS_SEARCH_STORAGE_KEYS.RECENT_ITEM_IDS, migratedIds)
  window.localStorage.removeItem(LEGACY_OPTIONS_SEARCH_RECENT_IDS_KEY)

  return migratedIds
}

/**
 * Loads the recent search item id list from extension storage.
 */
export async function loadRecentSearchItemIds() {
  try {
    const stored = await storage.get(
      OPTIONS_SEARCH_STORAGE_KEYS.RECENT_ITEM_IDS,
    )
    if (stored !== undefined) {
      return sanitizeRecentItemIds(stored)
    }

    const migratedIds = await migrateLegacyRecentItemIds()
    if (migratedIds) {
      return migratedIds
    }

    return []
  } catch {
    return []
  }
}

/**
 * Saves the selected search item id to the front of the recent items list.
 */
export async function saveRecentSearchItemSelection(
  item: Pick<OptionsSearchItem, "id">,
) {
  try {
    const currentIds = await loadRecentSearchItemIds()
    const nextIds = sanitizeRecentItemIds([
      item.id,
      ...currentIds.filter((existingId) => existingId !== item.id),
    ])

    await storage.set(OPTIONS_SEARCH_STORAGE_KEYS.RECENT_ITEM_IDS, nextIds)
    return nextIds
  } catch {
    // Ignore storage failures; recent items are a non-critical enhancement.
    return []
  }
}

/**
 * Resolves stored recent item ids into the current localized search items.
 */
export function resolveRecentSearchItems(
  allItems: OptionsSearchItem[],
  recentIds: string[] = [],
) {
  if (recentIds.length === 0) {
    return []
  }

  const itemsById = new Map(allItems.map((item) => [item.id, item]))

  return recentIds
    .map((id) => itemsById.get(id))
    .filter((item): item is OptionsSearchItem => Boolean(item))
}
