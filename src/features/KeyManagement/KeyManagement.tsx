import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { NEW_API } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import AddTokenDialog from "~/features/KeyManagement/components/AddTokenDialog"
import { loadNewApiChannelKeyWithVerification } from "~/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification"
import { NewApiManagedVerificationDialog } from "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog"
import { useNewApiManagedVerification } from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import { getRecoverableManagedSiteChannelCandidate } from "~/services/managedSites/channelMatch"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  type ManagedSiteTokenChannelStatus,
} from "~/services/managedSites/tokenChannelStatus"
import type { AccountToken } from "~/types"
import { sendRuntimeActionMessage } from "~/utils/browser/browserApi"
import { pushWithinOptionsPage } from "~/utils/navigation"

import { AccountSelectorPanel } from "./components/AccountSelectorPanel"
import { AccountSummaryBar } from "./components/AccountSummaryBar"
import { Footer } from "./components/Footer"
import { Header } from "./components/Header"
import { RepairMissingKeysDialog } from "./components/RepairMissingKeysDialog"
import { TokenList } from "./components/TokenList"
import { TokenSearchBar } from "./components/TokenSearchBar"
import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "./constants"
import { useKeyManagement } from "./hooks/useKeyManagement"

const canRetryNewApiManagedVerification = (
  managedSiteStatus?: ManagedSiteTokenChannelStatus,
) => {
  if (!managedSiteStatus) {
    return false
  }

  if (
    managedSiteStatus.status !== MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN
  ) {
    return false
  }

  if (
    managedSiteStatus.reason !==
    MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE
  ) {
    return false
  }

  return Boolean(
    managedSiteStatus.recovery?.loginCredentialsConfigured ||
      managedSiteStatus.recovery?.authenticatedBrowserSessionExists,
  )
}

const getRecoverableNewApiCandidateChannel = (
  managedSiteStatus?: ManagedSiteTokenChannelStatus,
) => {
  if (!managedSiteStatus) {
    return null
  }

  if (
    managedSiteStatus.status !== MANAGED_SITE_TOKEN_CHANNEL_STATUSES.UNKNOWN
  ) {
    return null
  }

  if (
    managedSiteStatus.reason !==
    MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS.EXACT_VERIFICATION_UNAVAILABLE
  ) {
    return null
  }

  return getRecoverableManagedSiteChannelCandidate(managedSiteStatus.assessment)
}

/**
 * Key management page rendering header, filters, token list, and dialogs.
 * @param props Component props optionally carrying routing context.
 * @param props.routeParams Optional route parameters forwarded by the router.
 * @returns Full key management page layout.
 */
