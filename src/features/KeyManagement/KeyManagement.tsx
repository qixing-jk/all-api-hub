import type { TFunction } from "i18next"
import { RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  ConfirmDialog,
  Notice,
  NoticeActionButton,
  SearchableSelect,
} from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useApiCredentialProfiles } from "~/features/ApiCredentialProfiles/hooks/useApiCredentialProfiles"
import { loadNewApiChannelKeyWithVerification } from "~/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification"
import { NewApiManagedVerificationDialog } from "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog"
import { useNewApiManagedVerification } from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import AddTokenDialog from "~/features/TokenProvisioning/components/AddTokenDialog"
import { OneTimeSecretDialog } from "~/features/TokenProvisioning/components/OneTimeSecretDialog"
import { buildOneTimeApiKeyProfileSaveAction } from "~/features/TokenProvisioning/utils/apiCredentialProfileSaveAction"
import { useApiCredentialProfileLinks } from "~/hooks/useApiCredentialProfileLinks"
import {
  AccountKeyRepairMessageTypes,
  sendAccountKeyRepairMessage,
} from "~/services/accounts/accountKeyAutoProvisioning/messaging"
import {
  ACCOUNT_RUNTIME_KEY_SOURCES,
  buildAccountKeyResourceRuntimeKeyFromFacts,
  getAccountRuntimeKeyLocatorAccountId,
  hasUsableAccountRuntimeKeySecret,
  type AccountRuntimeKey,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/accountRuntimeKeys"
import {
  canCreateAccountKeyResources,
  supportsRecoverableAccountRuntimeKeySecrets,
} from "~/services/accounts/keyProductCapabilities"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  type AccountKeyResourceFacts,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { MANAGED_RESOURCE_SECRET_VERIFICATION_KINDS } from "~/services/apiAdapters/contracts/managedResourceMatching"
import {
  getManagedSiteCapabilities,
  getSiteTypeCapabilities,
} from "~/services/apiAdapters/registry"
import { getRecoverableManagedSiteChannelCandidate } from "~/services/managedSites/channelMatch"
import { hasValidManagedSiteConfig } from "~/services/managedSites/runtimeConfig"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  type ManagedSiteTokenChannelStatus,
} from "~/services/managedSites/tokenChannelStatus"
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
import type { ApiCredentialProfileLink } from "~/types/apiCredentialProfiles"
import { createLogger } from "~/utils/core/logger"
import {
  openApiCredentialProfilesPage,
  openModelsPage,
  openSettingsTab,
  pushWithinOptionsPage,
  replaceWithinOptionsPage,
} from "~/utils/navigation"

import { AccountKeyResourceEditorDialog } from "./components/AccountKeyResource/AccountKeyResourceEditorDialog"
import { AccountKeyScopeSelector } from "./components/AccountKeyResource/AccountKeyScopeSelector"
import { AccountSelectorPanel } from "./components/AccountSelectorPanel"
import { AccountSummaryBar } from "./components/AccountSummaryBar"
import { AssociateApiCredentialProfileDialog } from "./components/AssociateApiCredentialProfileDialog"
import { Footer } from "./components/Footer"
import { Header } from "./components/Header"
import {
  LinkedChannelCleanupOption,
  LinkedChannelCleanupPending,
} from "./components/LinkedChannelCleanup"
import { RepairMissingKeysDialog } from "./components/RepairMissingKeysDialog"
import { TokenList } from "./components/TokenList"
import { TokenSearchBar } from "./components/TokenSearchBar"
import {
  ACCOUNT_KEY_STATUS_FILTERS,
  KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
  KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES,
  KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS,
  KEY_MANAGEMENT_ROUTE_PARAMS,
  type KeyManagementAssociationTargetLookupState,
  type KeyManagementAssociationTargetState,
} from "./constants"
import {
  useAccountKeyResourceController,
  type AccountKeyResourceRouteTransition,
} from "./controllers/useAccountKeyResourceController"
import {
  getCredentialAssociationForLocator,
  KEY_CREDENTIAL_ASSOCIATION_STATES,
} from "./credentialAssociations"
import { useKeyCredentialAssociations } from "./hooks/useKeyCredentialAssociations"
import { useKeyManagement } from "./hooks/useKeyManagement"
import { useManagedSiteKeyStatuses } from "./hooks/useManagedSiteKeyStatuses"
import { getAccountKeyScopeMessages } from "./presentation/accountKeyResourcePresentation"
import { KEY_MANAGEMENT_TEST_IDS } from "./testIds"
import {
  KEY_MANAGEMENT_DISPLAY_ROW_KINDS,
  type KeyManagementAccountSummaryItem,
  type KeyManagementAggregateCounts,
  type NativeKeyManagementRow,
} from "./types"

const logger = createLogger("KeyManagement")

