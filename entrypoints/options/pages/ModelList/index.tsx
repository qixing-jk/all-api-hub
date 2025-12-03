import { Tab } from "@headlessui/react"
import { Cpu } from "lucide-react"
import { useEffect, useMemo } from "react"
import { useTranslation } from "react-i18next"

import { PageHeader } from "~/entrypoints/options/components/PageHeader"
import { getAllProviders } from "~/utils/modelProviders"

import { AccountSelector } from "./components/AccountSelector"
import { ControlPanel } from "./components/ControlPanel"
import { Footer } from "./components/Footer"
import { ModelDisplay } from "./components/ModelDisplay"
import { ProviderTabs } from "./components/ProviderTabs"
import { StatusIndicator } from "./components/StatusIndicator"
import { useModelListData } from "./hooks/useModelListData"

export default function ModelList({
  routeParams,
}: {
  routeParams?: Record<string, string>
}) {
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
    isLoading,
    dataFormatError,

    // Computed data
    filteredModels,
    baseFilteredModels,
    availableGroups,

    // Operations
    loadPricingData,
    getProviderFilteredCount,
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

      <StatusIndicator
        selectedAccount={selectedAccount}
        isLoading={isLoading}
        dataFormatError={dataFormatError}
        currentAccount={currentAccount}
        loadPricingData={() => loadPricingData(selectedAccount)}
      />

      {selectedAccount && !isLoading && pricingData && (
        <>
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
