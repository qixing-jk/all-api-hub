import type { TFunction } from "i18next"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useApiCredentialProfileLinks } from "~/features/ApiCredentialProfiles/associations/useApiCredentialProfileLinks"
import { useApiCredentialProfiles } from "~/features/ApiCredentialProfiles/workspace/useApiCredentialProfiles"
import { useKeyCredentialAssociations } from "~/features/KeyManagement/associations/useKeyCredentialAssociations"
import {
  KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
  KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES,
  KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS,
  KEY_MANAGEMENT_ROUTE_PARAMS,
  type KeyManagementAssociationTargetState,
} from "~/features/KeyManagement/constants"
import { useKeyManagement } from "~/features/KeyManagement/inventory/useKeyManagement"
import { useKeyManagementInventoryPresentation } from "~/features/KeyManagement/inventory/useKeyManagementInventoryPresentation"
import { useKeyManagementManagedSiteActions } from "~/features/KeyManagement/managedSite/useKeyManagementManagedSiteActions"
import { useManagedSiteKeyStatuses } from "~/features/KeyManagement/managedSite/useManagedSiteKeyStatuses"
import { useKeyManagementRouteCoordinator } from "~/features/KeyManagement/workspace/useKeyManagementRouteCoordinator"
import { useNewApiManagedVerification } from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import { buildOneTimeApiKeyProfileSaveAction } from "~/features/TokenProvisioning/utils/apiCredentialProfileSaveAction"
import {
  AccountKeyRepairMessageTypes,
  sendAccountKeyRepairMessage,
} from "~/services/accounts/accountKeyAutoProvisioning/messaging"
import { canCreateAccountKeyResources } from "~/services/accounts/keys/keyProductCapabilities"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { hasValidManagedSiteConfig } from "~/services/managedSites/configuration/runtimeConfig"
import {
  MODEL_LIST_ACCOUNT_SOURCE_ROUTES,
  resolveModelListAccountSourceReadiness,
} from "~/services/modelList/accountSources/readiness"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import { ACCOUNT_KEY_REPAIR_JOB_STATES } from "~/types/accountKeyAutoProvisioning"
import { createLogger } from "~/utils/core/logger"
import { openModelsPage } from "~/utils/navigation"
import { pushWithinOptionsPage } from "~/utils/navigation/optionsPage"

const logger = createLogger("KeyManagement")
/** Maps association lookup state to its localized status message. */
const getAssociationTargetStatusMessage = (
  state: KeyManagementAssociationTargetState,
  t: TFunction,
) => {
  switch (state) {
    case KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Loading:
      return t("keyManagement:credentialAssociation.target.loading")
    case KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Locating:
      return t("keyManagement:credentialAssociation.target.locating")
    case KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Found:
      return t("keyManagement:credentialAssociation.target.found")
    case KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Missing:
      return t("keyManagement:credentialAssociation.target.missing")
    case KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.NeedsConfirmation:
      return t("keyManagement:credentialAssociation.target.needsConfirmation")
    case KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Unavailable:
      return t("keyManagement:credentialAssociation.target.unavailable")
  }
}

