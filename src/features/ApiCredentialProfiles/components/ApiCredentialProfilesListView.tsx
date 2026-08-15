import { Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { ApiCredentialLibraryIcon } from "~/components/icons/productIcons"
import {
  EmptyState,
  Input,
  Notice,
  NoticeActionButton,
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
} from "~/services/productAnalytics/contracts"
import {
  API_TYPES,
  type ApiVerificationApiType,
} from "~/services/verification/aiApiVerification"
import { openKeysPage } from "~/utils/navigation"

import {
  API_CREDENTIAL_PROFILES_VIEW_VARIANTS,
  type ApiCredentialProfilesViewVariant,
} from "../contracts"
import type { ApiCredentialProfilesController } from "../hooks/useApiCredentialProfilesController"
import {
  buildApiCredentialProfileListModel,
  type ApiCredentialProfileFilterMode,
} from "../utils/apiCredentialProfileListModel"
import { ApiCredentialProfilesDialogs } from "./ApiCredentialProfilesDialogs"
import { ApiCredentialProfilesList } from "./ApiCredentialProfilesList"

export interface ApiCredentialProfilesListViewProps {
  controller: ApiCredentialProfilesController
  variant?: ApiCredentialProfilesViewVariant
  autoFocusSearch?: boolean
  guidedImportEntryRequest?: number
  className?: string
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
const FILTER_ANALYTICS_DEBOUNCE_MS = 400

/**
 * Search/filterable API credential profiles view used in Options and Popup variants.
 */
export function ApiCredentialProfilesListView({
  controller,
  variant = API_CREDENTIAL_PROFILES_VIEW_VARIANTS.Options,
  autoFocusSearch = false,
  guidedImportEntryRequest = 0,
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
  const [lastFilterMode, setLastFilterMode] =
    useState<ApiCredentialProfileFilterMode | null>(null)

  const searchInputSize =
    variant === API_CREDENTIAL_PROFILES_VIEW_VARIANTS.Popup ? "sm" : "default"

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

  const maxTagFilterLines = isSmallScreen ? 2 : isDesktop ? 3 : 2

  useEffect(() => {
    if (!guidedImportEntryRequest || controller.profiles.length === 0) {
      return
    }

    setSearchTerm("")
    setApiTypeFilter("")
    setSelectedTagIds([])
    setLastFilterMode(null)
  }, [controller.profiles.length, guidedImportEntryRequest])

  const {
    filteredProfiles,
    tagFilterOptions,
    activeFilterCount,
    analyticsMode,
  } = useMemo(
    () =>
      buildApiCredentialProfileListModel({
        profiles: controller.profiles,
        tags: controller.tags,
        tagNameById: controller.tagNameById,
        searchTerm,
        apiTypeFilter,
        selectedTagIds,
        lastFilterMode,
      }),
    [
      apiTypeFilter,
      controller.profiles,
      controller.tagNameById,
      controller.tags,
      lastFilterMode,
      searchTerm,
      selectedTagIds,
    ],
  )

  const isInitialLoading =
    controller.isLoading && controller.profiles.length === 0

  useEffect(() => {
    if (!analyticsMode || activeFilterCount === 0) return

    const timeoutId = window.setTimeout(() => {
      void trackProductAnalyticsActionCompleted({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ApiCredentialProfiles,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterApiCredentialProfiles,
        surfaceId:
          variant === API_CREDENTIAL_PROFILES_VIEW_VARIANTS.Popup
            ? PRODUCT_ANALYTICS_SURFACE_IDS.PopupViewTabs
            : PRODUCT_ANALYTICS_SURFACE_IDS.OptionsApiCredentialProfilesPage,
        entrypoint:
          variant === API_CREDENTIAL_PROFILES_VIEW_VARIANTS.Popup
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
    }, FILTER_ANALYTICS_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [
    activeFilterCount,
    analyticsMode,
    apiTypeFilter,
    filteredProfiles.length,
    variant,
  ])

  const emptyStateAddAnalyticsAction =
    variant === API_CREDENTIAL_PROFILES_VIEW_VARIANTS.Popup
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

  const handleOpenKeyManagement = useCallback(() => {
    void openKeysPage()
  }, [])

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
            leftIcon={<Search className="h-4 w-4" />}
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
          aria-label={t("apiCredentialProfiles:controls.apiTypePlaceholder")}
          className={cn(
            variant === API_CREDENTIAL_PROFILES_VIEW_VARIANTS.Popup &&
              "h-8 px-2 text-xs",
          )}
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
        <div className="mx-auto flex max-w-md flex-col gap-4">
          <EmptyState
            icon={<ApiCredentialLibraryIcon className="h-8 w-8" />}
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
          {controller.profiles.length === 0 ? (
            <Notice
              tone="info"
              icon={<ApiCredentialLibraryIcon className="h-3.5 w-3.5" />}
              className="text-left"
              description={
                <span>
                  {t("apiCredentialProfiles:empty.keyManagementImportHint")}{" "}
                  <NoticeActionButton onClick={handleOpenKeyManagement}>
                    {t("apiCredentialProfiles:empty.keyManagementLink")}
                  </NoticeActionButton>
                </span>
              }
            />
          ) : null}
        </div>
      ) : (
        <ApiCredentialProfilesList
          profiles={filteredProfiles}
          controller={controller}
          variant={variant}
          isFiltering={activeFilterCount > 0}
          guidedImportEntry={
            guidedImportEntryRequest && controller.profiles[0]
              ? {
                  profileId: controller.profiles[0].id,
                  request: guidedImportEntryRequest,
                }
              : undefined
          }
        />
      )}
    </div>
  )
}