export default function KeyManagement(props: {
  routeParams?: Record<string, string>
}) {
  const { routeParams } = props
  const { t } = useTranslation("keyManagement")
  const [isRepairOpen, setIsRepairOpen] = useState(false)
  const [repairStartOnOpen, setRepairStartOnOpen] = useState(false)
  const [isAccountSelectorOpen, setIsAccountSelectorOpen] = useState(false)
  const accountSelectorTriggerRef = useRef<HTMLButtonElement>(null)
  const verification = useNewApiManagedVerification()
  const {
    managedSiteType,
    newApiBaseUrl,
    newApiUserId,
    newApiUsername,
    newApiPassword,
    newApiTotpSecret,
  } = useUserPreferencesContext()

  const {
    displayData,
    selectedAccount,
    setSelectedAccount,
    searchTerm,
    setSearchTerm,
    tokens,
    isLoading,
    visibleKeys,
    resolvingVisibleKeys,
    isAddTokenOpen,
    editingToken,
    tokenLoadProgress,
    failedAccounts,
    accountSummaryItems,
    managedSiteTokenStatuses,
    isManagedSiteChannelStatusSupported,
    isManagedSiteStatusRefreshing,
    allAccountsFilterAccountIds,
    setAllAccountsFilterAccountIds,
    loadTokens,
    filteredTokens,
    getVisibleTokenKey,
    refreshManagedSiteTokenStatuses,
    refreshManagedSiteTokenStatusForToken,
    copyKey,
    toggleKeyVisibility,
    retryFailedAccounts,
    handleAddToken,
    handleCloseAddToken,
    handleEditToken,
    handleDeleteToken,
    tokenInventories,
  } = useKeyManagement(routeParams)

  const currentAccountLoadError =
    selectedAccount &&
    selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
    tokenInventories[selectedAccount]?.status === "error"
      ? tokenInventories[selectedAccount]?.errorMessage ??
        t("messages.loadFailed")
      : null

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const response = await sendRuntimeActionMessage({
          action: RuntimeActionIds.AccountKeyRepairGetProgress,
        })

        if (cancelled) return
        if (!response?.success || !response?.data) return

        if (response.data.state === "running") {
          setRepairStartOnOpen(false)
          setIsRepairOpen(true)
        }
      } catch {
        // Silent: repair progress is optional UI enhancement
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const handleRepairMissingKeys = () => {
    setRepairStartOnOpen(true)
    setIsRepairOpen(true)
  }

  const handleCloseRepairMissingKeys = () => {
    setIsRepairOpen(false)
    setRepairStartOnOpen(false)
  }

  const handleAccountSummaryClick = (accountId: string) => {
    setAllAccountsFilterAccountIds((currentAccountIds) =>
      currentAccountIds.includes(accountId)
        ? currentAccountIds.filter((id) => id !== accountId)
        : [...currentAccountIds, accountId],
    )
  }

  const handleOpenAccountManagement = useCallback(() => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.ACCOUNT}`)
  }, [])

  const handleRequestAccountSelection = useCallback(() => {
    const selectorTrigger = accountSelectorTriggerRef.current

    if (selectorTrigger) {
      if (typeof selectorTrigger.scrollIntoView === "function") {
        selectorTrigger.scrollIntoView({
          block: "nearest",
        })
      }
    }

    setIsAccountSelectorOpen(true)
  }, [])

  const handleManagedSiteVerificationRetry = async (
    token: AccountToken,
    managedSiteStatus: ManagedSiteTokenChannelStatus,
  ) => {
    if (managedSiteType !== NEW_API) {
      return
    }

    const candidateChannel =
      getRecoverableNewApiCandidateChannel(managedSiteStatus)

    if (candidateChannel) {
      let resolvedChannelKey = ""

      await loadNewApiChannelKeyWithVerification({
        channelId: candidateChannel.id,
        label: token.name,
        requestKind: "token",
        config: {
          baseUrl: newApiBaseUrl,
          userId: newApiUserId,
          username: newApiUsername,
          password: newApiPassword,
          totpSecret: newApiTotpSecret,
        },
        setKey: (key) => {
          resolvedChannelKey = key
        },
        onLoaded: async () => {
          await refreshManagedSiteTokenStatusForToken(token, {
            resolvedChannelKeysById: {
              [candidateChannel.id]: resolvedChannelKey,
            },
          })
        },
        openVerification: verification.openNewApiManagedVerification,
      })
      return
    }

    const refreshedStatus =
      (await refreshManagedSiteTokenStatusForToken(token)) ?? managedSiteStatus

    if (!canRetryNewApiManagedVerification(refreshedStatus)) {
      return
    }

    verification.openNewApiManagedVerification({
      kind: "token",
      label: token.name,
      config: {
        baseUrl: newApiBaseUrl,
        userId: newApiUserId,
        username: newApiUsername,
        password: newApiPassword,
        totpSecret: newApiTotpSecret,
      },
      onVerified: async () => {
        await refreshManagedSiteTokenStatusForToken(token)
      },
    })
  }

  const handleManagedSiteImportSuccess = async (token: AccountToken) => {
    await refreshManagedSiteTokenStatusForToken(token)
  }

  const addTokenPreSelectedAccountId =
    selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
      ? allAccountsFilterAccountIds.length === 1 &&
        displayData.some(
          (account) => account.id === allAccountsFilterAccountIds[0],
        )
        ? allAccountsFilterAccountIds[0]
        : null
      : selectedAccount || null

  return (
    <div className="p-6">
      <Header
        onAddToken={handleAddToken}
        onRepairMissingKeys={handleRepairMissingKeys}
        onRefresh={() => selectedAccount && loadTokens()}
        onRefreshManagedSiteStatus={
          isManagedSiteChannelStatusSupported
            ? () => void refreshManagedSiteTokenStatuses()
            : undefined
        }
        managedSiteStatusHint={
          isManagedSiteChannelStatusSupported
            ? undefined
            : t("managedSiteStatus.pageUnsupported")
        }
        selectedAccount={selectedAccount}
        isLoading={isLoading || !selectedAccount}
        isManagedSiteStatusRefreshing={isManagedSiteStatusRefreshing}
        isAddTokenDisabled={!selectedAccount || displayData.length === 0}
        isRepairDisabled={displayData.length === 0}
        isManagedSiteStatusRefreshDisabled={
          !selectedAccount || tokens.length === 0 || isLoading
        }
      />

      <AccountSelectorPanel
        selectedAccount={selectedAccount}
        setSelectedAccount={setSelectedAccount}
        displayData={displayData}
        selectorOpen={isAccountSelectorOpen}
        onSelectorOpenChange={setIsAccountSelectorOpen}
        selectorTriggerRef={accountSelectorTriggerRef}
        tokens={tokens}
        filteredTokens={filteredTokens}
        tokenLoadProgress={tokenLoadProgress}
        failedAccounts={failedAccounts}
        onRetryFailedAccounts={retryFailedAccounts}
      />

      {selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
        accountSummaryItems.length > 0 && (
          <AccountSummaryBar
            items={accountSummaryItems}
            activeAccountIds={allAccountsFilterAccountIds}
            onAccountClick={handleAccountSummaryClick}
          />
        )}

      {selectedAccount ? (
        <TokenSearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      ) : null}

      <TokenList
        isLoading={isLoading}
        tokens={tokens}
        filteredTokens={filteredTokens}
        visibleKeys={visibleKeys}
        resolvingVisibleKeys={resolvingVisibleKeys}
        getVisibleTokenKey={getVisibleTokenKey}
        toggleKeyVisibility={toggleKeyVisibility}
        copyKey={copyKey}
        handleEditToken={handleEditToken}
        handleDeleteToken={handleDeleteToken}
        handleAddToken={handleAddToken}
        onAddAccount={handleOpenAccountManagement}
        onRequestAccountSelection={handleRequestAccountSelection}
        selectedAccount={selectedAccount}
        displayData={displayData}
        currentAccountLoadError={currentAccountLoadError}
        onRetryCurrentAccount={
          selectedAccount &&
          selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
            ? () => void loadTokens(selectedAccount)
            : undefined
        }
        managedSiteTokenStatuses={managedSiteTokenStatuses}
        onManagedSiteImportSuccess={
          isManagedSiteChannelStatusSupported
            ? handleManagedSiteImportSuccess
            : undefined
        }
        onManagedSiteVerificationRetry={
          isManagedSiteChannelStatusSupported
            ? handleManagedSiteVerificationRetry
            : undefined
        }
        allAccountsFilterAccountIds={allAccountsFilterAccountIds}
      />

      <Footer />

      <AddTokenDialog
        isOpen={isAddTokenOpen}
        onClose={handleCloseAddToken}
        availableAccounts={displayData}
        preSelectedAccountId={addTokenPreSelectedAccountId}
        editingToken={editingToken}
      />

      <RepairMissingKeysDialog
        isOpen={isRepairOpen}
        onClose={handleCloseRepairMissingKeys}
        accounts={displayData}
        startOnOpen={repairStartOnOpen}
      />

      <NewApiManagedVerificationDialog
        isOpen={verification.dialogState.isOpen}
        step={verification.dialogState.step}
        request={verification.dialogState.request}
        code={verification.dialogState.code}
        errorMessage={verification.dialogState.errorMessage}
        isBusy={verification.dialogState.isBusy}
        busyMessage={verification.dialogState.busyMessage}
        onCodeChange={verification.setCode}
        onClose={verification.closeDialog}
        onSubmit={verification.submitCode}
        onRetry={verification.retryVerification}
        onOpenSite={verification.openBaseUrl}
        onUpdateRequestConfig={verification.patchRequestConfig}
      />
    </div>
  )
}
