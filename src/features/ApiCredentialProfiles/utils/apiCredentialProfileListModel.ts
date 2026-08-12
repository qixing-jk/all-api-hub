import { PRODUCT_ANALYTICS_MODE_IDS } from "~/services/productAnalytics/contracts"
import type { Tag } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

export type ApiCredentialProfileFilterMode =
  | typeof PRODUCT_ANALYTICS_MODE_IDS.SearchFilter
  | typeof PRODUCT_ANALYTICS_MODE_IDS.ProviderFilter
  | typeof PRODUCT_ANALYTICS_MODE_IDS.GroupFilter

interface BuildApiCredentialProfileListModelInput {
  profiles: ApiCredentialProfile[]
  tags: Tag[]
  tagNameById: Map<string, string>
  searchTerm: string
  apiTypeFilter: string
  selectedTagIds: string[]
  lastFilterMode: ApiCredentialProfileFilterMode | null
}

interface ApiCredentialProfileTagFilterOption {
  value: string
  label: string
  count: number
}

interface ApiCredentialProfileListModel {
  filteredProfiles: ApiCredentialProfile[]
  tagFilterOptions: ApiCredentialProfileTagFilterOption[]
  activeFilterCount: number
  analyticsMode: ApiCredentialProfileFilterMode | null
}

/** Normalizes user input for case-, width-, and whitespace-insensitive search. */
function normalizeForSearch(value: string): string {
  if (!value) return ""

  let normalized = value.toLowerCase().trim()
  normalized = normalized.replace(/[\uff01-\uff5e]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0xfee0),
  )
  return normalized.replace(/\s+/g, " ").trim()
}

/** Resolves configured tag names while omitting missing and empty lookups. */
function getProfileTagNames(
  profile: ApiCredentialProfile,
  tagNameById: Map<string, string>,
): string[] {
  return (profile.tagIds ?? []).flatMap((tagId) => {
    const tagName = tagNameById.get(tagId)
    return tagName ? [tagName] : []
  })
}

/** Counts configured tag IDs across the full unfiltered profile collection. */
function countProfilesByTagId(
  profiles: ApiCredentialProfile[],
): Record<string, number> {
  const counts: Record<string, number> = {}

  for (const profile of profiles) {
    for (const tagId of profile.tagIds ?? []) {
      if (!tagId) continue
      counts[tagId] = (counts[tagId] ?? 0) + 1
    }
  }

  return counts
}

/**
 * Builds the derived profile-list state consumed by both options and popup views.
 */
export function buildApiCredentialProfileListModel({
  profiles,
  tags,
  tagNameById,
  searchTerm,
  apiTypeFilter,
  selectedTagIds,
  lastFilterMode,
}: BuildApiCredentialProfileListModelInput): ApiCredentialProfileListModel {
  const query = normalizeForSearch(searchTerm)
  const normalizedApiTypeFilter = apiTypeFilter.trim()
  const filteredProfiles = profiles.filter((profile) => {
    if (
      normalizedApiTypeFilter &&
      profile.apiType !== normalizedApiTypeFilter
    ) {
      return false
    }

    if (
      selectedTagIds.length > 0 &&
      !selectedTagIds.some((tagId) => (profile.tagIds ?? []).includes(tagId))
    ) {
      return false
    }

    if (!query) return true

    const searchableText = normalizeForSearch(
      [
        profile.name,
        profile.baseUrl,
        ...getProfileTagNames(profile, tagNameById),
        profile.notes ?? "",
      ]
        .filter(Boolean)
        .join(" "),
    )

    return searchableText.includes(query)
  })

  const tagCountsById = countProfilesByTagId(profiles)
  const tagFilterOptions = tags.map((tag) => ({
    value: tag.id,
    label: tag.name,
    count: tagCountsById[tag.id] ?? 0,
  }))

  let activeFilterCount = 0
  if (searchTerm.trim()) activeFilterCount += 1
  if (normalizedApiTypeFilter) activeFilterCount += 1
  if (selectedTagIds.length > 0) activeFilterCount += 1

  const analyticsMode =
    activeFilterCount === 0
      ? null
      : lastFilterMode ??
        (searchTerm.trim()
          ? PRODUCT_ANALYTICS_MODE_IDS.SearchFilter
          : normalizedApiTypeFilter
            ? PRODUCT_ANALYTICS_MODE_IDS.ProviderFilter
            : PRODUCT_ANALYTICS_MODE_IDS.GroupFilter)

  return {
    filteredProfiles,
    tagFilterOptions,
    activeFilterCount,
    analyticsMode,
  }
}
