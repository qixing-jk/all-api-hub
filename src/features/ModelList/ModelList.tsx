import { Tab } from "@headlessui/react"
import { ArrowPathIcon } from "@heroicons/react/24/outline"
import { Cpu } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { VerifyApiDialog } from "~/components/dialogs/VerifyApiDialog"
import { VerifyCliSupportDialog } from "~/components/dialogs/VerifyCliSupportDialog"
import { PageHeader } from "~/components/PageHeader"
import { Alert, Button, EmptyState } from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { VerifyApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog"
import { type ModelManagementItemSource } from "~/features/ModelList/modelManagementSources"
import { getAllProviders } from "~/services/models/utils/modelProviders"
import {
  createAccountModelVerificationHistoryTarget,
  createProfileModelVerificationHistoryTarget,
  useVerificationResultHistorySummaries,
  type ApiVerificationHistoryTarget,
} from "~/services/verification/verificationResultHistory"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"
import { pushWithinOptionsPage } from "~/utils/navigation"

import { AccountSelector } from "./components/AccountSelector"
import { AccountSummaryBar } from "./components/AccountSummaryBar"
import { ControlPanel } from "./components/ControlPanel"
import { Footer } from "./components/Footer"
import { ModelDisplay } from "./components/ModelDisplay"
import ModelKeyDialog from "./components/ModelKeyDialog"
import { ProviderTabs } from "./components/ProviderTabs"
import { StatusIndicator } from "./components/StatusIndicator"
import { useModelListData } from "./hooks/useModelListData"

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
    selectedGroups,
    setSelectedGroups,

    // Display options
    showRealPrice,
    setShowRealPrice,
    showRatioColumn,
    setShowRatioColumn,
    showEndpointTypes,
    setShowEndpointTypes,

    // Data state
    pricingData,
    pricingContexts,
    isLoading,
    dataFormatError,
    loadErrorMessage,
    accountFallback,
    isFallbackCatalogActive,

    filteredModels,
    accountSummaryCountsByAccountId,
    allProvidersFilteredCount,
    availableGroups,

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

  const handleGroupClick = (group: string) => {
    setSelectedGroups([group])
  }

  const handleAccountSummaryClick = (accountId: string) => {
    setAllAccountsFilterAccountIds((currentAccountIds) =>
      currentAccountIds.includes(accountId)
        ? currentAccountIds.filter((id) => id !== accountId)
        : [...currentAccountIds, accountId],
    )
  }

  const hasModelData =
    selectedSource?.kind === "all-accounts"
      ? pricingContexts && pricingContexts.length > 0
      : !!pricingData
  const shouldShowSourceSetupEmptyState = !hasAnySources
  const shouldShowSourceSelectionEmptyState =
    !shouldShowSourceSetupEmptyState && !selectedSource

  const accountSummaryItems = useMemo(() => {
    return (accountQueryStates ?? []).map((state) => ({
      accountId: state.account.id,
      name: state.account.name,
      count: accountSummaryCountsByAccountId.get(state.account.id) ?? 0,
      errorType: state.errorType,
    }))
  }, [accountQueryStates, accountSummaryCountsByAccountId])

  const modelVerificationTargets = useMemo(() => {
    return filteredModels.reduce<ApiVerificationHistoryTarget[]>(
      (acc, item) => {
        const source = item.source as ModelManagementItemSource
        const modelId = item.model.model_name?.trim()
        if (!modelId) return acc

        const historyTarget =
          source.kind === "profile"
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

  const [verifyContext, setVerifyContext] = useState<{
    account: DisplaySiteData
    modelId: string
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
    modelEnableGroups: string[]
  } | null>(null)

  const handleVerifyModel = (
    source: ModelManagementItemSource,
    modelId: string,
  ) => {
    if (source.kind === "profile") {
      setVerifyProfileContext({
        profile: source.profile,
        modelId,
      })
      return
    }

    setVerifyContext({ account: source.account, modelId })
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
    modelEnableGroups: string[],
  ) => setModelKeyContext({ account, modelId, modelEnableGroups })

  const handleOpenAccountManagement = useCallback(() => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.ACCOUNT}`)
  }, [])

  const handleOpenApiCredentialProfiles = useCallback(() => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`)
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
    if (selectedSource?.kind === "all-accounts") {
      return pricingContexts.reduce((count, context) => {
        const models = context.pricing?.data
        return count + (Array.isArray(models) ? models.length : 0)
      }, 0)
    }

    return Array.isArray(pricingData?.data) ? pricingData.data.length : 0
  }, [pricingContexts, pricingData, selectedSource?.kind])

  return (
    <div className="p-6">
      <PageHeader
        icon={Cpu}
        title={t("title")}
        description={t("description")}
        actions={
          selectedSource && hasModelData ? (
            <Button
              onClick={loadPricingData}
              variant="secondary"
              leftIcon={!isLoading && <ArrowPathIcon className="h-4 w-4" />}
              loading={isLoading}
              disabled={isLoading}
            >
              {t("refreshData")}
            </Button>
          ) : undefined
        }
      />
      <AccountSelector
        selectedSourceValue={selectedSourceValue}
        setSelectedSourceValue={setSelectedSourceValue}
        accounts={accounts}
        profiles={profiles}
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
            },
            {
              label: t("apiCredentialProfiles:actions.add"),
              onClick: handleOpenApiCredentialProfiles,
              variant: "outline",
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
              title={t("fallbackSourceNotice.title")}
              description={t("fallbackSourceNotice.description")}
            />
          )}

          {verifyContext && (
            <VerifyApiDialog
              isOpen={true}
              onClose={() => setVerifyContext(null)}
              account={verifyContext.account}
              initialModelId={verifyContext.modelId}
            />
          )}

          {verifyCliContext && (
            <>
              {verifyCliContext.source.kind === "account" ? (
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
              onClose={() => setModelKeyContext(null)}
              account={modelKeyContext.account}
              modelId={modelKeyContext.modelId}
              modelEnableGroups={modelKeyContext.modelEnableGroups}
            />
          )}

          {selectedSource?.kind === "all-accounts" &&
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
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            sortMode={sortMode}
            setSortMode={setSortMode}
            selectedBillingMode={selectedBillingMode}
            setSelectedBillingMode={setSelectedBillingMode}
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
            filteredModels={filteredModels}
          />

          <ProviderTabs
            providers={sortedProviders}
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            allProvidersFilteredCount={allProvidersFilteredCount}
            getProviderFilteredCount={getProviderFilteredCount}
          >
            <Tab.Panels>
              <Tab.Panel>
                <ModelDisplay
                  models={filteredModels}
                  verificationSummariesByKey={verificationSummariesByKey}
                  onVerifyModel={handleVerifyModel}
                  onVerifyCliSupport={handleVerifyCliSupport}
                  onOpenModelKeyDialog={handleOpenModelKeyDialog}
                  onFilterAccount={
                    selectedSource?.kind === "all-accounts"
                      ? handleAccountSummaryClick
                      : undefined
                  }
                  showRealPrice={showRealPrice}
                  showRatioColumn={showRatioColumn}
                  showEndpointTypes={showEndpointTypes}
                  selectedGroups={selectedGroups}
                  handleGroupClick={handleGroupClick}
                  availableGroups={availableGroups}
                  displayCapabilities={sourceCapabilities}
                />
              </Tab.Panel>
              {providers.map((provider) => (
                <Tab.Panel key={provider}>
                  <ModelDisplay
                    models={filteredModels}
                    verificationSummariesByKey={verificationSummariesByKey}
                    onVerifyModel={handleVerifyModel}
                    onVerifyCliSupport={handleVerifyCliSupport}
                    onOpenModelKeyDialog={handleOpenModelKeyDialog}
                    onFilterAccount={
                      selectedSource?.kind === "all-accounts"
                        ? handleAccountSummaryClick
                        : undefined
                    }
                    showRealPrice={showRealPrice}
                    showRatioColumn={showRatioColumn}
                    showEndpointTypes={showEndpointTypes}
                    selectedGroups={selectedGroups}
                    handleGroupClick={handleGroupClick}
                    availableGroups={availableGroups}
                    displayCapabilities={sourceCapabilities}
                  />
                </Tab.Panel>
              ))}
            </Tab.Panels>
          </ProviderTabs>

          <Footer showPricingNote={sourceCapabilities.supportsPricing} />
        </>
      )}
    </div>
  )
}
