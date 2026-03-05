import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { KeyRound } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
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
import { API_TYPES } from "~/services/verification/aiApiVerification"

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
 *
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

/**
 *
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

  const searchInputSize = variant === "popup" ? "sm" : "default"

  const clearSearch = useCallback(() => {
    setSearchTerm("")
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

  return (
    <div className={cn("space-y-4", className)}>
      <ApiCredentialProfilesDialogs controller={controller} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Input
            autoFocus={autoFocusSearch}
            size={searchInputSize}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={t("apiCredentialProfiles:controls.searchPlaceholder")}
            leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
            rightIcon={
              searchTerm && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                  aria-label={t("common:actions.clear")}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )
            }
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
          onChange={setApiTypeFilter}
          placeholder={t("apiCredentialProfiles:controls.apiTypePlaceholder")}
          className={cn(variant === "popup" && "h-8 px-2 text-xs")}
        />
      </div>

      <TagFilter
        options={tagFilterOptions}
        value={selectedTagIds}
        onChange={setSelectedTagIds}
        maxVisibleLines={maxTagFilterLines}
        allLabel={t("apiCredentialProfiles:filter.tagsAllLabel")}
        allCount={controller.profiles.length}
      />

      {controller.isLoading ? (
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
              ? t("empty.title")
              : t("apiCredentialProfiles:empty.filteredTitle")
          }
          description={
            controller.profiles.length === 0
              ? t("empty.description")
              : t("apiCredentialProfiles:empty.filteredDescription")
          }
          action={
            controller.profiles.length === 0
              ? {
                  label: t("apiCredentialProfiles:actions.add"),
                  onClick: controller.openAddDialog,
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
