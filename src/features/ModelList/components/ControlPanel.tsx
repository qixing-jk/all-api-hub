import {
  CircleHelp,
  Copy,
  Cpu,
  FlaskConical,
  Search,
  TrendingDown,
} from "lucide-react"
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
import { MODEL_LIST_GROUP_SEMANTICS } from "~/features/ModelList/modelManagementSources"
import { isModelListPriceSortMode } from "~/features/ModelList/sortModes"
import { MODEL_LIST_TEST_IDS } from "~/features/ModelList/testIds"
import { DEFAULT_MODEL_LIST_VERIFICATION_RESULT_FILTERS } from "~/features/ModelList/verificationResultFilters"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

import {
  DEFAULT_MODEL_PRICE_COMPARISON_PRESET_ID,
  DEFAULT_MODEL_PRICE_COMPARISON_WEIGHTS,
} from "../priceComparison"
import type { ControlPanelProps } from "./ControlPanel.types"
import { PriceComparisonControls } from "./PriceComparisonControls"
import { PricingScenarioControls } from "./PricingScenarioControls"
import { useModelListFilterViewModel } from "./useModelListFilterViewModel"

/**
 * Top control strip for searching, filtering, and display options.
 * @param props Component props bundle.
 * @param props.showUnavailableModels Whether unavailable models are included.
 * @param props.setShowUnavailableModels Setter for unavailable model visibility.
 * @param props.selectedSource Active model-management source.
 * @param props.sourceCapabilities Capability flags for the active source.
 * @param props.selectedSourceValue Active model-management source value.
 * @param props.setSelectedSourceValue Setter for source selection value.
 * @param props.searchTerm Current search keyword.
 * @param props.setSearchTerm Setter to update search keyword.
 * @param props.sortMode Active sort mode.
 * @param props.setSortMode Setter for sort mode.
 * @param props.pricingScenarioSettings Shared workload conditions for price comparison.
 * @param props.setPricingScenarioSettings Commits shared comparison conditions.
 * @param props.priceComparisonPresetId Active workload preset for price sorting.
 * @param props.setPriceComparisonPresetId Setter for the workload preset.
 * @param props.priceComparisonWeights Editable token-bucket comparison weights.
 * @param props.setPriceComparisonWeights Setter for comparison weights.
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
 * @param props.singleSourceGroupRatios Normalized ratios used in group labels.
 * @param props.showRealPrice Whether to display real price values.
 * @param props.setShowRealPrice Setter for real price toggle.
 * @param props.showEndpointTypes Whether to show endpoint types.
 * @param props.setShowEndpointTypes Setter for endpoint type toggle.
 * @param props.totalModels Total models available.
 * @param props.filteredModels Currently filtered model list.
 * @param props.getFilteredResultCount Optional estimator for pending filter state.
 * @param props.onBatchVerifyModels Optional handler for batch API verification.
 * @returns Card with filters, toggles, and actions.
 */
