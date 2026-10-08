import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import {
  MODEL_LIST_BILLING_MODES,
  type ModelListBillingMode,
} from "~/features/ModelList/billingModes"
import { formatGroupLabelFromRatios } from "~/features/ModelList/groupLabels"
import {
  MODEL_CAPABILITY_FILTER_LABEL_TRANSLATORS,
  MODEL_CAPABILITY_FILTER_VALUES,
  type ModelCapabilitySelectionValue,
} from "~/features/ModelList/modelCapabilityFilters"
import {
  ALL_ACCOUNTS_SOURCE_VALUE,
  MODEL_MANAGEMENT_SOURCE_KINDS,
} from "~/features/ModelList/modelManagementSources"
import {
  MODEL_LIST_SORT_MODES,
  type ModelListSortMode,
} from "~/features/ModelList/sortModes"
import {
  DEFAULT_MODEL_LIST_VERIFICATION_RESULT_FILTERS,
  type ModelListVerificationResultFilter,
} from "~/features/ModelList/verificationResultFilters"
import toast from "~/lib/notify"
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

import {
  canEnableModelPriceComparison,
  enableModelPriceComparison,
} from "../priceComparisonActivation"
import type { ControlPanelProps } from "./ControlPanel.types"

type ModelFilterInputs = Pick<
  ControlPanelProps,
  | "selectedSource"
  | "sourceCapabilities"
  | "selectedSourceValue"
  | "setSelectedSourceValue"
  | "searchTerm"
  | "setSearchTerm"
  | "sortMode"
  | "setSortMode"
  | "selectedVerificationResults"
  | "setSelectedVerificationResults"
  | "selectedBillingMode"
  | "setSelectedBillingMode"
  | "supportsModelCapabilityFilter"
  | "modelCapabilityMetadataCoverage"
  | "selectedModelCapabilities"
  | "setSelectedModelCapabilities"
  | "selectedGroups"
  | "setSelectedGroups"
  | "availableGroups"
  | "singleSourceGroupRatios"
  | "showRealPrice"
  | "setShowRealPrice"
  | "filteredModels"
  | "getFilteredResultCount"
>

/**
 * Projects filter options and coordinates pending-state counts and filter actions.
 */
export function useModelListFilterViewModel({
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
  singleSourceGroupRatios,
  showRealPrice,
  setShowRealPrice,
  filteredModels,
  getFilteredResultCount,
}: ModelFilterInputs) {
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
  const shouldShowPriceComparisonPrompt = canEnableModelPriceComparison({
    selectedSource,
    sourceCapabilities,
    isAllAccountsSource,
    sortMode,
    selectedBillingMode,
    selectedGroups,
    showRealPrice,
  })
  const shouldShowModelCapabilityCoverageHint =
    supportsModelCapabilityFilter &&
    !!modelCapabilityMetadataCoverage &&
    modelCapabilityMetadataCoverage.total > 0 &&
    modelCapabilityMetadataCoverage.unmatched > 0
  const unmatchedCapabilityMetadataCount =
    modelCapabilityMetadataCoverage?.unmatched ?? 0
  const modelCapabilityHint = [
    t("modelCapabilityFilter.selectionHint"),
    shouldShowModelCapabilityCoverageHint
      ? t("modelCapabilityFilter.coverageHint", {
          count: unmatchedCapabilityMetadataCount,
          matched: modelCapabilityMetadataCoverage?.matched ?? 0,
          total: modelCapabilityMetadataCoverage?.total ?? 0,
          unmatched: unmatchedCapabilityMetadataCount,
        })
      : null,
  ]
    .filter(Boolean)
    .join(" ")
  const groupOptions = availableGroups.map((group) => ({
    value: group,
    label: formatGroupLabelFromRatios(group, singleSourceGroupRatios),
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
    const buildCapabilityOption = (value: ModelCapabilitySelectionValue) => {
      const count = supportsModelCapabilityFilter
        ? resolveCapabilityCount(value)
        : undefined
      const isSelected = selectedCapabilitySet.has(value)

      return {
        value,
        label: MODEL_CAPABILITY_FILTER_LABEL_TRANSLATORS[value](t),
        count,
        disabled: !isSelected && count === 0,
      }
    }

    const capabilityOptions = [
      buildCapabilityOption(MODEL_CAPABILITY_FILTER_VALUES.IMAGE_INPUT),
      buildCapabilityOption(MODEL_CAPABILITY_FILTER_VALUES.IMAGE_OUTPUT),
      buildCapabilityOption(MODEL_CAPABILITY_FILTER_VALUES.AUDIO_INPUT),
      buildCapabilityOption(MODEL_CAPABILITY_FILTER_VALUES.AUDIO_OUTPUT),
      buildCapabilityOption(MODEL_CAPABILITY_FILTER_VALUES.VIDEO_INPUT),
      buildCapabilityOption(MODEL_CAPABILITY_FILTER_VALUES.VIDEO_OUTPUT),
      buildCapabilityOption(MODEL_CAPABILITY_FILTER_VALUES.PDF),
      buildCapabilityOption(MODEL_CAPABILITY_FILTER_VALUES.REASONING),
      buildCapabilityOption(MODEL_CAPABILITY_FILTER_VALUES.TOOL_CALL),
      buildCapabilityOption(MODEL_CAPABILITY_FILTER_VALUES.STRUCTURED_OUTPUT),
      buildCapabilityOption(MODEL_CAPABILITY_FILTER_VALUES.ATTACHMENT),
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
    enableModelPriceComparison({
      isAllAccountsSource,
      setSelectedSourceValue,
      setSortMode,
      setSelectedBillingMode,
      setSelectedGroups,
      setShowRealPrice,
      searchTerm,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListControlPanel,
    })
  }

  return {
    isProfileSource,
    isAllAccountsSource,
    supportsSortControls,
    shouldShowPriceComparisonPrompt,
    modelCapabilityHint,
    groupOptions,
    sortOptions,
    billingModeOptions,
    modelCapabilityOptions,
    verificationResultOptions,
    handleCopyModelNames,
    handleClearSearch,
    handleSortModeChange,
    handleBillingModeChange,
    handleModelCapabilityChange,
    handleGroupSelectionChange,
    handleVerificationResultSelectionChange,
    handleEnablePriceComparison,
  }
}
