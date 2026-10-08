import { Cpu, KeyRound, RefreshCw, TrendingDown } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { VerifyApiDialog } from "~/components/dialogs/VerifyApiDialog"
import { VerifyCliSupportDialog } from "~/components/dialogs/VerifyCliSupportDialog"
import { PageHeader } from "~/components/PageHeader"
import Tooltip from "~/components/Tooltip"
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  IconButton,
  TabsContent,
} from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { VerifyApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog"
import { PersonalizedCatalogFallbackNotice } from "~/features/ModelList/components/PersonalizedCatalogFallbackNotice"
import { useModelListVerificationResults } from "~/features/ModelList/hooks/useModelListVerificationResults"
import { useModelListVerificationWorkflow } from "~/features/ModelList/hooks/useModelListVerificationWorkflow"
import { MODEL_MANAGEMENT_SOURCE_KINDS } from "~/features/ModelList/modelManagementSources"
import { PricingScenarioNavigation } from "~/features/ModelList/pricingScenarioNavigation"
import { MODEL_VENDOR_FILTER_VALUES } from "~/services/models/modelVendor"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { openKeysPage, pushWithinOptionsPage } from "~/utils/navigation"

import { AccountSelector } from "./components/AccountSelector"
import { AccountSummaryBar } from "./components/AccountSummaryBar"
import { BatchVerifyModelsDialog } from "./components/BatchVerifyModelsDialog"
import { ControlPanel } from "./components/ControlPanel"
import { Footer } from "./components/Footer"
import { ModelDisplay } from "./components/ModelDisplay"
import ModelKeyDialog from "./components/ModelKeyDialog"
import { PricingDiagnostics } from "./components/PricingDiagnostics"
import { ProviderTabs } from "./components/ProviderTabs"
import { StatusIndicator } from "./components/StatusIndicator"
import { useModelListData } from "./hooks/useModelListData"
import { useModelListSourcePresentation } from "./hooks/useModelListSourcePresentation"
import { isModelListPriceSortMode, MODEL_LIST_SORT_MODES } from "./sortModes"
import { MODEL_LIST_TEST_IDS } from "./testIds"

/**
 * Model list page showing pricing details with filtering by account, provider, and group.
 * @param props Component props containing optional route params.
 * @param props.routeParams Optional route parameters provided by the router.
 * @returns Page layout with controls, tabs, and model display.
 */
export default function ModelList(props: {
  routeParams?: Record<string, string>
}) {
  const { routeParams } = props
  const { t } = useTranslation([
    "modelList",
    "account",
    "apiCredentialProfiles",
    "common",
  ])
  const [isSourceSelectorOpen, setIsSourceSelectorOpen] = useState(false)
  const sourceSelectorTriggerRef = useRef<HTMLButtonElement>(null)
  const modelListData = useModelListData(routeParams)
  const {
    profiles,
    isSourceLoading,
    selectedSource,
    currentAccount,
    sourceCapabilities,

    selectedSourceValue,
    searchTerm,
    setSearchTerm,
    setSelectedProvider,
    sortMode,
    setSortMode,
    pricingScenarioSettings,
    setPricingScenarioSettings,
    priceComparisonPresetId,
    setPriceComparisonPresetId,
    priceComparisonWeights,
    setPriceComparisonWeights,
    selectedBillingMode,
    setSelectedBillingMode,
    selectedModelCapabilities,
    setSelectedModelCapabilities,
    selectedGroups,
    setSelectedGroups,
    allAccountsExcludedGroupsByAccountId,
    setAllAccountsExcludedGroupsByAccountId,

    // Display options
    showUnavailableModels,
    setShowUnavailableModels,
    showRealPrice,
    setShowRealPrice,
    showEndpointTypes,
    setShowEndpointTypes,
    selectedVerificationResults,
    setSelectedVerificationResults,

    // Data state
    isLoading,
    dataFormatError,
    unsupportedSource,
    loadErrorMessage,
    accountFallback,
    personalizedCatalogFallback,
    isProviderCatalogFallbackActive,

    filteredModels,
    vendorCatalog,
    unclassifiedVendorCount,
    effectiveSelectedVendor,
    shouldRepairSelectedVendor,
    allVendorsFilteredCount,
    getFilteredModels,
    getFilteredResultCount,
    availableGroups,
    singleSourceGroupRatios,
    availableAccountGroupsByAccountId,
    availableAccountGroupOptionsByAccountId,
    supportsModelCapabilityFilter,
    modelCapabilityMetadataCoverage,

    // Operations
    loadPricingData,
    allAccountsFilterAccountIds,
  } = modelListData

  useEffect(() => {
    if (!shouldRepairSelectedVendor) return
    setSelectedProvider(MODEL_VENDOR_FILTER_VALUES.All)
  }, [setSelectedProvider, shouldRepairSelectedVendor])

  const {
    sortedAccounts,
    handleSelectedSourceValueChange,
    handleGroupClick,
    isAllAccountsScope,
    shouldShowPriceComparisonAction,
    handleEnablePriceComparison,
    modelDisplayGroupSelectionScope,
    isModelGroupSelectionInteractive,
    handleAccountSummaryClick,
    hasModelData,
    shouldShowRefreshAction,
    shouldShowHeaderActions,
    isRuntimeKeyOnlyFallbackCatalog,
    hasInferenceRouteFallback,
    showCatalogOnlyNotice,
    shouldShowSourceSetupEmptyState,
    shouldShowSourceSelectionEmptyState,
    providerCatalogFallbackAccounts,
    accountSummaryItems,
    totalModels,
  } = useModelListSourcePresentation(modelListData)

  const {
    displayedModels,
    getDisplayedResultCount,
    verificationSummariesByKey,
  } = useModelListVerificationResults({
    filteredModels,
    selectedVerificationResults,
    sortMode,
    getFilteredModels,
    getFilteredResultCount,
  })

  const {
    verifyContext,
    verifyCliContext,
    verifyProfileContext,
    modelKeyContext,
    batchVerifyContext,
    handleVerifyModel,
    handleVerifyCliSupport,
    handleOpenModelKeyDialog,
    handleManageVerifyModelKey,
    handleCloseModelKeyDialog,
    handleOpenBatchVerify,
    canBatchVerifyModels,
    handleCloseModelVerification,
    handleCloseCliVerification,
    handleCloseProfileVerification,
    handleCloseBatchVerification,
  } = useModelListVerificationWorkflow({
    displayedModels,
    selectedSource,
    sourceCapabilities,
  })

  const handleOpenAccountManagement = useCallback(() => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.ACCOUNT}`)
  }, [])

  const handleOpenApiCredentialProfiles = useCallback(() => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`)
  }, [])

  const handleOpenSelectedAccountKeys = useCallback((accountId: string) => {
    void openKeysPage(accountId)
  }, [])

  const handleRequestSourceSelection = useCallback(() => {
    const selectorTrigger = sourceSelectorTriggerRef.current

    if (selectorTrigger) {
      if (typeof selectorTrigger.scrollIntoView === "function") {
        selectorTrigger.scrollIntoView({
          block: "nearest",
        })
      }
    }

    setIsSourceSelectorOpen(true)
  }, [])

  const renderModelDisplay = () => (
    <ModelDisplay
      models={displayedModels}
      verificationSummariesByKey={verificationSummariesByKey}
      onVerifyModel={handleVerifyModel}
      onVerifyCliSupport={handleVerifyCliSupport}
      onOpenModelKeyDialog={handleOpenModelKeyDialog}
      onFilterAccount={
        selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
          ? handleAccountSummaryClick
          : undefined
      }
      showRealPrice={showRealPrice}
      showEndpointTypes={showEndpointTypes}
      showPriceComparisonGroups={
        isAllAccountsScope &&
        sortMode === MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST
      }
      handleGroupClick={handleGroupClick}
      groupSelectionScope={modelDisplayGroupSelectionScope}
      isGroupSelectionInteractive={isModelGroupSelectionInteractive}
      displayCapabilities={sourceCapabilities}
    />
  )

  const page = (
    <div
      className="py-density-4 sm:py-density-6 px-4 sm:px-6"
      data-testid={MODEL_LIST_TEST_IDS.page}
      data-model-source={selectedSourceValue}
      data-options-page-pending={
        isSourceLoading || (selectedSource && isLoading && !hasModelData)
          ? ""
          : undefined
      }
    >
      <PageHeader
        icon={Cpu}
        title={t("title")}
        titleActionsTestId={MODEL_LIST_TEST_IDS.titleActions}
        titleActions={
          selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT ? (
            <ProductAnalyticsScope
              entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
              featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ModelList}
              surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage}
            >
              <Tooltip content={t("actions.openSelectedAccountKeys")}>
                <IconButton
                  type="button"
                  onClick={() =>
                    handleOpenSelectedAccountKeys(selectedSource.account.id)
                  }
                  size="sm"
                  variant="outline"
                  aria-label={t("actions.openSelectedAccountKeys")}
                  data-testid={
                    MODEL_LIST_TEST_IDS.openSelectedAccountKeysButton
                  }
                  analyticsAction={
                    PRODUCT_ANALYTICS_ACTION_IDS.OpenAccountKeyManagementFromModel
                  }
                >
                  <KeyRound className="h-4 w-4" />
                </IconButton>
              </Tooltip>
            </ProductAnalyticsScope>
          ) : undefined
        }
        description={t("description")}
        actions={
          shouldShowHeaderActions ? (
            <ProductAnalyticsScope
              entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
              featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ModelList}
              surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage}
            >
              {shouldShowRefreshAction && (
                <Button
                  size="sm"
                  onClick={loadPricingData}
                  variant="secondary"
                  leftIcon={<RefreshCw className="h-4 w-4" />}
                  loading={isLoading}
                  analyticsAction={
                    PRODUCT_ANALYTICS_ACTION_IDS.RefreshModelPricingData
                  }
                >
                  {isLoading ? t("common:status.refreshing") : t("refreshData")}
                </Button>
              )}
              {shouldShowPriceComparisonAction && (
                <Tooltip
                  content={t("comparison.tooltip")}
                  wrapperClassName="contents"
                >
                  <Button
                    size="sm"
                    type="button"
                    variant="default"
                    data-testid={
                      MODEL_LIST_TEST_IDS.headerPriceComparisonButton
                    }
                    leftIcon={<TrendingDown className="h-4 w-4" />}
                    onClick={handleEnablePriceComparison}
                  >
                    {t("comparison.cta")}
                  </Button>
                </Tooltip>
              )}
            </ProductAnalyticsScope>
          ) : undefined
        }
      />
      <AccountSelector
        selectedSourceValue={selectedSourceValue}
        setSelectedSourceValue={handleSelectedSourceValueChange}
        accounts={sortedAccounts}
        profiles={profiles}
        showAllAccountsGroupFilter={isAllAccountsScope}
        availableAccountGroupsByAccountId={availableAccountGroupsByAccountId}
        availableAccountGroupOptionsByAccountId={
          availableAccountGroupOptionsByAccountId
        }
        allAccountsExcludedGroupsByAccountId={
          allAccountsExcludedGroupsByAccountId
        }
        setAllAccountsExcludedGroupsByAccountId={
          setAllAccountsExcludedGroupsByAccountId
        }
        selectorOpen={isSourceSelectorOpen}
        onSelectorOpenChange={setIsSourceSelectorOpen}
        selectorTriggerRef={sourceSelectorTriggerRef}
      />

      {shouldShowSourceSetupEmptyState ? (
        <EmptyState
          icon={<Cpu className="h-12 w-12" />}
          title={t("modelList:noSourcesTitle")}
          description={t("modelList:noSourcesDescription")}
          actions={[
            {
              label: t("account:addFirstAccount"),
              onClick: handleOpenAccountManagement,
              variant: "default",
              testId: MODEL_LIST_TEST_IDS.addFirstAccountButton,
            },
            {
              label: t("apiCredentialProfiles:actions.add"),
              onClick: handleOpenApiCredentialProfiles,
              variant: "outline",
              testId: MODEL_LIST_TEST_IDS.addApiCredentialProfileButton,
            },
          ]}
        />
      ) : null}

      {shouldShowSourceSelectionEmptyState ? (
        <EmptyState
          icon={<Cpu className="h-12 w-12" />}
          title={t("modelList:pleaseSelectSource")}
          description={t("modelList:selectSourceToContinue")}
          action={{
            label: t("modelList:selectSource"),
            onClick: handleRequestSourceSelection,
            variant: "default",
          }}
        />
      ) : null}

      {selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS &&
        sourceCapabilities.supportsAccountSummary &&
        accountSummaryItems.length > 0 && (
          <AccountSummaryBar
            items={accountSummaryItems}
            activeAccountIds={allAccountsFilterAccountIds}
            onAccountClick={handleAccountSummaryClick}
          />
        )}

      {selectedSource && !hasModelData && (
        <StatusIndicator
          selectedSource={selectedSource}
          isLoading={isLoading}
          dataFormatError={dataFormatError}
          unsupportedSource={unsupportedSource}
          loadErrorMessage={loadErrorMessage}
          currentAccount={currentAccount}
          loadPricingData={loadPricingData}
          accountFallback={accountFallback}
        />
      )}

      {selectedSource && hasModelData && (
        <>
          {personalizedCatalogFallback && (
            <PersonalizedCatalogFallbackNotice
              fallback={personalizedCatalogFallback}
            />
          )}

          {(showCatalogOnlyNotice || hasInferenceRouteFallback) && (
            <Alert
              variant={hasInferenceRouteFallback ? "warning" : "default"}
              className="mb-density-6"
              title={
                hasInferenceRouteFallback
                  ? t("inferenceRouteFallbackNotice.title")
                  : isRuntimeKeyOnlyFallbackCatalog
                    ? t("runtimeKeyFallbackSourceNotice.title")
                    : t("fallbackSourceNotice.title")
              }
              description={
                !showCatalogOnlyNotice
                  ? t("inferenceRouteFallbackNotice.description")
                  : isRuntimeKeyOnlyFallbackCatalog
                    ? t("runtimeKeyFallbackSourceNotice.description")
                    : t("fallbackSourceNotice.description")
              }
            >
              {showCatalogOnlyNotice && hasInferenceRouteFallback && (
                <p className="text-sm">
                  {t("inferenceRouteFallbackNotice.description")}
                </p>
              )}
            </Alert>
          )}

          {isProviderCatalogFallbackActive && (
            <Alert
              variant="warning"
              className="mb-density-6"
              title={t("providerCatalogFallbackNotice.title")}
              description={t(
                selectedSource.kind ===
                  MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
                  ? "providerCatalogFallbackNotice.allAccountsDescription"
                  : "providerCatalogFallbackNotice.description",
              )}
            >
              {selectedSource.kind ===
                MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {providerCatalogFallbackAccounts.map((account) => (
                    <li key={account.id} className="max-w-full break-words">
                      <Badge
                        variant="warning"
                        className="max-w-full break-words whitespace-normal"
                      >
                        {account.name}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Alert>
          )}

          {verifyContext && (
            <VerifyApiDialog
              isOpen={true}
              onClose={handleCloseModelVerification}
              account={verifyContext.account}
              initialModelId={verifyContext.modelId}
              modelEnableGroups={verifyContext.modelEnableGroups}
              onManageModelKey={handleManageVerifyModelKey}
            />
          )}

          {verifyCliContext && (
            <>
              {verifyCliContext.source.kind ===
              MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT ? (
                <VerifyCliSupportDialog
                  isOpen={true}
                  onClose={handleCloseCliVerification}
                  account={verifyCliContext.source.account}
                  initialModelId={verifyCliContext.modelId}
                />
              ) : (
                <VerifyCliSupportDialog
                  isOpen={true}
                  onClose={handleCloseCliVerification}
                  profile={verifyCliContext.source.profile}
                  initialModelId={verifyCliContext.modelId}
                />
              )}
            </>
          )}

          {verifyProfileContext && (
            <VerifyApiCredentialProfileDialog
              isOpen={true}
              onClose={handleCloseProfileVerification}
              profile={verifyProfileContext.profile}
              initialModelId={verifyProfileContext.modelId}
            />
          )}

          {modelKeyContext && (
            <ModelKeyDialog
              isOpen={true}
              onClose={handleCloseModelKeyDialog}
              account={modelKeyContext.account}
              modelId={modelKeyContext.modelId}
              modelEnableGroups={modelKeyContext.modelEnableGroups}
            />
          )}

          {batchVerifyContext && (
            <BatchVerifyModelsDialog
              isOpen={true}
              onClose={handleCloseBatchVerification}
              items={batchVerifyContext.items}
            />
          )}

          <ControlPanel
            showUnavailableModels={showUnavailableModels}
            setShowUnavailableModels={setShowUnavailableModels}
            selectedSource={selectedSource}
            sourceCapabilities={sourceCapabilities}
            selectedSourceValue={selectedSourceValue}
            setSelectedSourceValue={handleSelectedSourceValueChange}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            sortMode={sortMode}
            setSortMode={setSortMode}
            priceComparisonPresetId={priceComparisonPresetId}
            setPriceComparisonPresetId={setPriceComparisonPresetId}
            pricingScenarioSettings={pricingScenarioSettings}
            setPricingScenarioSettings={setPricingScenarioSettings}
            priceComparisonWeights={priceComparisonWeights}
            setPriceComparisonWeights={setPriceComparisonWeights}
            selectedBillingMode={selectedBillingMode}
            setSelectedBillingMode={setSelectedBillingMode}
            supportsModelCapabilityFilter={supportsModelCapabilityFilter}
            modelCapabilityMetadataCoverage={modelCapabilityMetadataCoverage}
            selectedModelCapabilities={selectedModelCapabilities}
            setSelectedModelCapabilities={setSelectedModelCapabilities}
            selectedGroups={selectedGroups}
            setSelectedGroups={setSelectedGroups}
            availableGroups={availableGroups}
            singleSourceGroupRatios={singleSourceGroupRatios}
            showRealPrice={showRealPrice}
            setShowRealPrice={setShowRealPrice}
            showEndpointTypes={showEndpointTypes}
            setShowEndpointTypes={setShowEndpointTypes}
            totalModels={totalModels}
            filteredModels={displayedModels}
            getFilteredResultCount={getDisplayedResultCount}
            selectedVerificationResults={selectedVerificationResults}
            setSelectedVerificationResults={setSelectedVerificationResults}
            onBatchVerifyModels={
              canBatchVerifyModels ? handleOpenBatchVerify : undefined
            }
          />

          <PricingDiagnostics
            models={displayedModels}
            onLocate={setSearchTerm}
          />

          <ProviderTabs
            vendorCatalog={vendorCatalog}
            effectiveSelectedVendor={effectiveSelectedVendor}
            setSelectedProvider={setSelectedProvider}
            allVendorsFilteredCount={allVendorsFilteredCount}
            unclassifiedVendorCount={unclassifiedVendorCount}
          >
            <TabsContent value={MODEL_VENDOR_FILTER_VALUES.All}>
              {renderModelDisplay()}
            </TabsContent>
            {vendorCatalog.map((vendor) => (
              <TabsContent key={vendor.key} value={vendor.key}>
                {renderModelDisplay()}
              </TabsContent>
            ))}
            {unclassifiedVendorCount > 0 && (
              <TabsContent value={MODEL_VENDOR_FILTER_VALUES.Unclassified}>
                {renderModelDisplay()}
              </TabsContent>
            )}
          </ProviderTabs>

          <Footer showPricingNote={sourceCapabilities.supportsPricing} />
        </>
      )}
    </div>
  )
  return (
    <PricingScenarioNavigation
      onConfigure={() => {
        if (!isModelListPriceSortMode(sortMode))
          setSortMode(MODEL_LIST_SORT_MODES.MODEL_CHEAPEST_FIRST)
      }}
    >
      {page}
    </PricingScenarioNavigation>
  )
}