const nativeStatusOptions = (t: TFunction) => [
  {
    value: ACCOUNT_KEY_STATUS_FILTERS.All,
    label: t("keyManagement:native.status.all"),
  },
  {
    value: ACCOUNT_KEY_STATUS_FILTERS.Enabled,
    label: t("keyManagement:native.status.enabled"),
  },
  {
    value: ACCOUNT_KEY_STATUS_FILTERS.Disabled,
    label: t("keyManagement:native.status.disabled"),
  },
  {
    value: ACCOUNT_KEY_STATUS_FILTERS.Expired,
    label: t("keyManagement:native.status.expired"),
  },
  {
    value: ACCOUNT_KEY_STATUS_FILTERS.Unknown,
    label: t("keyManagement:native.status.unknown"),
  },
]

const getRouteSignature = (params?: Record<string, string | undefined>) =>
  JSON.stringify(
    Object.entries(params ?? {})
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  )

const getAssociationLocatorWorkspace = (locator: AccountRuntimeKeyLocator) =>
  locator.source === ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource
    ? locator.ref.scopeKey
    : undefined

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

const nativeDeleteFailureMessage = (code: string | undefined, t: TFunction) => {
  switch (code) {
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed:
      return t("keyManagement:native.delete.feedback.authenticationFailed")
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied:
      return t("keyManagement:native.delete.feedback.permissionDenied")
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable:
      return t("keyManagement:native.delete.feedback.unavailable")
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain:
      return t("keyManagement:native.delete.feedback.uncertain")
    default:
      return t("keyManagement:native.delete.feedback.error")
  }
}

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
  const { t } = useTranslation([
    "keyManagement",
    "common",
    "apiCredentialProfiles",
  ])
  const [isRepairOpen, setIsRepairOpen] = useState(false)
  const [isAddTokenOpen, setIsAddTokenOpen] = useState(false)
  const [repairStartOnOpen, setRepairStartOnOpen] = useState(false)
  const [isAccountSelectorOpen, setIsAccountSelectorOpen] = useState(false)
  const [nativeCleanupLinkedChannels, setNativeCleanupLinkedChannels] =
    useState(false)
  const accountSelectorTriggerRef = useRef<HTMLButtonElement>(null)
  const nativeRowKeysRef = useRef(new WeakMap<object, string>())
  const nextNativeRowKeyRef = useRef(0)
  const acknowledgedNativeRouteTransitionIdRef = useRef<string | null>(null)
  const routeAssociationId =
    routeParams?.[KEY_MANAGEMENT_ROUTE_PARAMS.AssociationId]
  const routeAccountId = routeParams?.[KEY_MANAGEMENT_ROUTE_PARAMS.AccountId]
  const routeWorkspace = routeParams?.[KEY_MANAGEMENT_ROUTE_PARAMS.Workspace]
  const associationNavigationActiveRef = useRef(Boolean(routeAssociationId))
  const [pendingNativeRoute, setPendingNativeRoute] = useState<{
    params: Record<string, string>
    transition: AccountKeyResourceRouteTransition
    sourceRouteSignature: string
  } | null>(null)
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

  const {
    displayData,
    selectedAccount,
    setSelectedAccount,
    searchTerm,
    setSearchTerm,
    isLoading,
    currentAccountLoadError,
    currentAccountUnsupportedKeyManagement,
    tokenLoadProgress,
    failedAccounts,
    accountSummaryItems,
    allAccountsFilterAccountIds,
    setAllAccountsFilterAccountIds,
    refreshServiceCredentials,
    entries,
    filteredEntries,
    copyServiceCredential,
    rotateServiceCredential,
    retryFailedAccounts,
  } = useKeyManagement(routeParams)
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
  const requestedAssociation = useMemo<ApiCredentialProfileLink | null>(
    () =>
      routeAssociationId
        ? credentialProfileLinks.find(
            (link) => link.id === routeAssociationId,
          ) ?? null
        : null,
    [credentialProfileLinks, routeAssociationId],
  )
  const associationNeedsConfirmation = useMemo(() => {
    if (!requestedAssociation) return null
    const association = getCredentialAssociationForLocator(
      credentialProfileLinks,
      requestedAssociation.locator,
    )
    return !(
      association.status === KEY_CREDENTIAL_ASSOCIATION_STATES.Linked &&
      association.associationId === requestedAssociation.id
    )
  }, [credentialProfileLinks, requestedAssociation])
  const associationTarget = requestedAssociation
  const [associationTargetStatus, setAssociationTargetStatus] =
    useState<KeyManagementAssociationTargetLookupState>(
      KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Locating,
    )

  useEffect(() => {
    associationNavigationActiveRef.current = Boolean(routeAssociationId)
    setAssociationTargetStatus(
      KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Locating,
    )
  }, [routeAssociationId])

  const routeSignature = getRouteSignature(routeParams)
  const routeTransition =
    pendingNativeRoute &&
    getRouteSignature(pendingNativeRoute.params) === routeSignature
      ? pendingNativeRoute.transition
      : undefined

  const nativeKeys = useAccountKeyResourceController({
    accounts: displayData,
    selectedAccount,
    routeParams,
    routeTransition,
    replaceRoute: (params, transition) => {
      const nextParams = { ...params }
      if (params[KEY_MANAGEMENT_ROUTE_PARAMS.AccountId] === routeAccountId) {
        for (const key of [
          KEY_MANAGEMENT_ROUTE_PARAMS.GuidedImport,
          KEY_MANAGEMENT_ROUTE_PARAMS.TokenId,
        ]) {
          const value = routeParams?.[key]
          if (value !== undefined) nextParams[key] = value
        }
      }
      if (associationNavigationActiveRef.current && routeAssociationId) {
        nextParams[KEY_MANAGEMENT_ROUTE_PARAMS.AssociationId] =
          routeAssociationId
      }
      if (transition) {
        const pending = {
          params: nextParams,
          transition,
          sourceRouteSignature: routeSignature,
        }
        acknowledgedNativeRouteTransitionIdRef.current = null
        setPendingNativeRoute(pending)
      } else {
        acknowledgedNativeRouteTransitionIdRef.current = null
        setPendingNativeRoute(null)
      }
      replaceWithinOptionsPage(`#${MENU_ITEM_IDS.KEYS}`, nextParams)
    },
  })

  const getProfileForLocator = credentialAssociations.getProfileForLocator
  const managedRuntimeKeys = useMemo(() => {
    const native = nativeKeys.allRows.flatMap((facts) => {
      const account = displayData.find(
        (candidate) => candidate.id === facts.ref.accountId,
      )
      if (
        !account ||
        (selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
          selectedAccount !== account.id)
      )
        return []
      if (
        selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
        allAccountsFilterAccountIds.length &&
        !allAccountsFilterAccountIds.includes(account.id)
      )
        return []
      if (
        selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
        nativeKeys.selectedScope?.scopeKey !== facts.ref.scopeKey
      )
        return []
      const profile = getProfileForLocator({
        source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
        ref: facts.ref,
      })
      return [
        buildAccountKeyResourceRuntimeKeyFromFacts(
          account,
          facts,
          profile?.apiKey ?? "",
        ),
      ]
    })
    return [...entries.map((entry) => entry.runtimeKey), ...native].filter(
      (key) =>
        supportsRecoverableAccountRuntimeKeySecrets(key.siteType) ||
        hasUsableAccountRuntimeKeySecret(key),
    )
  }, [
    nativeKeys.allRows,
    nativeKeys.selectedScope,
    displayData,
    selectedAccount,
    allAccountsFilterAccountIds,
    entries,
    getProfileForLocator,
  ])
  const {
    states: managedSiteTokenStatuses,
    supported: isManagedSiteChannelStatusSupported,
    refreshing: isManagedSiteStatusRefreshing,
    refresh: refreshManagedSiteTokenStatuses,
    refreshKey: refreshManagedSiteTokenStatusForToken,
    confirm: confirmManagedSiteTokenStatusWithChannelKey,
  } = useManagedSiteKeyStatuses(managedRuntimeKeys)

  useEffect(() => {
    if (!associationTarget) return

    const accountId = getAccountRuntimeKeyLocatorAccountId(
      associationTarget.locator,
    )
    const workspaceScopeKey = getAssociationLocatorWorkspace(
      associationTarget.locator,
    )
    // A reload temporarily clears the scope inventory. Retain this account's
    // route until its scope can be resolved, so navigation cannot replay loading.
    const workspace =
      (selectedAccount === accountId
        ? nativeKeys.scopes.find(
            (scope) => scope.scopeKey === workspaceScopeKey,
          )?.routeKey
        : undefined) ??
      (routeAccountId === accountId ? routeWorkspace : undefined)
    const nextParams = {
      [KEY_MANAGEMENT_ROUTE_PARAMS.AssociationId]: associationTarget.id,
      [KEY_MANAGEMENT_ROUTE_PARAMS.AccountId]: accountId,
      ...(workspace
        ? { [KEY_MANAGEMENT_ROUTE_PARAMS.Workspace]: workspace }
        : {}),
    }

    setSearchTerm("")
    setAllAccountsFilterAccountIds([])
    setSelectedAccount(accountId)
    if (getRouteSignature(nextParams) !== routeSignature) {
      replaceWithinOptionsPage(`#${MENU_ITEM_IDS.KEYS}`, nextParams)
    }
  }, [
    associationTarget,
    nativeKeys.scopes,
    routeAccountId,
    routeSignature,
    routeWorkspace,
    selectedAccount,
    setAllAccountsFilterAccountIds,
    setSearchTerm,
    setSelectedAccount,
  ])

  const setNativeSearch = nativeKeys.setSearch
  useEffect(() => {
    setNativeSearch(searchTerm)
  }, [searchTerm, setNativeSearch])

  useEffect(() => {
    if (!pendingNativeRoute) return
    if (routeTransition) {
      acknowledgedNativeRouteTransitionIdRef.current = routeTransition.id
      return
    }
    if (
      acknowledgedNativeRouteTransitionIdRef.current ===
        pendingNativeRoute.transition.id ||
      routeSignature !== pendingNativeRoute.sourceRouteSignature
    ) {
      acknowledgedNativeRouteTransitionIdRef.current = null
      setPendingNativeRoute(null)
    }
  }, [pendingNativeRoute, routeSignature, routeTransition])

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

  const handleAccountSummaryClick = (accountId: string) => {
    associationNavigationActiveRef.current = false
    if (routeAssociationId) {
      replaceWithinOptionsPage(
        `#${MENU_ITEM_IDS.KEYS}`,
        selectedAccount ? { accountId: selectedAccount } : undefined,
      )
    }
    setAllAccountsFilterAccountIds((currentAccountIds) =>
      currentAccountIds.includes(accountId)
        ? currentAccountIds.filter((id) => id !== accountId)
        : [...currentAccountIds, accountId],
    )
  }

  const handleOpenAccountManagement = useCallback(() => {
    pushWithinOptionsPage(`#${MENU_ITEM_IDS.ACCOUNT}`)
  }, [])

  const handleOpenSelectedAccountModels = useCallback(() => {
    void openModelsPage(selectedAccount)
  }, [selectedAccount])

  const handleSelectedAccountChange = useCallback(
    (accountId: string) => {
      associationNavigationActiveRef.current = false
      setSelectedAccount(accountId)
      acknowledgedNativeRouteTransitionIdRef.current = null
      setPendingNativeRoute(null)
      replaceWithinOptionsPage(
        `#${MENU_ITEM_IDS.KEYS}`,
        accountId ? { accountId } : undefined,
      )
    },
    [setSelectedAccount],
  )

  const clearAssociationTarget = useCallback(() => {
    associationNavigationActiveRef.current = false
    replaceWithinOptionsPage(
      `#${MENU_ITEM_IDS.KEYS}`,
      selectedAccount ? { accountId: selectedAccount } : undefined,
    )
  }, [selectedAccount])

  const handleSearchTermChange = useCallback(
    (value: string) => {
      if (routeAssociationId) clearAssociationTarget()
      setSearchTerm(value)
    },
    [clearAssociationTarget, routeAssociationId, setSearchTerm],
  )

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

  const handleRefreshManagedSiteStatuses = useCallback(async () => {
    await withProtectionBypassUserCommand(
      PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
      PROTECTION_BYPASS_SURFACES.Options,
      async (protectionBypassExecution) => {
        await refreshManagedSiteTokenStatuses({
          protectionBypassExecution,
        })
      },
    )
  }, [refreshManagedSiteTokenStatuses])

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
    runtimeKey: AccountRuntimeKey,
    managedSiteStatus: ManagedSiteTokenChannelStatus,
  ) => {
    if (
      getManagedSiteCapabilities(managedSiteType).matching.secretVerification
        ?.kind !== MANAGED_RESOURCE_SECRET_VERIFICATION_KINDS.NEW_API_SESSION
    ) {
      return
    }

    const candidateChannel =
      getRecoverableNewApiCandidateChannel(managedSiteStatus)

    if (candidateChannel) {
      const resourceRef = candidateChannel.ref
      let resolvedChannelKey = ""

      await loadNewApiChannelKeyWithVerification({
        resourceRef,
        command: PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
        label: runtimeKey.label,
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
          await confirmManagedSiteTokenStatusWithChannelKey(
            runtimeKey,
            managedSiteStatus,
            {
              resourceRef,
              channelKey: resolvedChannelKey,
            },
          )
        },
        openVerification: verification.openNewApiManagedVerification,
      })
      return
    }

    const refreshedStatus =
      (await withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
        PROTECTION_BYPASS_SURFACES.Options,
        async (protectionBypassExecution) =>
          await refreshManagedSiteTokenStatusForToken(runtimeKey, {
            protectionBypassExecution,
          }),
      )) ?? managedSiteStatus

    if (!canRetryNewApiManagedVerification(refreshedStatus)) {
      return
    }

    const refreshedCandidateChannel =
      getRecoverableNewApiCandidateChannel(refreshedStatus)
    if (!refreshedCandidateChannel) {
      return
    }

    verification.openNewApiManagedVerification({
      kind: "token",
      label: runtimeKey.label,
      config: {
        baseUrl: newApiBaseUrl,
        userId: newApiUserId,
        username: newApiUsername,
        password: newApiPassword,
        totpSecret: newApiTotpSecret,
      },
      onVerified: async () => {
        await withProtectionBypassUserCommand(
          PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
          PROTECTION_BYPASS_SURFACES.Options,
          async (protectionBypassExecution) => {
            await refreshManagedSiteTokenStatusForToken(runtimeKey, {
              protectionBypassExecution,
            })
          },
        )
      },
    })
  }

  const handleManagedSiteImportSuccess = async (
    runtimeKey: AccountRuntimeKey,
  ) => {
    await refreshManagedSiteTokenStatusForToken(runtimeKey)
  }

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
  const { getResourceScope } = nativeKeys
  const toNativeRows = useCallback(
    (factsList: readonly AccountKeyResourceFacts[]): NativeKeyManagementRow[] =>
      factsList.map((facts) => {
        let rowKey = nativeRowKeysRef.current.get(facts)
        if (!rowKey) {
          rowKey = `native-row-${++nextNativeRowKeyRef.current}`
          nativeRowKeysRef.current.set(facts, rowKey)
        }
        const account = displayData.find(
          (candidate) => candidate.id === facts.ref.accountId,
        )
        const scope = getResourceScope(facts.ref)
        return {
          kind: KEY_MANAGEMENT_DISPLAY_ROW_KINDS.AccountKeyResource,
          rowKey,
          accountId: facts.ref.accountId,
          accountName: account?.name ?? t("keyManagement:native.missing"),
          scopeName: scope?.displayName ?? t("keyManagement:native.missing"),
          facts,
        }
      }),
    [displayData, getResourceScope, t],
  )
  const allNativeRows = useMemo(
    () => toNativeRows(nativeKeys.allRows),
    [nativeKeys.allRows, toNativeRows],
  )
  const nativeUnfilteredRows = useMemo(
    () =>
      allNativeRows.filter(
        (row) =>
          selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE ||
          allAccountsFilterAccountIds.length === 0 ||
          allAccountsFilterAccountIds.includes(row.accountId),
      ),
    [allAccountsFilterAccountIds, allNativeRows, selectedAccount],
  )
  const nativeRows = useMemo(
    () =>
      toNativeRows(nativeKeys.rows).filter(
        (row) =>
          selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE ||
          allAccountsFilterAccountIds.length === 0 ||
          allAccountsFilterAccountIds.includes(row.accountId),
      ),
    [
      allAccountsFilterAccountIds,
      nativeKeys.rows,
      selectedAccount,
      toNativeRows,
    ],
  )
  const nativeDeleteFacts = nativeKeys.deleteState.ref
    ? nativeKeys.allRows.find(
        (facts) =>
          facts.ref.accountId === nativeKeys.deleteState.ref?.accountId &&
          facts.ref.scopeKey === nativeKeys.deleteState.ref?.scopeKey &&
          facts.ref.resourceId === nativeKeys.deleteState.ref?.resourceId,
      )
    : null
  const nativeOneTimeSaveAction = nativeKeys.createdSecret
    ? buildOneTimeApiKeyProfileSaveAction({
        result: nativeKeys.createdSecret,
        t,
        logger,
        source: "KeyManagementNativeResource",
      })
    : undefined
  const nativeDeleteIsUncertain =
    nativeKeys.deleteState.failure?.code ===
    ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
  const combinedAccountSummaryItems = useMemo(() => {
    const nativeCountByAccount = new Map<string, number>()
    for (const facts of nativeKeys.rows) {
      nativeCountByAccount.set(
        facts.ref.accountId,
        (nativeCountByAccount.get(facts.ref.accountId) ?? 0) + 1,
      )
    }
    const itemByAccount = new Map<string, KeyManagementAccountSummaryItem>(
      accountSummaryItems.map((item) => [item.accountId, item]),
    )
    const settledNativeAccountIds = new Set(nativeKeys.settledAccountIds)
    for (const account of displayData) {
      const isNativeAccount = Boolean(
        getSiteTypeCapabilities(account.siteType).account
          ?.keyResourceManagement,
      )
      if (!isNativeAccount) continue
      const nativeCount = nativeCountByAccount.get(account.id) ?? 0
      const hasLoadFailure = Boolean(nativeKeys.failures[account.id])
      const hasCompleteCount =
        settledNativeAccountIds.has(account.id) && !hasLoadFailure
      itemByAccount.set(account.id, {
        accountId: account.id,
        name: account.name,
        count: hasCompleteCount ? nativeCount : null,
        ...(!hasCompleteCount && nativeCount > 0
          ? { knownCount: nativeCount }
          : {}),
        ...(hasLoadFailure ? { errorType: "load-failed" as const } : {}),
      })
    }
    return [...itemByAccount.values()]
  }, [
    accountSummaryItems,
    displayData,
    nativeKeys.failures,
    nativeKeys.settledAccountIds,
    nativeKeys.rows,
  ])
  const combinedFailedAccounts = useMemo(() => {
    const merged = new Map(failedAccounts.map((item) => [item.accountId, item]))
    for (const [accountId] of Object.entries(nativeKeys.failures)) {
      const account = displayData.find(
        (candidate) => candidate.id === accountId,
      )
      if (account)
        merged.set(accountId, { accountId, accountName: account.name })
    }
    return [...merged.values()]
  }, [displayData, failedAccounts, nativeKeys.failures])
  const combinedTokenLoadProgress = useMemo(
    () =>
      tokenLoadProgress
        ? {
            total: tokenLoadProgress.total + nativeKeys.progress.total,
            loaded: tokenLoadProgress.loaded + nativeKeys.progress.loaded,
            loading: tokenLoadProgress.loading + nativeKeys.progress.loading,
            error: tokenLoadProgress.error + nativeKeys.progress.error,
          }
        : nativeKeys.progress.total > 0
          ? nativeKeys.progress
          : null,
    [nativeKeys.progress, tokenLoadProgress],
  )
  const aggregateCounts = useMemo((): KeyManagementAggregateCounts => {
    const scopedEntries = entries.filter(
      (entry) =>
        selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE ||
        !allAccountsFilterAccountIds.length ||
        allAccountsFilterAccountIds.includes(entry.runtimeKey.accountId),
    )
    const knownTotal = scopedEntries.length + nativeUnfilteredRows.length
    const knownEnabled =
      scopedEntries.filter((entry) => entry.runtimeKey.status === "active")
        .length +
      nativeUnfilteredRows.filter((row) => row.facts.status === "enabled")
        .length
    const knownShowing = filteredEntries.length + nativeRows.length
    const includedAccountIds =
      selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
        ? allAccountsFilterAccountIds.length > 0
          ? new Set(allAccountsFilterAccountIds)
          : null
        : selectedAccount
          ? new Set([selectedAccount])
          : new Set<string>()
    const isIncluded = (accountId: string) =>
      includedAccountIds === null || includedAccountIds.has(accountId)
    const includedAccounts = displayData.filter((account) =>
      isIncluded(account.id),
    )
    const hasIncludedNativeAccount = includedAccounts.some((account) =>
      Boolean(
        getSiteTypeCapabilities(account.siteType).account
          ?.keyResourceManagement,
      ),
    )
    const hasIncludedCredentialAccount = includedAccounts.some(
      (account) =>
        !getSiteTypeCapabilities(account.siteType).account
          ?.keyResourceManagement,
    )
    const hasUnknownCount =
      (nativeKeys.isLoading && hasIncludedNativeAccount) ||
      (isLoading && hasIncludedCredentialAccount) ||
      Object.keys(nativeKeys.failures).some(isIncluded) ||
      failedAccounts.some((account) => isIncluded(account.accountId)) ||
      (selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
        hasIncludedCredentialAccount &&
        Boolean(currentAccountLoadError))

    return {
      total: hasUnknownCount ? null : knownTotal,
      enabled: hasUnknownCount ? null : knownEnabled,
      showing: hasUnknownCount ? null : knownShowing,
      knownTotal,
      knownEnabled,
      knownShowing,
    }
  }, [
    allAccountsFilterAccountIds,
    currentAccountLoadError,
    displayData,
    failedAccounts,
    filteredEntries.length,
    isLoading,
    nativeKeys.failures,
    nativeKeys.isLoading,
    nativeRows.length,
    nativeUnfilteredRows,
    selectedAccount,
    entries,
  ])
  const retryCombinedFailedAccounts = useCallback(() => {
    retryFailedAccounts()
    void nativeKeys.refresh()
  }, [nativeKeys, retryFailedAccounts])
  const nativeInventoryLoadError =
    selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
      ? Object.keys(nativeKeys.failures).length > 0
        ? t("keyManagement:messages.loadFailed")
        : undefined
      : selectedAccount && nativeKeys.failures[selectedAccount]
        ? t("keyManagement:messages.loadFailed")
        : undefined
  const isNativeInventoryLoading =
    nativeKeys.isLoading || nativeKeys.isScopeInventoryLoading
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

  return (
    <div className="p-6">
      <Header
        onAddToken={handleRequestAddToken}
        onRepairMissingKeys={handleRepairMissingKeys}
        onRefresh={handleRefreshTokens}
        onOpenSelectedAccountModels={
          selectedAccount &&
          canOpenSelectedAccountModels &&
          selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
            ? handleOpenSelectedAccountModels
            : undefined
        }
        onRefreshManagedSiteStatus={
          isManagedSiteChannelStatusSupported
            ? () => void handleRefreshManagedSiteStatuses()
            : undefined
        }
        managedSiteStatusHint={
          !isManagedSiteChannelStatusSupported
            ? t("managedSiteStatus.pageUnsupported")
            : undefined
        }
        selectedAccount={selectedAccount}
        isLoading={isLoading || nativeKeys.isLoading || !selectedAccount}
        isManagedSiteStatusRefreshing={isManagedSiteStatusRefreshing}
        isAddTokenDisabled={
          isSelectedNativeKeyAccount
            ? !canCreateNativeKey
            : !canCreateTokensInCurrentScope
        }
        addTokenDisabledReason={addTokenDisabledReason}
        isRepairDisabled={displayData.length === 0}
        isManagedSiteStatusRefreshDisabled={
          !selectedAccount ||
          managedRuntimeKeys.length === 0 ||
          isLoading ||
          nativeKeys.isLoading
        }
      />

      <LinkedChannelCleanupPending />
      {routeAssociationId ? (
        <div className="sr-only" role="status" aria-live="polite">
          {associationTargetStatusMessage}
        </div>
      ) : null}

      {showAssociationRouteNotice ? (
        <Notice
          tone={isAssociationRoutePending ? "info" : "warning"}
          className="mb-4"
          description={
            <span>
              {associationTargetStatusMessage}{" "}
              {isAssociationRouteUnavailable ? (
                <NoticeActionButton
                  onClick={() => {
                    void reloadCredentialProfileLinks()
                    void handleRefreshTokens()
                  }}
                >
                  {t("keyManagement:credentialAssociation.target.retry")}
                </NoticeActionButton>
              ) : canClearAssociationRoute ? (
                <NoticeActionButton onClick={clearAssociationTarget}>
                  {t("keyManagement:credentialAssociation.target.clear")}
                </NoticeActionButton>
              ) : null}
            </span>
          }
        />
      ) : null}

      <AccountSelectorPanel
        selectedAccount={selectedAccount}
        setSelectedAccount={handleSelectedAccountChange}
        displayData={displayData}
        selectorOpen={isAccountSelectorOpen}
        onSelectorOpenChange={setIsAccountSelectorOpen}
        selectorTriggerRef={accountSelectorTriggerRef}
        tokenLoadProgress={combinedTokenLoadProgress}
        failedAccounts={combinedFailedAccounts}
        onRetryFailedAccounts={retryCombinedFailedAccounts}
        aggregateCounts={aggregateCounts}
      />

      {isSelectedNativeKeyAccount ? (
        <div className="mb-4 space-y-3">
          <AccountKeyScopeSelector
            siteType={selectedAddTokenScopeAccount?.siteType}
            scopes={nativeKeys.scopes}
            selectedScope={nativeKeys.selectedScope}
            isLoading={nativeKeys.isLoading}
            isRetrying={
              nativeKeys.isLoading || nativeKeys.isScopeInventoryLoading
            }
            isPartial={nativeKeys.scopeInventoryFailure !== null}
            error={
              nativeKeys.failures[selectedAccount]?.code ===
              ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied
                ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied
                : nativeKeys.failures[selectedAccount]?.code ===
                    ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed
                  ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed
                  : nativeKeys.failures[selectedAccount]
                    ? ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable
                    : undefined
            }
            onSelectScope={(scope) => {
              if (routeAssociationId) clearAssociationTarget()
              nativeKeys.selectScope(scope)
            }}
            onRetry={() =>
              void (nativeKeys.scopeInventoryFailure
                ? nativeKeys.retryScopeInventory()
                : nativeKeys.refresh())
            }
          />
          <SearchableSelect
            data-testid={KEY_MANAGEMENT_TEST_IDS.nativeStatusFilter}
            aria-label={t("keyManagement:native.statusFilter.label")}
            options={nativeStatusOptions(t)}
            value={nativeKeys.statusFilter}
            onChange={(value) => {
              if (routeAssociationId) clearAssociationTarget()
              nativeKeys.setStatusFilter(
                value as (typeof ACCOUNT_KEY_STATUS_FILTERS)[keyof typeof ACCOUNT_KEY_STATUS_FILTERS],
              )
            }}
          />
          {nativeKeys.notice ? (
            <Alert
              variant="warning"
              compact
              title={
                getAccountKeyScopeMessages(
                  displayData.find((account) => account.id === selectedAccount)
                    ?.siteType,
                  t,
                ).fallback
              }
            />
          ) : null}
        </div>
      ) : null}

      {selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
        combinedAccountSummaryItems.length > 0 && (
          <AccountSummaryBar
            items={combinedAccountSummaryItems}
            activeAccountIds={allAccountsFilterAccountIds}
            onAccountClick={handleAccountSummaryClick}
          />
        )}

      {selectedAccount ? (
        <TokenSearchBar
          searchTerm={searchTerm}
          setSearchTerm={handleSearchTermChange}
        />
      ) : null}

      <TokenList
        isLoading={isLoading}
        entries={entries}
        filteredEntries={filteredEntries}
        handleAddToken={handleRequestAddToken}
        canCreateTokens={canCreateKeyInCurrentScope}
        onAddAccount={handleOpenAccountManagement}
        onRequestAccountSelection={handleRequestAccountSelection}
        selectedAccount={selectedAccount}
        displayData={displayData}
        currentAccountLoadError={currentAccountLoadError}
        nativeInventoryLoadError={nativeInventoryLoadError}
        currentAccountUnsupportedKeyManagement={
          currentAccountUnsupportedKeyManagement
        }
        onCopyServiceCredential={copyServiceCredential}
        onRotateServiceCredential={rotateServiceCredential}
        nativeRows={nativeRows}
        nativeUnfilteredRows={allNativeRows}
        nativeLoading={isNativeInventoryLoading}
        nativeDetail={nativeKeys.detail}
        nativeDetailLoading={nativeKeys.isDetailLoading}
        nativeDetailFailure={nativeKeys.detailFailure}
        onCloseNativeDetail={nativeKeys.closeDetail}
        nativeDetailsFromRows={
          selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
        }
        onOpenNativeDetail={(ref) => void nativeKeys.openDetail(ref)}
        onEditNativeKey={(ref) => void nativeKeys.openEdit(ref)}
        onDeleteNativeKey={nativeKeys.openDelete}
        onRetryCurrentAccount={
          selectedAccount
            ? () => void handleRefreshTokens(selectedAccount)
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
        guidedManagedSiteImport={guidedManagedSiteImport}
        allAccountsFilterAccountIds={allAccountsFilterAccountIds}
        credentialProfileLinks={credentialProfileLinks}
        getCredentialProfileForLocator={
          credentialAssociations.getProfileForLocator
        }
        canManageCredentialAssociations={
          !areCredentialProfileLinksLoading && !credentialProfileLinksError
        }
        canAssociateExistingCredential={
          !areCredentialProfilesLoading && credentialProfiles.length > 0
        }
        onAssociateAssociation={credentialAssociations.openPicker}
        onUnlinkAssociation={credentialAssociations.unlink}
        associationTarget={associationTarget}
        onAssociationTargetStatusChange={setAssociationTargetStatus}
      />

      {!isManagedSiteConfigComplete ? (
        <Notice
          tone="default"
          className="mx-auto mt-6 max-w-2xl text-left"
          description={
            <span>
              {t("keyManagement:managedSiteSetupRecovery.description")}{" "}
              <NoticeActionButton
                onClick={() =>
                  void openSettingsTab("managedSite", {
                    preserveHistory: true,
                  })
                }
              >
                {t(
                  "keyManagement:managedSiteSetupRecovery.configureManagedSite",
                )}
              </NoticeActionButton>
            </span>
          }
        />
      ) : null}

      <Footer />

      <AssociateApiCredentialProfileDialog
        isOpen={credentialAssociations.pickerTarget !== null}
        locator={credentialAssociations.pickerTarget?.locator ?? null}
        displayLabel={credentialAssociations.pickerTarget?.displayLabel}
        targetSecret={credentialAssociations.pickerTarget?.targetSecret}
        profiles={credentialProfiles}
        isProfilesLoading={areCredentialProfilesLoading}
        existingProfileNames={credentialAssociations.existingProfileNames}
        isWorking={credentialAssociations.isAssociating}
        onClose={credentialAssociations.closePicker}
        onAssociate={credentialAssociations.associate}
        onOpenProfiles={() => {
          credentialAssociations.clearPicker()
          void openApiCredentialProfilesPage()
        }}
      />

      <AddTokenDialog
        isOpen={isAddTokenOpen && !isSelectedNativeKeyAccount}
        onClose={() => setIsAddTokenOpen(false)}
        onSuccess={async () => {
          await nativeKeys.refresh()
        }}
        availableAccounts={addTokenAvailableAccounts}
        preSelectedAccountId={addTokenPreSelectedAccountId}
      />

      <RepairMissingKeysDialog
        isOpen={isRepairOpen}
        onClose={handleCloseRepairMissingKeys}
        accounts={displayData}
        startOnOpen={repairStartOnOpen}
      />

      <AccountKeyResourceEditorDialog
        editor={nativeKeys.editor}
        terminalCloseEditor={nativeKeys.terminalCloseEditor}
        opening={nativeKeys.editorOpening}
        onRetryOpening={nativeKeys.retryEditorOpening}
        onCancelOpening={nativeKeys.cancelEditorOpening}
        onClose={nativeKeys.closeEditor}
        onTerminalCloseSettled={nativeKeys.settleTerminalClose}
        onSubmit={nativeKeys.submitEditor}
        onValuesChange={nativeKeys.setEditorValues}
        onLoadOptions={nativeKeys.loadEditorOptions}
        focusWorkflowId={nativeKeys.focusWorkflowId ?? undefined}
      />

      <ConfirmDialog
        intent={nativeDeleteIsUncertain ? "warning" : "destructive"}
        icon={nativeDeleteIsUncertain ? RefreshCw : undefined}
        isOpen={nativeKeys.deleteState.isOpen}
        onClose={nativeKeys.cancelDelete}
        title={t("keyManagement:native.delete.title")}
        description={t("keyManagement:native.delete.description", {
          name: nativeDeleteFacts?.displayName ?? "",
        })}
        cancelLabel={t("common:actions.cancel")}
        confirmLabel={
          nativeDeleteIsUncertain
            ? t("keyManagement:native.delete.refresh")
            : t("keyManagement:native.delete.confirm")
        }
        confirmButtonTestId={KEY_MANAGEMENT_TEST_IDS.nativeDeleteConfirmButton}
        isWorking={nativeKeys.deleteState.isExecuting}
        onConfirm={() =>
          nativeDeleteIsUncertain
            ? void nativeKeys.refresh()
            : void nativeKeys.confirmDelete(nativeCleanupLinkedChannels)
        }
        details={
          <>
            <LinkedChannelCleanupOption
              checked={nativeCleanupLinkedChannels}
              onCheckedChange={setNativeCleanupLinkedChannels}
              disabled={nativeKeys.deleteState.isExecuting}
            />
            {nativeKeys.deleteState.failure ? (
              <Alert
                variant="warning"
                role="alert"
                title={nativeDeleteFailureMessage(
                  nativeKeys.deleteState.failure.code,
                  t,
                )}
              >
                {nativeKeys.deleteState.failure.message}
              </Alert>
            ) : undefined}
          </>
        }
      />

      <OneTimeSecretDialog
        isOpen={nativeKeys.createdSecret !== null}
        result={nativeKeys.createdSecret}
        onClose={nativeKeys.closeCreatedSecret}
        saveAction={nativeOneTimeSaveAction}
        onCopyResult={nativeKeys.recordCreatedSecretCopyResult}
        onSaveResult={nativeKeys.recordCreatedSecretSaveResult}
        focusWorkflowId={nativeKeys.focusWorkflowId ?? undefined}
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