export function ControlPanel({
  showUnavailableModels = false,
  setShowUnavailableModels,
  pricingScenarioSettings,
  setPricingScenarioSettings,
  selectedSource,
  sourceCapabilities,
  selectedSourceValue = selectedSource?.value ?? "",
  setSelectedSourceValue,
  searchTerm,
  setSearchTerm,
  sortMode,
  setSortMode,
  priceComparisonPresetId = DEFAULT_MODEL_PRICE_COMPARISON_PRESET_ID,
  setPriceComparisonPresetId = () => {},
  priceComparisonWeights = DEFAULT_MODEL_PRICE_COMPARISON_WEIGHTS,
  setPriceComparisonWeights = () => {},
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
  showEndpointTypes,
  setShowEndpointTypes,
  totalModels,
  filteredModels,
  getFilteredResultCount,
  onBatchVerifyModels,
}: ControlPanelProps) {
  const { t } = useTranslation(["modelList", "ui"])
  const {
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
  } = useModelListFilterViewModel({
    selectedSource,
    sourceCapabilities,
    selectedSourceValue,
    setSelectedSourceValue,
    searchTerm,
    setSearchTerm,
    sortMode,
    setSortMode,
    selectedVerificationResults,
    setSelectedVerificationResults,
    selectedBillingMode,
    setSelectedBillingMode,
    supportsModelCapabilityFilter,
    modelCapabilityMetadataCoverage,
    selectedModelCapabilities,
    setSelectedModelCapabilities,
    selectedGroups,
    setSelectedGroups,
    availableGroups,
    singleSourceGroupRatios,
    showRealPrice,
    setShowRealPrice,
    filteredModels,
    getFilteredResultCount,
  })

  return (
    <Card
      className="mb-density-3 rounded-none border-x-0 border-t-0 bg-transparent shadow-none"
      data-testid={MODEL_LIST_TEST_IDS.controlPanel}
    >
      <CardContent className="[container-type:inline-size] px-0 pt-0">
        {isProfileSource && (
          <Alert
            variant="default"
            className="mb-density-4"
            title={t("profileSourceNotice.title")}
            description={t("profileSourceNotice.description")}
          />
        )}

        <div className="space-y-density-4" data-testid="model-list-filter-row">
          <section
            aria-label={t("searchModels")}
            className="dark:border-border border-border-subtle pb-density-4 border-b"
          >
            <div className="gap-y-density-3 grid grid-cols-1 gap-x-3 [@container(min-width:32rem)]:grid-cols-[minmax(0,1fr)_minmax(12rem,0.55fr)] [@container(min-width:48rem)]:grid-cols-[minmax(0,1fr)_minmax(12rem,0.42fr)_auto] [@container(min-width:48rem)]:items-end">
              <FormField label={t("searchModels")}>
                <Input
                  type="text"
                  aria-label={t("searchModels")}
                  placeholder={t("searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  leftIcon={<Search className="h-4 w-4" />}
                  onClear={handleClearSearch}
                  clearButtonLabel={t("common:actions.clear")}
                />
              </FormField>

              {supportsSortControls && (
                <FormField label={t("sortBy")}>
                  <SearchableSelect
                    options={sortOptions}
                    value={sortMode}
                    onChange={handleSortModeChange}
                    placeholder={t("sortBy")}
                  />
                </FormField>
              )}

              <div className="gap-y-density-3 flex min-h-(--density-control) items-center gap-x-3 self-end text-xs [@container(min-width:32rem)]:col-span-2 [@container(min-width:32rem)]:justify-end [@container(min-width:48rem)]:col-span-1">
                <span className="dark:text-secondary-foreground text-muted-foreground gap-y-density-1-5 flex items-center gap-x-1.5">
                  <Cpu className="h-4 w-4" />
                  {t("totalModels", { count: totalModels })}
                </span>
                <span className="dark:bg-secondary bg-surface-strong h-3 w-px" />
                <span className="text-theme-600 dark:text-theme-400 font-medium">
                  {t("showing", { count: filteredModels.length })}
                </span>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="model-list-filters-heading"
            className="dark:border-border border-border-subtle pb-density-4 border-b"
          >
            <h3
              id="model-list-filters-heading"
              className="text-foreground mb-density-3 text-sm font-semibold"
            >
              {t("controlPanelSections.filters")}
            </h3>

            <div className="gap-y-density-4 grid grid-cols-1 gap-x-4 [@container(min-width:32rem)]:grid-cols-2 [@container(min-width:48rem)]:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
              {sourceCapabilities.supportsPricing && (
                <FormField label={t("billingMode")}>
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
                  <div className="space-y-density-2">
                    <div className="gap-y-density-1-5 flex items-center gap-x-1.5">
                      <Label>{t("userGroup")}</Label>
                      <Tooltip content={t("groupSelectionHint")} anchorAsChild>
                        <button
                          type="button"
                          aria-label={t("groupSelectionHint")}
                          className="dark:text-muted-foreground text-faint-foreground hover:text-muted-foreground focus-visible:ring-ring dark:hover:text-secondary-foreground inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
                        >
                          <CircleHelp className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </Tooltip>
                    </div>
                    <CompactMultiSelect
                      options={groupOptions}
                      selected={selectedGroups}
                      onChange={handleGroupSelectionChange}
                      size="default"
                      displayMode="summary"
                      placeholder={t("allGroups")}
                      emptyMessage={t("allGroups")}
                    />
                  </div>
                )}

              {supportsModelCapabilityFilter && (
                <div className="space-y-density-2">
                  <div className="gap-y-density-1-5 flex items-center gap-x-1.5">
                    <Label>{t("modelCapabilityFilter.label")}</Label>
                    <Tooltip content={modelCapabilityHint} anchorAsChild>
                      <button
                        type="button"
                        aria-label={modelCapabilityHint}
                        className="dark:text-muted-foreground text-faint-foreground hover:text-muted-foreground focus-visible:ring-ring dark:hover:text-secondary-foreground inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none"
                      >
                        <CircleHelp className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </Tooltip>
                  </div>
                  <CompactMultiSelect
                    options={modelCapabilityOptions}
                    selected={selectedModelCapabilities}
                    onChange={handleModelCapabilityChange}
                    size="default"
                    displayMode="summary"
                    placeholder={t("modelCapabilityFilter.options.all")}
                    emptyMessage={t("modelCapabilityFilter.options.all")}
                  />
                </div>
              )}

              <FormField label={t("verificationResults.label")}>
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

            {sourceCapabilities.supportsPricing &&
              isModelListPriceSortMode(sortMode) &&
              (pricingScenarioSettings && setPricingScenarioSettings ? (
                <PricingScenarioControls
                  plans={filteredModels.flatMap((item) =>
                    item.model?.pricingPlan ? [item.model.pricingPlan] : [],
                  )}
                  settings={pricingScenarioSettings}
                  onChange={setPricingScenarioSettings}
                >
                  {(conditions, summary) => (
                    <PriceComparisonControls
                      conditionFields={conditions}
                      conditionSummary={summary}
                      embedded
                      presetId={priceComparisonPresetId}
                      onPresetIdChange={setPriceComparisonPresetId}
                      weights={priceComparisonWeights}
                      onWeightsChange={setPriceComparisonWeights}
                    />
                  )}
                </PricingScenarioControls>
              ) : (
                <PriceComparisonControls
                  presetId={priceComparisonPresetId}
                  onPresetIdChange={setPriceComparisonPresetId}
                  weights={priceComparisonWeights}
                  onWeightsChange={setPriceComparisonWeights}
                />
              ))}
          </section>
        </div>

        <ProductAnalyticsScope
          entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
          featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ModelList}
          surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListControlPanel}
        >
          <div className="mt-density-4 gap-y-density-3 flex flex-wrap items-center justify-between gap-x-3">
            <fieldset className="max-w-full shrink-0">
              <legend className="sr-only">{t("displayOptions")}</legend>
              <div className="gap-y-density-2 flex flex-wrap items-center gap-x-4 text-sm">
                {setShowUnavailableModels &&
                  selectedSource?.groupSemantics ===
                    MODEL_LIST_GROUP_SEMANTICS.ACCOUNT_OR_RUNTIME_KEY && (
                    <Tooltip content={t("unavailableModelsHint")}>
                      <label className="flex cursor-pointer items-center space-x-2">
                        <Switch
                          checked={showUnavailableModels}
                          onChange={setShowUnavailableModels}
                          aria-label={t("showUnavailableModels")}
                          size="sm"
                        />
                        <Label className="cursor-pointer">
                          {t("showUnavailableModels")}
                        </Label>
                      </label>
                    </Tooltip>
                  )}
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

                <label className="flex cursor-pointer items-center space-x-2">
                  <Switch
                    checked={showEndpointTypes}
                    onChange={setShowEndpointTypes}
                    size="sm"
                  />
                  <Label className="cursor-pointer">{t("endpointTypes")}</Label>
                </label>
              </div>
            </fieldset>

            <fieldset className="ml-auto max-w-full shrink-0">
              <legend className="sr-only">
                {t("controlPanelSections.actions")}
              </legend>
              <div className="gap-y-density-2 flex flex-wrap items-center gap-x-2 [@container(min-width:50rem)]:justify-end">
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
                    data-testid={MODEL_LIST_TEST_IDS.batchVerifyButton}
                    leftIcon={<FlaskConical className="h-4 w-4" />}
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
            </fieldset>
          </div>
        </ProductAnalyticsScope>
      </CardContent>
    </Card>
  )
}
