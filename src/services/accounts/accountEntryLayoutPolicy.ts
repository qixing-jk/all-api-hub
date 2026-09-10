import type { AccountStorageConfig } from "~/types"

export const buildEntryIdSets = (
  config: Pick<AccountStorageConfig, "accounts" | "bookmarks">,
) => {
  const accountIds = new Set(
    (Array.isArray(config.accounts) ? config.accounts : []).map(
      (account) => account.id,
    ),
  )
  const bookmarkIds = new Set(
    (Array.isArray(config.bookmarks) ? config.bookmarks : []).map(
      (bookmark) => bookmark.id,
    ),
  )
  return {
    accountIds,
    bookmarkIds,
    entryIds: new Set<string>([...accountIds, ...bookmarkIds]),
  }
}

export const filterKnownUniqueEntryIds = (
  ids: string[],
  validIds: Set<string>,
): string[] => Array.from(new Set(ids)).filter((id) => validIds.has(id))

export const removeEntryIdsFromLayout = (
  config: Pick<AccountStorageConfig, "pinnedAccountIds" | "orderedAccountIds">,
  ids: Set<string>,
): void => {
  config.pinnedAccountIds = config.pinnedAccountIds.filter((id) => !ids.has(id))
  config.orderedAccountIds = config.orderedAccountIds.filter(
    (id) => !ids.has(id),
  )
}

/** Replaces one entry-kind subset while preserving other entry slots. */
export const replaceIdListSubset = (input: {
  existingIds: string[]
  subsetIdSet: Set<string>
  nextSubsetIds: string[]
}): string[] => {
  const existingIds = Array.isArray(input.existingIds) ? input.existingIds : []
  const seenSubset = new Set<string>()
  const uniqueNextSubsetIds = input.nextSubsetIds.filter((id) => {
    if (!input.subsetIdSet.has(id) || seenSubset.has(id)) return false
    seenSubset.add(id)
    return true
  })
  const missingExistingSubsetIds = existingIds.filter(
    (id) => input.subsetIdSet.has(id) && !seenSubset.has(id),
  )
  const queue = [...uniqueNextSubsetIds, ...missingExistingSubsetIds]
  const result: string[] = []
  const seen = new Set<string>()
  let queueIndex = 0

  const takeNextSubset = () => {
    while (queueIndex < queue.length) {
      const next = queue[queueIndex]
      queueIndex += 1
      if (seen.has(next)) continue
      seen.add(next)
      return next
    }
    return null
  }

  for (const id of existingIds) {
    if (input.subsetIdSet.has(id)) {
      const next = takeNextSubset()
      if (next) result.push(next)
      continue
    }
    if (seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }

  while (queueIndex < queue.length) {
    const next = takeNextSubset()
    if (!next) break
    result.push(next)
  }

  return result
}
