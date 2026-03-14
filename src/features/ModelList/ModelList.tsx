import { Tab } from "@headlessui/react"
import { Cpu } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { VerifyApiDialog } from "~/components/dialogs/VerifyApiDialog"
import { VerifyCliSupportDialog } from "~/components/dialogs/VerifyCliSupportDialog"
import { PageHeader } from "~/components/PageHeader"
import { VerifyApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog"
import {
  toAccountSourceValue,
  type ModelManagementItemSource,
} from "~/features/ModelList/modelManagementSources"
import { getAllProviders } from "~/services/models/utils/modelProviders"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

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
  const { t } = useTranslation("modelList")
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
    selectedGroup,
    setSelectedGroup,

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

    filteredModels,
    baseFilteredModels,
    availableGroups,

    // Operations
    loadPricingData,
    getProviderFilteredCount,
    accountQueryStates,
    allAccountsFilterAccountId,
    setAllAccountsFilterAccountId,
  } = useModelListData()

  const providers = getAllProviders()

  const sortedProviders = useMemo(
    () =>
      [...providers].sort(
        (a, b) => getProviderFilteredCount(b) - getProviderFilteredCount(a),
      ),
    [providers, getProviderFilteredCount],
  )

  useEffect(() => {
    if (routeParams?.accountId && accounts.length > 0) {
      const accountExists = accounts.some(
        (acc) => acc.id === routeParams.accountId,
      )
      if (accountExists) {
        setSelectedSourceValue(toAccountSourceValue(routeParams.accountId))
      }
    }
  }, [routeParams?.accountId, accounts, setSelectedSourceValue])

  const handleGroupClick = (group: string) => {
    setSelectedGroup(group)
  }

  const handleAccountSummaryClick = (accountId: string) => {
    if (allAccountsFilterAccountId === accountId) {
      setAllAccountsFilterAccountId(null)
    } else {
      setAllAccountsFilterAccountId(accountId)
    }
  }

  const hasModelData =
    selectedSource?.kind === "all-accounts"
      ? pricingContexts && pricingContexts.length > 0
      : !!pricingData

  const accountSummaryItems = useMemo(() => {
    const countMap = new Map<string, number>()

    baseFilteredModels.forEach((item: any) => {
      if (item.source?.kind !== "account") return
      const account = item.source.account
      countMap.set(account.id, (countMap.get(account.id) ?? 0) + 1)
    })

    return (accountQueryStates ?? []).map((state) => ({
      accountId: state.account.id,
      name: state.account.name,
      count: countMap.get(state.account.id) ?? 0,
      errorType: state.errorType,
    }))
  }, [baseFilteredModels, accountQueryStates])

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

  return (
    <div className="p-6">
      <PageHeader
        icon={Cpu}
        title={t("title")}
        description={t("description")}
      />
      <AccountSelector
        selectedSourceValue={selectedSourceValue}
        setSelectedSourceValue={setSelectedSourceValue}
        accounts={accounts}
        profiles={profiles}
      />

      {selectedSourceValue && !hasModelData && (
        <StatusIndicator
          selectedSource={selectedSource}
          isLoading={isLoading}
          dataFormatError={dataFormatError}
          loadErrorMessage={loadErrorMessage}
          currentAccount={currentAccount}
          loadPricingData={loadPricingData}
        />
      )}

      {selectedSourceValue && hasModelData && (
        <>
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
                activeAccountId={allAccountsFilterAccountId}
                onAccountClick={handleAccountSummaryClick}
              />
            )}
          <ControlPanel
            selectedSource={selectedSource}
            sourceCapabilities={sourceCapabilities}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            selectedGroup={selectedGroup}
            setSelectedGroup={setSelectedGroup}
            availableGroups={availableGroups}
            pricingData={pricingData}
            loadPricingData={loadPricingData}
            isLoading={isLoading}
            showRealPrice={showRealPrice}
            setShowRealPrice={setShowRealPrice}
            showRatioColumn={showRatioColumn}
            setShowRatioColumn={setShowRatioColumn}
            showEndpointTypes={showEndpointTypes}
            setShowEndpointTypes={setShowEndpointTypes}
            totalModels={pricingData?.data?.length || 0}
            filteredModels={filteredModels}
          />

          <ProviderTabs
            providers={sortedProviders}
            selectedProvider={selectedProvider}
            setSelectedProvider={setSelectedProvider}
            baseFilteredModelsCount={baseFilteredModels.length}
            getProviderFilteredCount={getProviderFilteredCount}
          >
            <Tab.Panels>
              <Tab.Panel>
                <ModelDisplay
                  models={filteredModels}
                  onVerifyModel={handleVerifyModel}
                  onVerifyCliSupport={handleVerifyCliSupport}
                  onOpenModelKeyDialog={handleOpenModelKeyDialog}
                  showRealPrice={showRealPrice}
                  showRatioColumn={showRatioColumn}
                  showEndpointTypes={showEndpointTypes}
                  selectedGroup={selectedGroup}
                  handleGroupClick={handleGroupClick}
                  availableGroups={availableGroups}
                />
              </Tab.Panel>
              {providers.map((provider) => (
                <Tab.Panel key={provider}>
                  <ModelDisplay
                    models={filteredModels}
                    onVerifyModel={handleVerifyModel}
                    onVerifyCliSupport={handleVerifyCliSupport}
                    onOpenModelKeyDialog={handleOpenModelKeyDialog}
                    showRealPrice={showRealPrice}
                    showRatioColumn={showRatioColumn}
                    showEndpointTypes={showEndpointTypes}
                    selectedGroup={selectedGroup}
                    handleGroupClick={handleGroupClick}
                    availableGroups={availableGroups}
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
