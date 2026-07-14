import { ArrowPathIcon } from "@heroicons/react/24/outline"
import { Cpu, KeyRound } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { VerifyApiDialog } from "~/components/dialogs/VerifyApiDialog"
import { VerifyCliSupportDialog } from "~/components/dialogs/VerifyCliSupportDialog"
import { PageHeader } from "~/components/PageHeader"
import Tooltip from "~/components/Tooltip"
import {
  Alert,
  Button,
  EmptyState,
  IconButton,
  TabsContent,
} from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { ProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { VerifyApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog"
import {
  createBatchVerifyModelItems,
  type BatchVerifyModelItem,
} from "~/features/ModelList/batchVerification"
import {
  ALL_ACCOUNTS_SOURCE_VALUE,
  MODEL_MANAGEMENT_SOURCE_KINDS,
  resolveModelManagementSource,
  type ModelManagementItemSource,
} from "~/features/ModelList/modelManagementSources"
import {
  canCreateAccountApiTokens,
  canListAccountRuntimeKeys,
} from "~/services/accounts/keyProductCapabilities"
import {
  getAllProviders,
  MODEL_PROVIDER_FILTER_VALUES,
} from "~/services/models/utils/modelProviders"
import { trackProductAnalyticsActionStarted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  createAccountModelVerificationHistoryTarget,
  createProfileModelVerificationHistoryTarget,
  useVerificationResultHistorySummaries,
  type ApiVerificationHistoryTarget,
} from "~/services/verification/verificationResultHistory"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import {
  openKeysPage,
  pushWithinOptionsPage,
  replaceWithinOptionsPage,
} from "~/utils/navigation"

import { sortModelListAccounts } from "./accountOrdering"
import { AccountSelector } from "./components/AccountSelector"
import { AccountSummaryBar } from "./components/AccountSummaryBar"
import { BatchVerifyModelsDialog } from "./components/BatchVerifyModelsDialog"
import { ControlPanel } from "./components/ControlPanel"
import { Footer } from "./components/Footer"
import { ModelDisplay } from "./components/ModelDisplay"
import ModelKeyDialog from "./components/ModelKeyDialog"
import { ProviderTabs } from "./components/ProviderTabs"
import { StatusIndicator } from "./components/StatusIndicator"
import { MODEL_LIST_GROUP_SELECTION_SCOPES } from "./groupSelectionScopes"
import { useModelListData } from "./hooks/useModelListData"
import { MODEL_LIST_SORT_MODES } from "./sortModes"
import { MODEL_LIST_TEST_IDS } from "./testIds"
import {
  applyVerificationResultView,
  type ModelListVerificationResultFilter,
} from "./verificationResultFilters"

type ModelListDisplayedResultCountBaseFilters = NonNullable<
  Parameters<ReturnType<typeof useModelListData>["getFilteredResultCount"]>[0]
>

interface ModelListDisplayedResultCountFilters
  extends ModelListDisplayedResultCountBaseFilters {
  selectedVerificationResults?: ModelListVerificationResultFilter[]
}

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
  ])
  const [isSourceSelectorOpen, setIsSourceSelectorOpen] = useState(false)
  const sourceSelectorTriggerRef = useRef<HTMLButtonElement>(null)
  const {
    accounts,
    profiles,
    selectedSource,
    currentAccount,
    sourceCapabilities,

    selectedSourceValue,
    setSelectedSourceValue,
    searchTerm,
    setSearchTerm,
    selectedProvider,
    setSelectedProvider,
    sortMode,
    setSortMode,
    selectedBillingMode,
    setSelectedBillingMode,
    selectedModelCapabilities,
    setSelectedModelCapabilities,
    selectedGroups,
    setSelectedGroups,
    allAccountsExcludedGroupsByAccountId,
    setAllAccountsExcludedGroupsByAccountId,

    // Display options
    showRealPrice,
    setShowRealPrice,
    showRatioColumn,
    setShowRatioColumn,
    showEndpointTypes,
    setShowEndpointTypes,
    selectedVerificationResults,
    setSelectedVerificationResults,

    // Data state
    pricingData,
    pricingContexts,
    isLoading,
    dataFormatError,
    unsupportedSource,
    loadErrorMessage,
    accountFallback,
    isFallbackCatalogActive,
    isAihubmixCatalogFallbackActive,

    filteredModels,
    accountSummaryCountsByAccountId,
    allProvidersFilteredCount,
    getFilteredModels,
    getFilteredResultCount,
    availableGroups,
    availableAccountGroupsByAccountId,
    availableAccountGroupOptionsByAccountId,
    supportsModelCapabilityFilter,
    modelCapabilityMetadataCoverage,

    // Operations
    loadPricingData,
    getProviderFilteredCount,
    accountQueryStates,
    allAccountsFilterAccountIds,
    setAllAccountsFilterAccountIds,
  } = useModelListData(routeParams)

  const providers = getAllProviders()
  const hasAnySources = accounts.length > 0 || profiles.length > 0

  const sortedProviders = useMemo(
    () =>
      [...providers].sort(
        (a, b) => getProviderFilteredCount(b) - getProviderFilteredCount(a),
      ),
    [providers, getProviderFilteredCount],
  )
  const sortedAccounts = useMemo(
    () =>
      sortModelListAccounts({
        accounts,
        accountQueryStates,
        accountSummaryCountsByAccountId,
      }),
    [accountQueryStates, accountSummaryCountsByAccountId, accounts],
  )

  const handleSelectedSourceValueChange = useCallback(
    (sourceValue: string) => {
      setSelectedSourceValue(sourceValue)

      const source = resolveModelManagementSource({
        value: sourceValue,
        accounts,
        profiles,
      })
      const searchParams =
        source?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ACCOUNT
          ? { accountId: source.account.id }
          : source?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
            ? { profileId: source.profile.id }
            : source?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
              ? { accountId: ALL_ACCOUNTS_SOURCE_VALUE }
              : undefined

      replaceWithinOptionsPage(`#${MENU_ITEM_IDS.MODELS}`, searchParams)
    },
    [accounts, profiles, setSelectedSourceValue],
  )

  const handleGroupClick = (group: string) => {
    setSelectedGroups([group])
  }

  const isAllAccountsScope =
    selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
  const displaySelectedGroups = isAllAccountsScope ? [] : selectedGroups
  const modelDisplayGroupSelectionScope = isAllAccountsScope
    ? MODEL_LIST_GROUP_SELECTION_SCOPES.ALL_ACCOUNTS
    : MODEL_LIST_GROUP_SELECTION_SCOPES.SINGLE_SOURCE
  const isModelGroupSelectionInteractive = !isAllAccountsScope

  const handleAccountSummaryClick = (accountId: string) => {
    setAllAccountsFilterAccountIds((currentAccountIds) =>
      currentAccountIds.includes(accountId)
        ? currentAccountIds.filter((id) => id !== accountId)
        : [...currentAccountIds, accountId],
    )
    void trackProductAnalyticsActionStarted({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ModelList,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.FilterModelList,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  }

  const hasModelData =
    selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS
      ? pricingContexts && pricingContexts.length > 0
      : !!pricingData
  const isRuntimeKeyOnlyFallbackCatalog =
    isFallbackCatalogActive &&
    !!currentAccount &&
    canListAccountRuntimeKeys(currentAccount) &&
    !canCreateAccountApiTokens(currentAccount)
  const shouldShowSourceSetupEmptyState = !hasAnySources
  const shouldShowSourceSelectionEmptyState =
    !shouldShowSourceSetupEmptyState && !selectedSource

  const accountSummaryItems = useMemo(() => {
    const stateByAccountId = new Map(
      (accountQueryStates ?? []).map((state) => [state.account.id, state]),
    )

    return sortedAccounts.flatMap((account) => {
      const state = stateByAccountId.get(account.id)
      if (!state) {
        return []
      }
      const count = accountSummaryCountsByAccountId.get(state.account.id)
      if (count === undefined && !state.isLoading && !state.errorType) {
        return []
      }

      return [
        {
          accountId: state.account.id,
          name: state.account.name,
          count: count ?? 0,
          isLoading: state.isLoading,
          errorType: state.errorType,
          errorMessage: state.errorMessage,
        },
      ]
    })
  }, [accountQueryStates, accountSummaryCountsByAccountId, sortedAccounts])

  const modelVerificationTargets = useMemo(() => {
    return filteredModels.reduce<ApiVerificationHistoryTarget[]>(
      (acc, item) => {
        const source = item.source as ModelManagementItemSource
        const modelId = item.model.model_name?.trim()
        if (!modelId) return acc

        const historyTarget =
          source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE
            ? createProfileModelVerificationHistoryTarget(
                source.profile.id,
                modelId,
              )
            : createAccountModelVerificationHistoryTarget(
                source.account.id,
                modelId,
              )
        if (historyTarget) {
          acc.push(historyTarget)
        }

        return acc
      },
      [],
    )
  }, [filteredModels])
  const { summariesByKey: verificationSummariesByKey } =
    useVerificationResultHistorySummaries(modelVerificationTargets)
  const displayedModels = useMemo(
    () =>
      applyVerificationResultView(filteredModels, {
        selectedResults: selectedVerificationResults,
        shouldSortByLatency:
          sortMode === MODEL_LIST_SORT_MODES.VERIFICATION_LATENCY_ASC,
        verificationSummariesByKey,
      }),
    [
      filteredModels,
      selectedVerificationResults,
      sortMode,
      verificationSummariesByKey,
    ],
  )
  const getDisplayedResultCount = useCallback(
    (filters: ModelListDisplayedResultCountFilters = {}) => {
      const baseCount = getFilteredResultCount(filters)
      if (
        !filters.selectedVerificationResults &&
        filters.sortMode !== MODEL_LIST_SORT_MODES.VERIFICATION_LATENCY_ASC
      ) {
        return baseCount
      }

      const selectedResults =
        filters.selectedVerificationResults ?? selectedVerificationResults
      const {
        selectedVerificationResults: _selectedVerificationResults,
        ...baseFilters
      } = filters

      return applyVerificationResultView(getFilteredModels(baseFilters), {
        selectedResults,
        shouldSortByLatency:
          filters.sortMode === MODEL_LIST_SORT_MODES.VERIFICATION_LATENCY_ASC,
        verificationSummariesByKey,
      }).length
    },
    [
      getFilteredModels,
      getFilteredResultCount,
      selectedVerificationResults,
      verificationSummariesByKey,
    ],
  )

  const [verifyContext, setVerifyContext] = useState<{
    account: DisplaySiteData
    modelId: string
    modelEnableGroups?: string[]
  } | null>(null)

  const [verifyCliContext, setVerifyCliContext] = useState<{
    source: ModelManagementItemSource
    modelId: string
  } | null>(null)

  const [verifyProfileContext, setVerifyProfileContext] = useState<{
    profile: ApiCredentialProfile
    modelId: string
  } | null>(null)

  const [modelKeyContext, setModelKeyContext] = useState<{
    account: DisplaySiteData
    modelId: string
    modelEnableGroups?: string[]
    returnToVerify?: boolean
  } | null>(null)

  const [batchVerifyContext, setBatchVerifyContext] = useState<{
    items: BatchVerifyModelItem[]
  } | null>(null)

  const handleVerifyModel = (
    source: ModelManagementItemSource,
    modelId: string,
    modelEnableGroups?: string[],
  ) => {
    if (source.kind === MODEL_MANAGEMENT_SOURCE_KINDS.PROFILE) {
      setVerifyProfileContext({
        profile: source.profile,
        modelId,
      })
      return
    }

    setVerifyContext({ account: source.account, modelId, modelEnableGroups })
  }

  const handleVerifyCliSupport = (
    source: ModelManagementItemSource,
    modelId: string,
  ) => {
    setVerifyCliContext({ source, modelId })
  }

  const handleOpenModelKeyDialog = (
    account: DisplaySiteData,
    modelId: string,
    modelEnableGroups?: string[],
  ) => setModelKeyContext({ account, modelId, modelEnableGroups })

  const handleManageVerifyModelKey = () => {
    if (!verifyContext) return
    setModelKeyContext({ ...verifyContext, returnToVerify: true })
    setVerifyContext(null)
  }

  const handleCloseModelKeyDialog = () => {
    if (modelKeyContext?.returnToVerify) {
      const { returnToVerify: _returnToVerify, ...nextVerifyContext } =
        modelKeyContext
      setVerifyContext(nextVerifyContext)
    }
    setModelKeyContext(null)
  }

  const batchVerifyItems = useMemo(
    () => createBatchVerifyModelItems(displayedModels),
    [displayedModels],
  )

  const handleOpenBatchVerify = () => {
    if (batchVerifyItems.length === 0) return
    setBatchVerifyContext({ items: batchVerifyItems })
  }

  const canBatchVerifyModels =
    !!selectedSource &&
    sourceCapabilities.supportsBatchCredentialVerification &&
    batchVerifyItems.length > 0

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

  const totalModels = useMemo(() => {
    if (selectedSource?.kind === MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS) {
      return pricingContexts.reduce((count, context) => {
        const models = context.pricing?.data
        return count + (Array.isArray(models) ? models.length : 0)
      }, 0)
    }

    return Array.isArray(pricingData?.data) ? pricingData.data.length : 0
  }, [pricingContexts, pricingData, selectedSource?.kind])

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
      showRatioColumn={showRatioColumn}
      showEndpointTypes={showEndpointTypes}
      selectedGroups={displaySelectedGroups}
      handleGroupClick={handleGroupClick}
      availableGroups={availableGroups}
      groupSelectionScope={modelDisplayGroupSelectionScope}
      isGroupSelectionInteractive={isModelGroupSelectionInteractive}
      displayCapabilities={sourceCapabilities}
    />
  )

  return (
    <div className="p-6" data-testid={MODEL_LIST_TEST_IDS.page}>
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
          selectedSource && hasModelData ? (
            <ProductAnalyticsScope
              entrypoint={PRODUCT_ANALYTICS_ENTRYPOINTS.Options}
              featureId={PRODUCT_ANALYTICS_FEATURE_IDS.ModelList}
              surfaceId={PRODUCT_ANALYTICS_SURFACE_IDS.OptionsModelListPage}
            >
              <Button
                onClick={loadPricingData}
                variant="secondary"
                leftIcon={<ArrowPathIcon className="h-4 w-4" />}
                loading={isLoading}
                analyticsAction={
                  PRODUCT_ANALYTICS_ACTION_IDS.RefreshModelPricingData
                }
              >
                {isLoading ? t("common:status.refreshing") : t("refreshData")}
              </Button>
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
          {isFallbackCatalogActive && (
            <Alert
              variant="info"
              className="mb-6"
              title={
                isRuntimeKeyOnlyFallbackCatalog
                  ? t("runtimeKeyFallbackSourceNotice.title")
                  : t("fallbackSourceNotice.title")
              }
              description={
                isRuntimeKeyOnlyFallbackCatalog
                  ? t("runtimeKeyFallbackSourceNotice.description")
                  : t("fallbackSourceNotice.description")
              }
            />
          )}

          {isAihubmixCatalogFallbackActive && (
            <Alert
              variant="warning"
              className="mb-6"
              title={t("aihubmixCatalogFallbackNotice.title")}
              description={t("aihubmixCatalogFallbackNotice.description")}
            />
          )}

          {verifyContext && (
            <VerifyApiDialog
              isOpen={true}
              onClose={() => setVerifyContext(null)}
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
                  onClose={() => setVerifyCliContext(null)}
                  account={verifyCliContext.source.account}
                  initialModelId={verifyCliContext.modelId}
                />
              ) : (
                <VerifyCliSupportDialog
                  isOpen={true}
                  onClose={() => setVerifyCliContext(null)}
                  profile={verifyCliContext.source.profile}
                  initialModelId={verifyCliContext.modelId}
                />
              )}
            </>
          )}

          {verifyProfileContext && (
            <VerifyApiCredentialProfileDialog
              isOpen={true}
              onClose={() => setVerifyProfileContext(null)}
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
              onClose={() => setBatchVerifyContext(null)}
              items={batchVerifyContext.items}
            />
          )}

          {selectedSource?.kind ===
            MODEL_MANAGEMENT_SOURCE_KINDS.ALL_ACCOUNTS &&
            sourceCapabilities.supportsAccountSummary &&
            accountSummaryItems.length > 0 && (
              <AccountSummaryBar
                items={accountSummaryItems}
                activeAccountIds={allAccountsFilterAccountIds}
                onAccountClick={handleAccountSummaryClick}
              />
            )}
          <ControlPanel
            selectedSource={selectedSource}
            sourceCapabilities={sourceCapabilities}
            selectedSourceValue={selectedSourceValue}
            setSelectedSourceValue={handleSelectedSourceValueChange}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            sortMode={sortMode}
            setSortMode={setSortMode}
            selectedBillingMode={selectedBillingMode}
            setSelectedBillingMode={setSelectedBillingMode}
            supportsModelCapabilityFilter={supportsModelCapabilityFilter}
            modelCapabilityMetadataCoverage={modelCapabilityMetadataCoverage}
            selectedModelCapabilities={selectedModelCapabilities}
            setSelectedModelCapabilities={setSelectedModelCapabilities}
            selectedGroups={selectedGroups}
            setSelectedGroups={setSelectedGroups}
            availableGroups={availableGroups}
            pricingData={pricingData}
            showRealPrice={showRealPrice}
            setShowRealPrice={setShowRealPrice}
            showRatioColumn={showRatioColumn}
            setShowRatioColumn={setShowRatioColumn}
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

          <ProviderTabs
            providers={sortedProviders}
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            allProvidersFilteredCount={allProvidersFilteredCount}
            getProviderFilteredCount={getProviderFilteredCount}
          >
            <TabsContent value={MODEL_PROVIDER_FILTER_VALUES.ALL}>
              {renderModelDisplay()}
            </TabsContent>
            {providers.map((provider) => (
              <TabsContent key={provider} value={provider}>
                {renderModelDisplay()}
              </TabsContent>
            ))}
          </ProviderTabs>

          <Footer showPricingNote={sourceCapabilities.supportsPricing} />
        </>
      )}
    </div>
  )
}