/** Owns key scope availability, inventory refresh and association route feedback. */
export function useKeyManagementViewModel(
  routeParams?: Record<string, string>,
) {
  const { t } = useTranslation([
    "keyManagement",
    "common",
    "apiCredentialProfiles",
  ])
  const [isRepairOpen, setIsRepairOpen] = useState(false)
  const [isAddTokenOpen, setIsAddTokenOpen] = useState(false)
  const [repairStartOnOpen, setRepairStartOnOpen] = useState(false)
  const [isAccountSelectorOpen, setIsAccountSelectorOpen] = useState(false)
  const verification = useNewApiManagedVerification()
  const {
    preferences,
    managedSiteType,
    newApiBaseUrl,
    newApiUserId,
    newApiUsername,
    newApiPassword,
    newApiTotpSecret,
  } = useUserPreferencesContext()
  const isManagedSiteConfigComplete = hasValidManagedSiteConfig(
    preferences,
    managedSiteType,
  )

  const credentialInventory = useKeyManagement(routeParams)
  const {
    displayData,
    selectedAccount,
    searchTerm,
    isLoading,
    currentAccountLoadError,
    currentAccountUnsupportedKeyManagement,
    allAccountsFilterAccountIds,
    refreshServiceCredentials,
    entries,
    filteredEntries,
    copyServiceCredential,
    rotateServiceCredential,
  } = credentialInventory
  const {
    links: credentialProfileLinks,
    isLoading: areCredentialProfileLinksLoading,
    error: credentialProfileLinksError,
    reload: reloadCredentialProfileLinks,
  } = useApiCredentialProfileLinks()
  const {
    profiles: credentialProfiles,
    isLoading: areCredentialProfilesLoading,
  } = useApiCredentialProfiles()
  const credentialAssociations = useKeyCredentialAssociations({
    links: credentialProfileLinks,
    profiles: credentialProfiles,
    reloadLinks: reloadCredentialProfileLinks,
  })
  const {
    nativeKeys,
    routeAssociationId,
    requestedAssociation,
    associationNeedsConfirmation,
    associationTarget,
    associationTargetStatus,
    setAssociationTargetStatus,
    handleAccountSummaryClick,
    handleSelectedAccountChange,
    clearAssociationTarget,
    handleSearchTermChange,
  } = useKeyManagementRouteCoordinator({
    routeParams,
    credentialProfileLinks,
    inventory: credentialInventory,
  })

  const getProfileForLocator = credentialAssociations.getProfileForLocator
  const {
    managedRuntimeKeys,
    allNativeRows,
    nativeRows,
    combinedAccountSummaryItems,
    combinedFailedAccounts,
    combinedTokenLoadProgress,
    aggregateCounts,
    retryCombinedFailedAccounts,
    nativeInventoryLoadError,
    isNativeInventoryLoading,
  } = useKeyManagementInventoryPresentation({
    nativeKeys,
    credentialInventory,
    getProfileForLocator,
  })
  const {
    states: managedSiteTokenStatuses,
    supported: isManagedSiteChannelStatusSupported,
    refreshing: isManagedSiteStatusRefreshing,
    refresh: refreshManagedSiteTokenStatuses,
    refreshKey: refreshManagedSiteTokenStatusForToken,
    confirm: confirmManagedSiteTokenStatusWithChannelKey,
  } = useManagedSiteKeyStatuses(managedRuntimeKeys)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const response = await sendAccountKeyRepairMessage(
          AccountKeyRepairMessageTypes.GetProgress,
        )

        if (cancelled) return
        if (!response?.success || !response?.data) return

        if (response.data.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Running) {
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
    setRepairStartOnOpen(false)
    setIsRepairOpen(true)
  }

  const handleCloseRepairMissingKeys = () => {
    setIsRepairOpen(false)
    setRepairStartOnOpen(false)
  }

  const handleOpenAccountManagement = useCallback(() => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.ACCOUNT}`)
  }, [])

  const handleOpenSelectedAccountModels = useCallback(() => {
    void openModelsPage(selectedAccount)
  }, [selectedAccount])

  const handleRefreshTokens = useCallback(
    async (accountId?: string) => {
      const targetAccountId = accountId ?? selectedAccount
      if (!targetAccountId) return

      if (
        targetAccountId &&
        targetAccountId !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
      ) {
        const account = displayData.find(
          (candidate) => candidate.id === targetAccountId,
        )
        if (
          account &&
          getSiteTypeCapabilities(account.siteType).account
            ?.keyResourceManagement
        ) {
          await nativeKeys.refresh()
          return
        }
      }
      const credentialRefresh = withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
        PROTECTION_BYPASS_SURFACES.Options,
        async (protectionBypassExecution) => {
          await refreshServiceCredentials(accountId, {
            protectionBypassExecution,
          })
        },
      )
      if (targetAccountId === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE) {
        await Promise.allSettled([credentialRefresh, nativeKeys.refresh()])
        return
      }
      await credentialRefresh
    },
    [displayData, refreshServiceCredentials, nativeKeys, selectedAccount],
  )

  const {
    handleRefreshManagedSiteStatuses,
    handleManagedSiteVerificationRetry,
    handleManagedSiteImportSuccess,
  } = useKeyManagementManagedSiteActions({
    managedSiteType,
    newApiBaseUrl,
    newApiUserId,
    newApiUsername,
    newApiPassword,
    newApiTotpSecret,
    verification,
    refreshManagedSiteTokenStatuses,
    refreshManagedSiteTokenStatusForToken,
    confirmManagedSiteTokenStatusWithChannelKey,
  })

  const addTokenAvailableAccounts = useMemo(
    () => displayData.filter(canCreateAccountKeyResources),
    [displayData],
  )

  const singleFilteredAllAccountsAccount =
    selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
    allAccountsFilterAccountIds.length === 1
      ? displayData.find(
          (account) => account.id === allAccountsFilterAccountIds[0],
        ) ?? null
      : null

  const selectedAddTokenScopeAccount =
    selectedAccount && selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
      ? displayData.find((account) => account.id === selectedAccount) ?? null
      : singleFilteredAllAccountsAccount

  const canCreateTokensInCurrentScope = selectedAddTokenScopeAccount
    ? canCreateAccountKeyResources(selectedAddTokenScopeAccount)
    : selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
      ? addTokenAvailableAccounts.length > 0
      : false

  const isSelectedNativeKeyAccount =
    selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
    Boolean(
      selectedAddTokenScopeAccount &&
        getSiteTypeCapabilities(selectedAddTokenScopeAccount.siteType).account
          ?.keyResourceManagement,
    )
  const canOpenSelectedAccountModels = Boolean(
    selectedAddTokenScopeAccount &&
      resolveModelListAccountSourceReadiness(selectedAddTokenScopeAccount)
        .route !== MODEL_LIST_ACCOUNT_SOURCE_ROUTES.Unsupported,
  )
  const canCreateNativeKey =
    isSelectedNativeKeyAccount &&
    nativeKeys.selectedScope !== null &&
    !nativeKeys.isLoading &&
    !nativeKeys.freshReadRequired
  const canCreateKeyInCurrentScope = isSelectedNativeKeyAccount
    ? canCreateNativeKey
    : canCreateTokensInCurrentScope
  const addTokenDisabledReason = !selectedAccount
    ? t("keyManagement:selectAccountToContinue")
    : selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
        addTokenAvailableAccounts.length === 0
      ? t("keyManagement:noAccountsSupportKeyCreation")
      : selectedAddTokenScopeAccount &&
          !isSelectedNativeKeyAccount &&
          !canCreateTokensInCurrentScope
        ? t("keyManagement:dialog.createNotSupported")
        : undefined

  const handleRequestAddToken = useCallback(() => {
    if (isSelectedNativeKeyAccount) {
      if (canCreateNativeKey) void nativeKeys.openCreate()
      return
    }
    if (!canCreateTokensInCurrentScope) {
      return
    }

    setIsAddTokenOpen(true)
  }, [
    canCreateNativeKey,
    canCreateTokensInCurrentScope,
    isSelectedNativeKeyAccount,
    nativeKeys,
  ])

  const addTokenPreSelectedAccountId =
    selectedAddTokenScopeAccount &&
    canCreateAccountKeyResources(selectedAddTokenScopeAccount)
      ? selectedAddTokenScopeAccount.id
      : null

  const routeGuidedImport =
    routeParams?.[KEY_MANAGEMENT_ROUTE_PARAMS.GuidedImport]
  const routeGuidedImportAccountId = routeParams?.accountId
  const routeGuidedImportTokenId =
    routeParams?.[KEY_MANAGEMENT_ROUTE_PARAMS.TokenId]
  const guidedManagedSiteImport = useMemo(() => {
    if (
      routeGuidedImport !== KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS.ManagedSite
    ) {
      return undefined
    }

    return {
      accountId: routeGuidedImportAccountId,
      tokenId: routeGuidedImportTokenId,
      request: [
        routeGuidedImport,
        routeGuidedImportAccountId ?? "",
        routeGuidedImportTokenId ?? "",
      ].join(":"),
    }
  }, [routeGuidedImport, routeGuidedImportAccountId, routeGuidedImportTokenId])
  const nativeOneTimeSaveAction = nativeKeys.createdSecret
    ? buildOneTimeApiKeyProfileSaveAction({
        result: nativeKeys.createdSecret,
        t,
        logger,
        source: "KeyManagementNativeResource",
      })
    : undefined
  const isAssociationTargetInventoryLoading =
    isLoading || isNativeInventoryLoading
  const associationRouteState: KeyManagementAssociationTargetState | null =
    !routeAssociationId
      ? null
      : areCredentialProfileLinksLoading
        ? KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Loading
        : credentialProfileLinksError
          ? KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Unavailable
          : !requestedAssociation
            ? KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Missing
            : currentAccountLoadError || nativeInventoryLoadError
              ? KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Unavailable
              : associationNeedsConfirmation
                ? KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.NeedsConfirmation
                : isAssociationTargetInventoryLoading
                  ? KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Locating
                  : associationTargetStatus
  const associationTargetStatusMessage = associationRouteState
    ? getAssociationTargetStatusMessage(associationRouteState, t)
    : ""
  const isAssociationRoutePending =
    associationRouteState ===
      KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Loading ||
    associationRouteState === KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Locating
  const isAssociationRouteUnavailable =
    associationRouteState ===
    KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Unavailable
  const canClearAssociationRoute =
    associationRouteState ===
      KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Missing ||
    associationRouteState ===
      KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.NeedsConfirmation
  const showAssociationRouteNotice =
    associationRouteState !== null &&
    associationRouteState !== KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Found

  // The view consumes availability facts without coordinating both inventories.
  const headerState = {
    isLoading: isLoading || nativeKeys.isLoading || !selectedAccount,
    isAddTokenDisabled: isSelectedNativeKeyAccount
      ? !canCreateNativeKey
      : !canCreateTokensInCurrentScope,
    isManagedSiteStatusRefreshDisabled:
      !selectedAccount ||
      managedRuntimeKeys.length === 0 ||
      isLoading ||
      nativeKeys.isLoading,
    onOpenSelectedAccountModels:
      selectedAccount &&
      canOpenSelectedAccountModels &&
      selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
        ? handleOpenSelectedAccountModels
        : undefined,
  }
  return {
    headerState,
    isRepairOpen,
    isAddTokenOpen,
    setIsAddTokenOpen,
    repairStartOnOpen,
    isAccountSelectorOpen,
    setIsAccountSelectorOpen,
    verification,
    isManagedSiteConfigComplete,
    displayData,
    selectedAccount,
    searchTerm,
    isLoading,
    currentAccountLoadError,
    currentAccountUnsupportedKeyManagement,
    allAccountsFilterAccountIds,
    entries,
    filteredEntries,
    copyServiceCredential,
    rotateServiceCredential,
    credentialProfileLinks,
    areCredentialProfileLinksLoading,
    credentialProfileLinksError,
    reloadCredentialProfileLinks,
    credentialProfiles,
    areCredentialProfilesLoading,
    credentialAssociations,
    nativeKeys,
    routeAssociationId,
    associationTarget,
    setAssociationTargetStatus,
    handleAccountSummaryClick,
    handleSelectedAccountChange,
    clearAssociationTarget,
    handleSearchTermChange,
    getProfileForLocator,
    allNativeRows,
    nativeRows,
    combinedAccountSummaryItems,
    combinedFailedAccounts,
    combinedTokenLoadProgress,
    aggregateCounts,
    retryCombinedFailedAccounts,
    nativeInventoryLoadError,
    isNativeInventoryLoading,
    managedSiteTokenStatuses,
    isManagedSiteChannelStatusSupported,
    isManagedSiteStatusRefreshing,
    handleRepairMissingKeys,
    handleCloseRepairMissingKeys,
    handleOpenAccountManagement,
    handleRefreshTokens,
    handleRefreshManagedSiteStatuses,
    handleManagedSiteVerificationRetry,
    handleManagedSiteImportSuccess,
    addTokenAvailableAccounts,
    selectedAddTokenScopeAccount,
    isSelectedNativeKeyAccount,
    canCreateKeyInCurrentScope,
    addTokenDisabledReason,
    handleRequestAddToken,
    addTokenPreSelectedAccountId,
    guidedManagedSiteImport,
    nativeOneTimeSaveAction,
    associationTargetStatusMessage,
    isAssociationRoutePending,
    isAssociationRouteUnavailable,
    canClearAssociationRoute,
    showAssociationRouteNotice,
  }
}
