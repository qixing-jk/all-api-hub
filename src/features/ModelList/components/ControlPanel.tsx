import {
  AdjustmentsHorizontalIcon,
  BeakerIcon,
  CpuChipIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline"
import { Copy, TrendingDown } from "lucide-react"
import { useMemo } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import {
  Alert,
  Button,
  Card,
  CardContent,
  CompactMultiSelect,
  FormField,
  Input,
  Label,
  SearchableSelect,
  Switch,
} from "~/components/ui"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import {
  MODEL_LIST_BILLING_MODES,
  type ModelListBillingMode,
} from "~/features/ModelList/billingModes"
import {
  formatGroupLabel,
  resolveGroupRatio,
} from "~/features/ModelList/groupLabels"
import {
  MODEL_CAPABILITY_FILTER_VALUES,
  type ModelCapabilityMetadataCoverage,
  type ModelCapabilitySelectionValue,
} from "~/features/ModelList/modelCapabilityFilters"
import {
  ALL_ACCOUNTS_SOURCE_VALUE,
  MODEL_MANAGEMENT_SOURCE_KINDS,
  type ModelManagementSource,
  type ModelManagementSourceCapabilities,
} from "~/features/ModelList/modelManagementSources"
import {
  MODEL_LIST_SORT_MODES,
  type ModelListSortMode,
} from "~/features/ModelList/sortModes"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import {
  DEFAULT_MODEL_LIST_VERIFICATION_RESULT_FILTERS,
  type ModelListVerificationResultFilter,
} from "~/features/ModelList/verificationResultFilters"
import { trackProductAnalyticsActionCompleted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_KINDS,
  type ProductAnalyticsModeId,
} from "~/services/productAnalytics/contracts"

interface ControlPanelProps {
  selectedSource: ModelManagementSource | null
  sourceCapabilities: ModelManagementSourceCapabilities
  selectedSourceValue?: string
  setSelectedSourceValue?: (sourceValue: string) => void
  searchTerm: string
  setSearchTerm: (term: string) => void
  sortMode: ModelListSortMode
  setSortMode: (mode: ModelListSortMode) => void
  selectedVerificationResults?: ModelListVerificationResultFilter[]
  setSelectedVerificationResults?: (
    results: ModelListVerificationResultFilter[],
  ) => void
  selectedBillingMode: ModelListBillingMode
  setSelectedBillingMode: (mode: ModelListBillingMode) => void
  supportsModelCapabilityFilter?: boolean
  modelCapabilityMetadataCoverage?: ModelCapabilityMetadataCoverage
  selectedModelCapabilities?: ModelCapabilitySelectionValue[]
  setSelectedModelCapabilities?: (
    capabilities: ModelCapabilitySelectionValue[],
  ) => void
  selectedGroups: string[]
  setSelectedGroups: (groups: string[]) => void
  availableGroups: string[]
  pricingData: any
  showRealPrice: boolean
  setShowRealPrice: (show: boolean) => void
  showRatioColumn: boolean
  setShowRatioColumn: (show: boolean) => void
  showEndpointTypes: boolean
  setShowEndpointTypes: (show: boolean) => void
  totalModels: number
  filteredModels: any[]
  getFilteredResultCount?: (filters: {
    searchTerm?: string
    sortMode?: ModelListSortMode
    selectedBillingMode?: ModelListBillingMode
    selectedModelCapabilities?: ModelCapabilitySelectionValue[]
    selectedGroups?: string[]
    selectedVerificationResults?: ModelListVerificationResultFilter[]
  }) => number
  onBatchVerifyModels?: () => void
}

/**
 * Top control strip for searching, filtering, and display options.
 * @param props Component props bundle.
 * @param props.selectedSource Active model-management source.
 * @param props.sourceCapabilities Capability flags for the active source.
 * @param props.selectedSourceValue Active model-management source value.
 * @param props.setSelectedSourceValue Setter for source selection value.
 * @param props.searchTerm Current search keyword.
 * @param props.setSearchTerm Setter to update search keyword.
 * @param props.sortMode Active sort mode.
 * @param props.setSortMode Setter for sort mode.
 * @param props.selectedVerificationResults Active verification-result filters.
 * @param props.setSelectedVerificationResults Setter for verification-result filters.
 * @param props.selectedBillingMode Active billing-mode filter value.
 * @param props.setSelectedBillingMode Setter for billing-mode filter.
 * @param props.supportsModelCapabilityFilter Whether metadata-backed capability filters are available.
 * @param props.modelCapabilityMetadataCoverage Metadata match coverage for models before capability filters.
 * @param props.selectedModelCapabilities Active model capability filter values.
 * @param props.setSelectedModelCapabilities Setter for model capability filters.
 * @param props.selectedGroups Active candidate group filter set.
 * @param props.setSelectedGroups Setter for candidate group filter set.
 * @param props.availableGroups Available group options.
 * @param props.pricingData Pricing data used to show ratios.
 * @param props.showRealPrice Whether to display real price values.
 * @param props.setShowRealPrice Setter for real price toggle.
 * @param props.showRatioColumn Whether to show ratio column.
 * @param props.setShowRatioColumn Setter for ratio column toggle.
 * @param props.showEndpointTypes Whether to show endpoint types.
 * @param props.setShowEndpointTypes Setter for endpoint type toggle.
 * @param props.totalModels Total models available.
 * @param props.filteredModels Currently filtered model list.
 * @param props.getFilteredResultCount Optional estimator for pending filter state.
 * @param props.onBatchVerifyModels Optional handler for batch API verification.
 * @returns Card with filters, toggles, and actions.
 */
export function ControlPanel({
  selectedSource,
  sourceCapabilities,
  selectedSourceValue = selectedSource?.value ?? "",
  setSelectedSourceValue,
  searchTerm,
  setSearchTerm,
  sortMode,
  setSortMode,
  selectedVerificationResults = DEFAULT_MODEL_LIST_VERIFICATION_RESULT_FILTERS,
  setSelectedVerificationResults = () => {},
  selectedBillingMode,
  setSelectedBillingMode,
  supportsModelCapabilityFilter = false,
  modelCapabilityMetadataCoverage,
  selectedModelCapabilities = [],
  setSelectedModelCapabilities = () => {},
  selectedGroups,
  setSelectedGroups,
  availableGroups,
  pricingData,
  showRealPrice,
  setShowRealPrice,
  showRatioColumn,
  setShowRatioColumn,
  showEndpointTypes,
  setShowEndpointTypes,
  totalModels,
  filteredModels,
  getFilteredResultCount,
  onBatchVerifyModels,
}: ControlPanelProps) {
  const { t } = useTranslation(["modelList", "ui"])
  const isProfileSource =
    selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
  const isAllAccountsSource =
    selectedSourceValue === ALL_ACCOUNTS_SOURCE_VALUE ||
    selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
  const supportsLatencySorting =
    sourceCapabilities.supportsCredentialVerification ||
    sourceCapabilities.supportsBatchCredentialVerification
  const supportsSortControls =
    sourceCapabilities.supportsPricing || supportsLatencySorting
  const isPriceComparisonActive =
    isAllAccountsSource &&
    sortMode === MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST &&
    selectedBillingMode === MODEL_LIST_BILLING_MODES.ALL &&
    selectedGroups.length === 0 &&
    showRealPrice
  const shouldShowPriceComparisonPrompt =
    sourceCapabilities.supportsPricing &&
    !isProfileSource &&
    !isPriceComparisonActive
  const shouldShowModelCapabilityCoverageHint =
    supportsModelCapabilityFilter &&
    !!modelCapabilityMetadataCoverage &&
    modelCapabilityMetadataCoverage.total > 0 &&
    modelCapabilityMetadataCoverage.unmatched > 0
  const groupOptions = availableGroups.map((group) => ({
    value: group,
    label: formatGroupLabel(
      group,
      resolveGroupRatio(group, pricingData?.group_ratio ?? {}),
    ),
  }))
  const sortOptions = [
    {
      value: MODEL_LIST_SORT_MODES.DEFAULT,
      label: t("sortOptions.default"),
    },
    ...(sourceCapabilities.supportsPricing
      ? [
          {
            value: MODEL_LIST_SORT_MODES.PRICE_ASC,
            label: t("sortOptions.priceAsc"),
          },
          {
            value: MODEL_LIST_SORT_MODES.PRICE_DESC,
            label: t("sortOptions.priceDesc"),
          },
        ]
      : []),
    ...(supportsLatencySorting
      ? [
          {
            value: MODEL_LIST_SORT_MODES.VERIFICATION_LATENCY_ASC,
            label: t("sortOptions.verificationLatencyAsc"),
          },
        ]
      : []),
    ...(selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
      ? [
          {
            value: MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST,
            label: t("sortOptions.modelCheapestFirst"),
          },
        ]
      : []),
  ]
  const billingModeOptions = [
    {
      value: MODEL_LIST_BILLING_MODES.ALL,
      label: t("allBillingModes"),
    },
    {
      value: MODEL_LIST_BILLING_MODES.TOKEN_BASED,
      label: t("ui:billing.tokenBased"),
    },
    {
      value: MODEL_LIST_BILLING_MODES.PER_CALL,
      label: t("ui:billing.perCall"),
    },
  ]
  const modelCapabilityOptions = useMemo(() => {
    const selectedCapabilitySet = new Set(selectedModelCapabilities)
    const resolveCapabilityCount = (
      capability: ModelCapabilitySelectionValue,
    ) => {
      if (!getFilteredResultCount) {
        return undefined
      }

      const selectedModelCapabilitiesForCount = selectedCapabilitySet.has(
        capability,
      )
        ? selectedModelCapabilities
        : [...selectedModelCapabilities, capability]

      return getFilteredResultCount({
        searchTerm,
        sortMode,
        selectedBillingMode,
        selectedModelCapabilities: selectedModelCapabilitiesForCount,
        selectedGroups,
        selectedVerificationResults,
      })
    }
    const buildCapabilityOption = (
      value: ModelCapabilitySelectionValue,
      label: string,
    ) => {
      const count = supportsModelCapabilityFilter
        ? resolveCapabilityCount(value)
        : undefined
      const isSelected = selectedCapabilitySet.has(value)

      return {
        value,
        label,
        count,
        disabled: !isSelected && count === 0,
      }
    }

    const capabilityOptions = [
      buildCapabilityOption(
        MODEL_CAPABILITY_FILTER_VALUES.IMAGE_INPUT,
        t("modelCapabilityFilter.options.imageInput"),
      ),
      buildCapabilityOption(
        MODEL_CAPABILITY_FILTER_VALUES.IMAGE_OUTPUT,
        t("modelCapabilityFilter.options.imageOutput"),
      ),
      buildCapabilityOption(
        MODEL_CAPABILITY_FILTER_VALUES.AUDIO_INPUT,
        t("modelCapabilityFilter.options.audioInput"),
      ),
      buildCapabilityOption(
        MODEL_CAPABILITY_FILTER_VALUES.AUDIO_OUTPUT,
        t("modelCapabilityFilter.options.audioOutput"),
      ),
      buildCapabilityOption(
        MODEL_CAPABILITY_FILTER_VALUES.VIDEO_INPUT,
        t("modelCapabilityFilter.options.videoInput"),
      ),
      buildCapabilityOption(
        MODEL_CAPABILITY_FILTER_VALUES.VIDEO_OUTPUT,
        t("modelCapabilityFilter.options.videoOutput"),
      ),
      buildCapabilityOption(
        MODEL_CAPABILITY_FILTER_VALUES.PDF,
        t("modelCapabilityFilter.options.pdf"),
      ),
      buildCapabilityOption(
        MODEL_CAPABILITY_FILTER_VALUES.REASONING,
        t("modelCapabilityFilter.options.reasoning"),
      ),
      buildCapabilityOption(
        MODEL_CAPABILITY_FILTER_VALUES.TOOL_CALL,
        t("modelCapabilityFilter.options.toolCall"),
      ),
      buildCapabilityOption(
        MODEL_CAPABILITY_FILTER_VALUES.STRUCTURED_OUTPUT,
        t("modelCapabilityFilter.options.structuredOutput"),
      ),
      buildCapabilityOption(
        MODEL_CAPABILITY_FILTER_VALUES.ATTACHMENT,
        t("modelCapabilityFilter.options.attachment"),
      ),
    ]

    return [
      ...capabilityOptions.filter((option) => !option.disabled),
      ...capabilityOptions.filter((option) => option.disabled),
    ]
  }, [
    getFilteredResultCount,
    searchTerm,
    selectedBillingMode,
    selectedGroups,
    selectedModelCapabilities,
    selectedVerificationResults,
    sortMode,
    supportsModelCapabilityFilter,
    t,
  ])
  const verificationResultOptions = [
    {
      value: "pass",
      label: t("verificationResults.filters.pass"),
    },
    {
      value: "fail",
      label: t("verificationResults.filters.fail"),
    },
    {
      value: "unverified",
      label: t("verificationResults.filters.unverified"),
    },
  ]

  const handleCopyModelNames = () => {
    if (filteredModels.length === 0) {
      toast.error(t("noMatchingModels"))
      return
    }
    const modelNames = filteredModels
      .map((item) => item.model.model_name)
      .join(",")
    navigator.clipboard.writeText(modelNames)
    toast.success(t("messages.modelNamesCopied"))
  }
  const trackFilterChange = (
    mode: ProductAnalyticsModeId,
    nextFilters: Partial<{
      searchTerm: string
      sortMode: ModelListSortMode
      selectedBillingMode: ModelListBillingMode
      selectedModelCapabilities: ModelCapabilitySelectionValue[]
      selectedGroups: string[]
      selectedVerificationResults: ModelListVerificationResultFilter[]
    }> = {},
  ) => {
    const nextSearchTerm = nextFilters.searchTerm ?? searchTerm
    const nextSortMode = nextFilters.sortMode ?? sortMode
    const nextSelectedBillingMode =
      nextFilters.selectedBillingMode ?? selectedBillingMode
    const nextSelectedModelCapabilities = supportsModelCapabilityFilter
      ? nextFilters.selectedModelCapabilities ?? selectedModelCapabilities
      : []
    const nextSelectedGroups = nextFilters.selectedGroups ?? selectedGroups
    const nextSelectedVerificationResults =
      nextFilters.selectedVerificationResults ?? selectedVerificationResults
    const filterCount =
      (nextSearchTerm.trim() ? 1 : 0) +
      (nextSortMode !== MODEL_LIST_SORT_MODES.DEFAULT ? 1 : 0) +
      (nextSelectedBillingMode !== MODEL_LIST_BILLING_MODES.ALL ? 1 : 0) +
      nextSelectedModelCapabilities.length +
      nextSelectedGroups.length +
      (nextSelectedVerificationResults.length ===
      verificationResultOptions.length
        ? 0
        : 1)
    const resultCount =
      getFilteredResultCount?.({
        searchTerm: nextSearchTerm,
        sortMode: nextSortMode,
        selectedBillingMode: nextSelectedBillingMode,
        selectedModelCapabilities: nextSelectedModelCapabilities,
        selectedGroups: nextSelectedGroups,
        selectedVerificationResults: nextSelectedVerificationResults,
      }) ?? filteredModels.length

    void trackProductAnalyticsActionCompleted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterModelList,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListControlPanel,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ModelFilter,
        mode,
        filterCount,
        resultCount,
      },
    })
  }
  const handleClearSearch = () => {
    setSearchTerm("")
    trackFilterChange(PRODUCT_ANALYTICS_MODE_IDS.SearchFilter, {
      searchTerm: "",
    })
  }
  const handleSortModeChange = (value: string) => {
    const nextSortMode = value as ModelListSortMode
    setSortMode(nextSortMode)
    trackFilterChange(PRODUCT_ANALYTICS_MODE_IDS.SortFilter, {
      sortMode: nextSortMode,
    })
  }
  const handleBillingModeChange = (value: string) => {
    const nextBillingMode = value as ModelListBillingMode
    setSelectedBillingMode(nextBillingMode)
    trackFilterChange(PRODUCT_ANALYTICS_MODE_IDS.BillingFilter, {
      selectedBillingMode: nextBillingMode,
    })
  }
  const handleModelCapabilityChange = (values: string[]) => {
    const nextCapabilities = values as ModelCapabilitySelectionValue[]
    setSelectedModelCapabilities(nextCapabilities)
    trackFilterChange(PRODUCT_ANALYTICS_MODE_IDS.ModelCapabilityFilter, {
      selectedModelCapabilities: nextCapabilities,
    })
  }
  const handleGroupSelectionChange = (groups: string[]) => {
    setSelectedGroups(groups)
    trackFilterChange(PRODUCT_ANALYTICS_MODE_IDS.GroupFilter, {
      selectedGroups: groups,
    })
  }
  const handleVerificationResultSelectionChange = (results: string[]) => {
    const nextResults = results as ModelListVerificationResultFilter[]
    setSelectedVerificationResults(nextResults)
    trackFilterChange(PRODUCT_ANALYTICS_MODE_IDS.StatusFilter, {
      selectedVerificationResults: nextResults,
    })
  }
  const handleEnablePriceComparison = () => {
    if (!isAllAccountsSource && setSelectedSourceValue) {
      setSelectedSourceValue(ALL_ACCOUNTS_SOURCE_VALUE)
    }
    setSortMode(MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST)
    setSelectedBillingMode(MODEL_LIST_BILLING_MODES.ALL)
    setSelectedGroups([])
    setShowRealPrice(true)
    const filterCount = 1 + (searchTerm.trim() ? 1 : 0)

    void trackProductAnalyticsActionCompleted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.EnableModelPriceComparison,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListControlPanel,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        targetKind: PRODUCT_ANALYTICS_TARGET_KINDS.ModelFilter,
        mode: PRODUCT_ANALYTICS_MODE_IDS.All,
        filterCount,
      },
    })
  }

  return (
    <Card className="mb-6" data-testid={MODEL_LIST_TEST_IDS.controlPanel}>
      <CardContent>
        {isProfileSource && (
          <Alert
            variant="info"
            className="mb-4"
            title={t("profileSourceNotice.title")}
            description={t("profileSourceNotice.description")}
          />
        )}

        <div
          className="mb-4 flex flex-col gap-4 lg:flex-row lg:flex-wrap"
          data-testid="model-list-filter-row"
        >
          <FormField
            label={t("searchModels")}
            className="min-w-[16rem] flex-1 lg:basis-[18rem]"
          >
            <Input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              leftIcon={<MagnifyingGlassIcon className="h-4 w-4" />}
              onClear={handleClearSearch}
              clearButtonLabel={t("common:actions.clear")}
            />
          </FormField>

          {supportsSortControls && (
            <FormField label={t("sortBy")} className="w-full lg:w-72">
              <SearchableSelect
                options={sortOptions}
                value={sortMode}
                onChange={handleSortModeChange}
                placeholder={t("sortBy")}
              />
            </FormField>
          )}

          {sourceCapabilities.supportsPricing && (
            <FormField label={t("billingMode")} className="w-full lg:w-64">
              <SearchableSelect
                options={billingModeOptions}
                value={selectedBillingMode}
                onChange={handleBillingModeChange}
                placeholder={t("allBillingModes")}
              />
            </FormField>
          )}

          {sourceCapabilities.supportsGroupFiltering &&
            !isAllAccountsSource && (
              <FormField label={t("userGroup")} className="w-full lg:w-64">
                <CompactMultiSelect
                  options={groupOptions}
                  selected={selectedGroups}
                  onChange={handleGroupSelectionChange}
                  size="default"
                  displayMode="summary"
                  placeholder={t("allGroups")}
                  emptyMessage={t("allGroups")}
                />
                <p className="dark:text-dark-text-tertiary mt-1 text-xs text-gray-500">
                  {t("groupSelectionHint")}
                </p>
              </FormField>
            )}

          {supportsModelCapabilityFilter && (
            <FormField
              label={t("modelCapabilityFilter.label")}
              className="w-full lg:w-64"
            >
              <CompactMultiSelect
                options={modelCapabilityOptions}
                selected={selectedModelCapabilities}
                onChange={handleModelCapabilityChange}
                size="default"
                displayMode="summary"
                placeholder={t("modelCapabilityFilter.options.all")}
                emptyMessage={t("modelCapabilityFilter.options.all")}
              />
              <p className="dark:text-dark-text-tertiary mt-1 text-xs text-gray-500">
                {t("modelCapabilityFilter.selectionHint")}
                {shouldShowModelCapabilityCoverageHint && (
                  <>
                    {" "}
                    {t("modelCapabilityFilter.coverageHint", {
                      matched: modelCapabilityMetadataCoverage.matched,
                      total: modelCapabilityMetadataCoverage.total,
                      unmatched: modelCapabilityMetadataCoverage.unmatched,
                    })}
                  </>
                )}
              </p>
            </FormField>
          )}

          <FormField
            label={t("verificationResults.label")}
            className="w-full lg:w-64"
          >
            <CompactMultiSelect
              options={verificationResultOptions}
              selected={selectedVerificationResults}
              onChange={handleVerificationResultSelectionChange}
              size="default"
              displayMode="summary"
              placeholder={t("verificationResults.all")}
              emptyMessage={t("verificationResults.none")}
            />
          </FormField>
        </div>

        <ProductAnalyticsScope
          entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
          featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ModelList}
          surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListControlPanel}
        >
          <div className="dark:border-dark-bg-tertiary flex flex-col gap-4 border-t border-gray-100 pt-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center space-x-2">
                <AdjustmentsHorizontalIcon className="dark:text-dark-text-tertiary h-4 w-4 text-gray-400" />
                <span className="dark:text-dark-text-secondary font-medium text-gray-700">
                  {t("displayOptions")}
                </span>
              </div>

              {sourceCapabilities.supportsPricing && (
                <label className="flex cursor-pointer items-center space-x-2">
                  <Switch
                    checked={showRealPrice}
                    onChange={setShowRealPrice}
                    size="sm"
                  />
                  <Label className="cursor-pointer">{t("realAmount")}</Label>
                </label>
              )}

              {sourceCapabilities.supportsRatioDisplay && (
                <label className="flex cursor-pointer items-center space-x-2">
                  <Switch
                    checked={showRatioColumn}
                    onChange={setShowRatioColumn}
                    size="sm"
                  />
                  <Label className="cursor-pointer">{t("showRatio")}</Label>
                </label>
              )}

              <label className="flex cursor-pointer items-center space-x-2">
                <Switch
                  checked={showEndpointTypes}
                  onChange={setShowEndpointTypes}
                  size="sm"
                />
                <Label className="cursor-pointer">{t("endpointTypes")}</Label>
              </label>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyModelNames}
                leftIcon={<Copy className="h-4 w-4" />}
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.CopyVisibleModelNames
                }
              >
                {t("copyAllNames")}
              </Button>

              {onBatchVerifyModels ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onBatchVerifyModels}
                  disabled={filteredModels.length === 0}
                  leftIcon={<BeakerIcon className="h-4 w-4" />}
                  analyticsAction={
                    PRODUCT_ANALYTICS_ACTION_IDS.OpenBatchModelVerifyDialog
                  }
                >
                  {t("batchVerify.actions.open")}
                </Button>
              ) : null}

              {shouldShowPriceComparisonPrompt && (
                <Tooltip
                  content={t("comparison.tooltip")}
                  wrapperClassName="contents"
                >
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    title={t("comparison.tooltip")}
                    leftIcon={<TrendingDown className="h-4 w-4" />}
                    onClick={handleEnablePriceComparison}
                  >
                    {t("comparison.cta")}
                  </Button>
                </Tooltip>
              )}
            </div>

            <div className="flex items-center space-x-4 text-sm">
              <div className="dark:text-dark-text-secondary flex items-center space-x-2 text-gray-600">
                <CpuChipIcon className="h-4 w-4" />
                <span>{t("totalModels", { count: totalModels })}</span>
              </div>
              <div className="dark:bg-dark-bg-tertiary h-4 w-px bg-gray-300"></div>
              <div className="text-blue-600 dark:text-blue-400">
                <span>{t("showing", { count: filteredModels.length })}</span>
              </div>
            </div>
          </div>
        </ProductAnalyticsScope>
      </CardContent>
    </Card>
  )
}
