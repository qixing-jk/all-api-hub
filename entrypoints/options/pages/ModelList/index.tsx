import { Tab } from "@headlessui/react"
import { Cpu } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { VerifyApiDialog } from "~/components/VerifyApiDialog"
import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import type { DisplaySiteData } from "~/types"
import { getAllProviders } from "~/utils/modelProviders"

import { AccountSelector } from "./components/AccountSelector"
import { AccountSummaryBar } from "./components/AccountSummaryBar"
import { ControlPanel } from "./components/ControlPanel"
import { Footer } from "./components/Footer"
import { ModelDisplay } from "./components/ModelDisplay"
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
    // Account data
    accounts,
    currentAccount,

    // UI state
    selectedAccount,
    setSelectedAccount,
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

    // Computed data
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
        setSelectedAccount(routeParams.accountId)
      }
    }
  }, [routeParams?.accountId, accounts, setSelectedAccount])

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
    selectedAccount === "all"
      ? pricingContexts && pricingContexts.length > 0
      : !!pricingData

  const accountSummaryItems = useMemo(() => {
    const countMap = new Map<string, number>()

    baseFilteredModels.forEach((item: any) => {
      const account = item.account
      if (!account) return
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

  const handleVerifyModel = (account: DisplaySiteData, modelId: string) => {
    setVerifyContext({ account, modelId })
  }

  return (
    <div className="p-6">
      <PageHeader
        icon={Cpu}
        title={t("title")}
        description={t("description")}
      />
      <AccountSelector
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        accounts={accounts}
      />

      {selectedAccount && !hasModelData && (
        <StatusIndicator
          selectedAccount={selectedAccount as string}
          isLoading={isLoading}
          dataFormatError={dataFormatError}
          currentAccount={currentAccount}
          loadPricingData={() => loadPricingData(selectedAccount as string)}
        />
      )}

      {selectedAccount && hasModelData && (
        <>
          {verifyContext && (
            <VerifyApiDialog
              isOpen={true}
              onClose={() => setVerifyContext(null)}
              account={verifyContext.account}
              initialModelId={verifyContext.modelId}
            />
          )}

          {selectedAccount === "all" && accountSummaryItems.length > 0 && (
            <AccountSummaryBar
              items={accountSummaryItems}
              activeAccountId={allAccountsFilterAccountId}
              onAccountClick={handleAccountSummaryClick}
            />
          )}
          <ControlPanel
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            selectedGroup={selectedGroup}
            setSelectedGroup={setSelectedGroup}
            availableGroups={availableGroups}
            pricingData={pricingData}
            loadPricingData={() => loadPricingData(selectedAccount)}
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
                  currentAccount={currentAccount}
                  onVerifyModel={handleVerifyModel}
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
                    currentAccount={currentAccount}
                    onVerifyModel={handleVerifyModel}
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

          <Footer />
        </>
      )}
    </div>
  )
}
