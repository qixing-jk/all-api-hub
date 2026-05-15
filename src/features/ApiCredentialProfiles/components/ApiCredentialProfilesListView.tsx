import { MagnifyingGlassIcon } from "@heroicons/react/24/outline"
import { KeyRound } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  EmptyState,
  Input,
  SearchableSelect,
  Spinner,
  TagFilter,
} from "~/components/ui"
import { useIsDesktop, useIsSmallScreen } from "~/hooks/useMediaQuery"
import { cn } from "~/lib/utils"
import { trackProductAnalyticsActionCompleted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_API_TYPES,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"

import type { ApiCredentialProfilesController } from "../hooks/useApiCredentialProfilesController"
import { ApiCredentialProfilesDialogs } from "./ApiCredentialProfilesDialogs"
import { ApiCredentialProfilesList } from "./ApiCredentialProfilesList"

export interface ApiCredentialProfilesListViewProps {
  controller: ApiCredentialProfilesController
  variant?: "options" | "popup"
  autoFocusSearch?: boolean
  className?: string
}

/**
 * Normalize user-provided input for case/space-insensitive searching.
 */
function normalizeForSearch(value: string): string {
  if (!value) return ""

  let normalized = value.toLowerCase().trim()
  normalized = normalized.replace(/[\uff01-\uff5e]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  )
  normalized = normalized.replace(/\s+/g, " ").trim()

  return normalized
}

const analyticsApiTypeByVerificationApiType: Partial<
  Record<
    ApiVerificationApiType,
    (typeof PRODUCT_ANALYTICS_API_TYPES)[keyof typeof PRODUCT_ANALYTICS_API_TYPES]
  >
> = {
  [API_TYPES.OPENAI_COMPATIBLE]: PRODUCT_ANALYTICS_API_TYPES.OpenAiCompatible,
  [API_TYPES.OPENAI]: PRODUCT_ANALYTICS_API_TYPES.OpenAi,
  [API_TYPES.ANTHROPIC]: PRODUCT_ANALYTICS_API_TYPES.Anthropic,
  [API_TYPES.GOOGLE]: PRODUCT_ANALYTICS_API_TYPES.Google,
}

/**
 * Search/filterable API credential profiles view used in Options and Popup variants.
 */
export function ApiCredentialProfilesListView({
  controller,
  variant = "options",
  autoFocusSearch = false,
  className,
}: ApiCredentialProfilesListViewProps) {
  const { t } = useTranslation([
    "apiCredentialProfiles",
    "aiApiVerification",
    "common",
  ])
  const isSmallScreen = useIsSmallScreen()
  const isDesktop = useIsDesktop()

  const [searchTerm, setSearchTerm] = useState("")
  const [apiTypeFilter, setApiTypeFilter] = useState<string>("")
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [lastFilterMode, setLastFilterMode] = useState<
    | typeof PRODUCT_ANALYTICS_MODE_IDS.SearchFilter
    | typeof PRODUCT_ANALYTICS_MODE_IDS.ProviderFilter
    | typeof PRODUCT_ANALYTICS_MODE_IDS.GroupFilter
    | null
  >(null)

  const searchInputSize = variant === "popup" ? "sm" : "default"

  const clearSearch = useCallback(() => {
    setSearchTerm("")
  }, [])

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setLastFilterMode(PRODUCT_ANALYTICS_MODE_IDS.SearchFilter)
      setSearchTerm(event.target.value)
    },
    [],
  )

  const handleApiTypeFilterChange = useCallback((value: string) => {
    setLastFilterMode(PRODUCT_ANALYTICS_MODE_IDS.ProviderFilter)
    setApiTypeFilter(value)
  }, [])

  const handleTagFilterChange = useCallback((value: string[]) => {
    setLastFilterMode(PRODUCT_ANALYTICS_MODE_IDS.GroupFilter)
    setSelectedTagIds(value)
  }, [])

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        clearSearch()
      }
    },
    [clearSearch],
  )

  const tagCountsById = useMemo(() => {
    const counts: Record<string, number> = {}

    for (const profile of controller.profiles) {
      const ids = profile.tagIds ?? []
      for (const id of ids) {
        if (!id) continue
        counts[id] = (counts[id] ?? 0) + 1
      }
    }

    return counts
  }, [controller.profiles])

  const tagFilterOptions = useMemo(() => {
    if (controller.tags.length === 0) {
      return []
    }

    return controller.tags.map((tag) => ({
      value: tag.id,
      label: tag.name,
      count: tagCountsById[tag.id] ?? 0,
    }))
  }, [controller.tags, tagCountsById])

  const maxTagFilterLines = isSmallScreen ? 2 : isDesktop ? 3 : 2

  const filteredProfiles = useMemo(() => {
    const query = normalizeForSearch(searchTerm)
    const typeFilter = apiTypeFilter.trim()

    return controller.profiles.filter((profile) => {
      if (typeFilter && profile.apiType !== typeFilter) {
        return false
      }

      if (selectedTagIds.length > 0) {
        const ids = profile.tagIds ?? []
        if (!selectedTagIds.some((tagId) => ids.includes(tagId))) {
          return false
        }
      }

      if (!query) return true

      const resolvedTagNames = (profile.tagIds ?? [])
        .map((id) => controller.tagNameById.get(id))
        .filter(Boolean) as string[]

      const haystack = normalizeForSearch(
        [
          profile.name,
          profile.baseUrl,
          ...resolvedTagNames,
          profile.notes ?? "",
        ]
          .filter(Boolean)
          .join(" "),
      )

      return haystack.includes(query)
    })
  }, [
    apiTypeFilter,
    controller.profiles,
    controller.tagNameById,
    searchTerm,
    selectedTagIds,
  ])

  const isInitialLoading =
    controller.isLoading && controller.profiles.length === 0

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (searchTerm.trim()) count += 1
    if (apiTypeFilter.trim()) count += 1
    if (selectedTagIds.length > 0) count += 1
    return count
  }, [apiTypeFilter, searchTerm, selectedTagIds.length])

  const analyticsMode = useMemo(() => {
    if (activeFilterCount === 0) return null
    if (lastFilterMode) return lastFilterMode
    if (searchTerm.trim()) return PRODUCT_ANALYTICS_MODE_IDS.SearchFilter
    if (apiTypeFilter.trim()) return PRODUCT_ANALYTICS_MODE_IDS.ProviderFilter
    if (selectedTagIds.length > 0) return PRODUCT_ANALYTICS_MODE_IDS.GroupFilter
    return null
  }, [
    activeFilterCount,
    apiTypeFilter,
    lastFilterMode,
    searchTerm,
    selectedTagIds.length,
  ])

  useEffect(() => {
    if (!analyticsMode || activeFilterCount === 0) return

    const timeoutId = window.setTimeout(() => {
      void trackProductAnalyticsActionCompleted({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterApiCredentialProfiles,
        surfaceId:
          variant === "popup"
            ? PRODUCT_ANALYTICS_SURFACE_IDS.PopupViewTabs
            : PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesPage,
        entrypoint:
          variant === "popup"
            ? PRODUCT_ANALYTICS_ENTRYPOINTS.Popup
            : PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
        insights: {
          mode: analyticsMode,
          ...(apiTypeFilter.trim()
            ? {
                apiType:
                  analyticsApiTypeByVerificationApiType[
                    apiTypeFilter.trim() as ApiVerificationApiType
                  ],
              }
            : {}),
          itemCount: filteredProfiles.length,
          selectedCount: activeFilterCount,
          usageDataPresent: filteredProfiles.length > 0,
        },
      })
    }, 400)

    return () => window.clearTimeout(timeoutId)
  }, [
    activeFilterCount,
    analyticsMode,
    apiTypeFilter,
    filteredProfiles.length,
    variant,
  ])

  const emptyStateAddAnalyticsAction =
    variant === "popup"
      ? {
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
          actionId:
            PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateApiCredentialProfileDialog,
          surfaceId:
            PRODUCT_ANALYTICS_SURFACE_IDS.PopupApiCredentialProfilesEmptyState,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Popup,
        }
      : {
          featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
          actionId:
            PRODUCT_ANALYTICS_ACTION_IDS.OpenCreateApiCredentialProfileDialog,
          surfaceId:
            PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesEmptyState,
          entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
        }

  return (
    <div className={cn("space-y-4", className)}>
      <ApiCredentialProfilesDialogs controller={controller} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Input
            autoFocus={autoFocusSearch}
            size={searchInputSize}
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder={t("apiCredentialProfiles:controls.searchPlaceholder")}
            leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
            onClear={clearSearch}
            clearButtonLabel={t("common:actions.clear")}
          />
        </div>

        <SearchableSelect
          options={[
            {
              value: "",
              label: t("apiCredentialProfiles:controls.apiTypeAll"),
            },
            {
              value: API_TYPES.OPENAI_COMPATIBLE,
              label: t(
                "aiApiVerification:verifyDialog.apiTypes.openaiCompatible",
              ),
            },
            {
              value: API_TYPES.OPENAI,
              label: t("aiApiVerification:verifyDialog.apiTypes.openai"),
            },
            {
              value: API_TYPES.ANTHROPIC,
              label: t("aiApiVerification:verifyDialog.apiTypes.anthropic"),
            },
            {
              value: API_TYPES.GOOGLE,
              label: t("aiApiVerification:verifyDialog.apiTypes.google"),
            },
          ]}
          value={apiTypeFilter}
          onChange={handleApiTypeFilterChange}
          placeholder={t("apiCredentialProfiles:controls.apiTypePlaceholder")}
          className={cn(variant === "popup" && "h-8 px-2 text-xs")}
        />
      </div>

      <TagFilter
        options={tagFilterOptions}
        value={selectedTagIds}
        onChange={handleTagFilterChange}
        maxVisibleLines={maxTagFilterLines}
        allLabel={t("apiCredentialProfiles:filter.tagsAllLabel")}
        allCount={controller.profiles.length}
      />

      {controller.isLoading && !isInitialLoading ? (
        <div className="flex items-center gap-2 py-1">
          <Spinner size="sm" />
          <div className="dark:text-dark-text-secondary text-sm text-gray-600">
            {t("common:status.refreshing")}
          </div>
        </div>
      ) : null}

      {isInitialLoading ? (
        <div className="flex items-center gap-2 py-6">
          <Spinner size="sm" />
          <div className="dark:text-dark-text-secondary text-sm text-gray-600">
            {t("common:status.loading")}
          </div>
        </div>
      ) : filteredProfiles.length === 0 ? (
        <EmptyState
          icon={<KeyRound className="h-8 w-8" />}
          title={
            controller.profiles.length === 0
              ? t("apiCredentialProfiles:empty.title")
              : t("apiCredentialProfiles:empty.filteredTitle")
          }
          description={
            controller.profiles.length === 0
              ? t("apiCredentialProfiles:empty.description")
              : t("apiCredentialProfiles:empty.filteredDescription")
          }
          action={
            controller.profiles.length === 0
              ? {
                  label: t("apiCredentialProfiles:actions.add"),
                  onClick: controller.openAddDialog,
                  analyticsAction: emptyStateAddAnalyticsAction,
                }
              : undefined
          }
        />
      ) : (
        <ApiCredentialProfilesList
          profiles={filteredProfiles}
          controller={controller}
        />
      )}
    </div>
  )
}
