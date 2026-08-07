import type { TFunction } from "i18next"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  DestructiveConfirmDialog,
  Notice,
  NoticeActionButton,
  SearchableSelect,
} from "~/components/ui"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { loadNewApiChannelKeyWithVerification } from "~/features/ManagedSiteVerification/loadNewApiChannelKeyWithVerification"
import { NewApiManagedVerificationDialog } from "~/features/ManagedSiteVerification/NewApiManagedVerificationDialog"
import { useNewApiManagedVerification } from "~/features/ManagedSiteVerification/useNewApiManagedVerification"
import AddTokenDialog from "~/features/TokenProvisioning/components/AddTokenDialog"
import { OneTimeSecretDialog } from "~/features/TokenProvisioning/components/OneTimeSecretDialog"
import { buildOneTimeApiKeyProfileSaveAction } from "~/features/TokenProvisioning/utils/apiCredentialProfileSaveAction"
import {
  AccountKeyRepairMessageTypes,
  sendAccountKeyRepairMessage,
} from "~/services/accounts/accountKeyAutoProvisioning/messaging"
import { canCreateAccountApiTokens } from "~/services/accounts/keyProductCapabilities"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  type AccountKeyResourceFacts,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { OPENROUTER_KEY_FIELD_IDS } from "~/services/apiAdapters/openrouter/keyResourceFields"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { getRecoverableManagedSiteChannelCandidate } from "~/services/managedSites/channelMatch"
import { hasValidManagedSiteConfig } from "~/services/managedSites/managedSiteService"
import {
  MANAGED_SITE_TOKEN_CHANNEL_STATUS_UNKNOWN_REASONS,
  MANAGED_SITE_TOKEN_CHANNEL_STATUSES,
  type ManagedSiteTokenChannelStatus,
} from "~/services/managedSites/tokenChannelStatus"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import type { AccountToken } from "~/types"
import { ACCOUNT_KEY_REPAIR_JOB_STATES } from "~/types/accountKeyAutoProvisioning"
import { createLogger } from "~/utils/core/logger"
import {
  openModelsPage,
  openSettingsTab,
  pushWithinOptionsPage,
  replaceWithinOptionsPage,
} from "~/utils/navigation"

import { AccountKeyResourceEditorDialog } from "./components/AccountKeyResource/AccountKeyResourceEditorDialog"
import { OpenRouterWorkspaceSelector } from "./components/AccountKeyResource/OpenRouterWorkspaceSelector"
import { AccountSelectorPanel } from "./components/AccountSelectorPanel"
import { AccountSummaryBar } from "./components/AccountSummaryBar"
import { Footer } from "./components/Footer"
import { Header } from "./components/Header"
import { RepairMissingKeysDialog } from "./components/RepairMissingKeysDialog"
import { TokenList } from "./components/TokenList"
import { TokenSearchBar } from "./components/TokenSearchBar"
import {
  ACCOUNT_KEY_STATUS_FILTERS,
  KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
  KEY_MANAGEMENT_GUIDED_IMPORT_TARGETS,
  KEY_MANAGEMENT_ROUTE_PARAMS,
} from "./constants"
import {
  useAccountKeyResourceController,
  type AccountKeyResourceRouteTransition,
} from "./controllers/useAccountKeyResourceController"
import { useKeyManagement } from "./hooks/useKeyManagement"
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
    label: t("keyManagement:openRouter.list.status.all"),
  },
  {
    value: ACCOUNT_KEY_STATUS_FILTERS.Enabled,
    label: t("keyManagement:openRouter.list.status.enabled"),
  },
  {
    value: ACCOUNT_KEY_STATUS_FILTERS.Disabled,
    label: t("keyManagement:openRouter.list.status.disabled"),
  },
  {
    value: ACCOUNT_KEY_STATUS_FILTERS.Expired,
    label: t("keyManagement:openRouter.list.status.expired"),
  },
  {
    value: ACCOUNT_KEY_STATUS_FILTERS.Unknown,
    label: t("keyManagement:openRouter.list.status.unknown"),
  },
]

const getRouteSignature = (params?: Record<string, string | undefined>) =>
  JSON.stringify(
    Object.entries(params ?? {})
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  )

const nativeDeleteFailureMessage = (code: string | undefined, t: TFunction) => {
  switch (code) {
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.AuthenticationFailed:
      return t("keyManagement:openRouter.delete.feedback.authenticationFailed")
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.PermissionDenied:
      return t("keyManagement:openRouter.delete.feedback.permissionDenied")
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unavailable:
      return t("keyManagement:openRouter.delete.feedback.unavailable")
    case ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain:
      return t("keyManagement:openRouter.delete.feedback.uncertain")
    default:
      return t("keyManagement:openRouter.delete.feedback.error")
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
  const { t } = useTranslation(["keyManagement", "common"])
  const [isRepairOpen, setIsRepairOpen] = useState(false)
  const [repairStartOnOpen, setRepairStartOnOpen] = useState(false)
  const [isAccountSelectorOpen, setIsAccountSelectorOpen] = useState(false)
  const [deleteTokenTarget, setDeleteTokenTarget] =
    useState<AccountToken | null>(null)
  const accountSelectorTriggerRef = useRef<HTMLButtonElement>(null)
  const nativeRowKeysRef = useRef(new WeakMap<object, string>())
  const nextNativeRowKeyRef = useRef(0)
  const acknowledgedNativeRouteTransitionIdRef = useRef<string | null>(null)
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
    tokens,
    isLoading,
    visibleKeys,
    resolvingVisibleKeys,
    isAddTokenOpen,
    editingToken,
    serviceCredentials,
    currentAccountLoadError,
    currentAccountUnsupportedKeyManagement,
    tokenLoadProgress,
    failedAccounts,
    accountSummaryItems,
    managedSiteTokenStatuses,
    isManagedSiteChannelStatusSupported,
    isManagedSiteStatusRefreshing,
    allAccountsFilterAccountIds,
    setAllAccountsFilterAccountIds,
    loadTokens,
    entries,
    filteredTokens,
    filteredEntries,
    getVisibleTokenKey,
    refreshManagedSiteTokenStatuses,
    refreshManagedSiteTokenStatusForToken,
    confirmManagedSiteTokenStatusWithChannelKey,
    copyKey,
    copyServiceCredential,
    rotateServiceCredential,
    toggleKeyVisibility,
    retryFailedAccounts,
    handleAddToken,
    handleCloseAddToken,
    handleEditToken,
    handleDeleteToken,
  } = useKeyManagement(routeParams)

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
      if (transition) {
        const pending = {
          params,
          transition,
          sourceRouteSignature: routeSignature,
        }
        acknowledgedNativeRouteTransitionIdRef.current = null
        setPendingNativeRoute(pending)
      } else {
        acknowledgedNativeRouteTransitionIdRef.current = null
        setPendingNativeRoute(null)
      }
      replaceWithinOptionsPage(`#${MENU_ITEM_IDS.KEYS}`, params)
    },
  })

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

  const handleRequestDeleteToken = (token: AccountToken) => {
    setDeleteTokenTarget(token)
  }

  const handleConfirmDeleteToken = () => {
    if (!deleteTokenTarget) {
      return
    }

    const token = deleteTokenTarget
    setDeleteTokenTarget(null)
    void handleDeleteToken(token)
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

  const handleOpenSelectedAccountModels = useCallback(() => {
    void openModelsPage(selectedAccount)
  }, [selectedAccount])

  const handleSelectedAccountChange = useCallback(
    (accountId: string) => {
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
        if (account?.siteType === SITE_TYPES.OPENROUTER) {
          await nativeKeys.refresh()
          return
        }
      }
      const legacyRefresh = withProtectionBypassUserCommand(
        PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
        PROTECTION_BYPASS_SURFACES.Options,
        async (protectionBypassExecution) => {
          await loadTokens(accountId, { protectionBypassExecution })
        },
      )
      if (targetAccountId === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE) {
        await Promise.allSettled([legacyRefresh, nativeKeys.refresh()])
        return
      }
      await legacyRefresh
    },
    [displayData, loadTokens, nativeKeys, selectedAccount],
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
    token: AccountToken,
    managedSiteStatus: ManagedSiteTokenChannelStatus,
  ) => {
    if (managedSiteType !== SITE_TYPES.NEW_API) {
      return
    }

    const candidateChannel =
      getRecoverableNewApiCandidateChannel(managedSiteStatus)

    if (candidateChannel) {
      let resolvedChannelKey = ""

      await loadNewApiChannelKeyWithVerification({
        channelId: candidateChannel.id,
        command: PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
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
          await confirmManagedSiteTokenStatusWithChannelKey(
            token,
            managedSiteStatus,
            {
              channelId: candidateChannel.id,
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
          await refreshManagedSiteTokenStatusForToken(token, {
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
      label: token.name,
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
            await refreshManagedSiteTokenStatusForToken(token, {
              protectionBypassExecution,
            })
          },
        )
      },
    })
  }

  const handleManagedSiteImportSuccess = async (token: AccountToken) => {
    await refreshManagedSiteTokenStatusForToken(token)
  }

  const addTokenAvailableAccounts = useMemo(
    () => displayData.filter(canCreateAccountApiTokens),
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
    ? canCreateAccountApiTokens(selectedAddTokenScopeAccount)
    : selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
      ? addTokenAvailableAccounts.length > 0
      : false

  const isSelectedOpenRouterAccount =
    selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
    selectedAddTokenScopeAccount?.siteType === SITE_TYPES.OPENROUTER
  const canCreateNativeKey =
    isSelectedOpenRouterAccount &&
    nativeKeys.selectedScope !== null &&
    !nativeKeys.isLoading &&
    !nativeKeys.freshReadRequired
  const canCreateKeyInCurrentScope = isSelectedOpenRouterAccount
    ? canCreateNativeKey
    : canCreateTokensInCurrentScope

  const handleRequestAddToken = useCallback(() => {
    if (isSelectedOpenRouterAccount) {
      if (canCreateNativeKey) void nativeKeys.openCreate()
      return
    }
    if (!canCreateTokensInCurrentScope) {
      return
    }

    handleAddToken()
  }, [
    canCreateNativeKey,
    canCreateTokensInCurrentScope,
    handleAddToken,
    isSelectedOpenRouterAccount,
    nativeKeys,
  ])

  const addTokenPreSelectedAccountId =
    selectedAddTokenScopeAccount &&
    canCreateAccountApiTokens(selectedAddTokenScopeAccount)
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
        const workspace = facts.fields.find(
          (fact) => fact.fieldId === OPENROUTER_KEY_FIELD_IDS.Workspace,
        )
        return {
          kind: KEY_MANAGEMENT_DISPLAY_ROW_KINDS.AccountKeyResource,
          rowKey,
          accountId: facts.ref.accountId,
          accountName:
            account?.name ?? t("keyManagement:openRouter.list.values.missing"),
          workspaceName:
            workspace?.kind === "text"
              ? workspace.value
              : t("keyManagement:openRouter.list.values.missing"),
          facts,
        }
      }),
    [displayData, t],
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
    for (const row of nativeRows) {
      nativeCountByAccount.set(
        row.accountId,
        (nativeCountByAccount.get(row.accountId) ?? 0) + 1,
      )
    }
    const itemByAccount = new Map<string, KeyManagementAccountSummaryItem>(
      accountSummaryItems.map((item) => {
        const countIsUnknown = item.errorType !== undefined
        return [
          item.accountId,
          {
            ...item,
            count: countIsUnknown ? null : item.count,
            ...(countIsUnknown && item.count > 0
              ? { knownCount: item.count }
              : {}),
          },
        ]
      }),
    )
    const settledNativeAccountIds = new Set(nativeKeys.settledAccountIds)
    for (const account of displayData) {
      const isNativeAccount = Boolean(
        getSiteTypeCapabilities(account.siteType).account?.keyResources,
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
    nativeRows,
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
    const knownTotal = tokens.length + nativeUnfilteredRows.length
    const knownEnabled =
      tokens.filter((token) => token.status === 1).length +
      nativeUnfilteredRows.filter((row) => row.facts.status === "enabled")
        .length
    const knownShowing = filteredTokens.length + nativeRows.length
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
      Boolean(getSiteTypeCapabilities(account.siteType).account?.keyResources),
    )
    const hasIncludedLegacyAccount = includedAccounts.some(
      (account) =>
        !getSiteTypeCapabilities(account.siteType).account?.keyResources,
    )
    const hasUnknownCount =
      (nativeKeys.isLoading && hasIncludedNativeAccount) ||
      (isLoading && hasIncludedLegacyAccount) ||
      Object.keys(nativeKeys.failures).some(isIncluded) ||
      failedAccounts.some((account) => isIncluded(account.accountId)) ||
      (selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE &&
        hasIncludedLegacyAccount &&
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
    filteredTokens.length,
    isLoading,
    nativeKeys.failures,
    nativeKeys.isLoading,
    nativeRows.length,
    nativeUnfilteredRows,
    selectedAccount,
    tokens,
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

  return (
    <div className="p-6">
      <Header
        onAddToken={handleRequestAddToken}
        onRepairMissingKeys={
          isSelectedOpenRouterAccount ? undefined : handleRepairMissingKeys
        }
        onRefresh={handleRefreshTokens}
        onOpenSelectedAccountModels={
          selectedAccount &&
          !isSelectedOpenRouterAccount &&
          selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
            ? handleOpenSelectedAccountModels
            : undefined
        }
        onRefreshManagedSiteStatus={
          isManagedSiteChannelStatusSupported && !isSelectedOpenRouterAccount
            ? () => void handleRefreshManagedSiteStatuses()
            : undefined
        }
        managedSiteStatusHint={
          isSelectedOpenRouterAccount || isManagedSiteChannelStatusSupported
            ? undefined
            : t("managedSiteStatus.pageUnsupported")
        }
        selectedAccount={selectedAccount}
        isLoading={isLoading || nativeKeys.isLoading || !selectedAccount}
        isManagedSiteStatusRefreshing={isManagedSiteStatusRefreshing}
        isAddTokenDisabled={
          isSelectedOpenRouterAccount
            ? !canCreateNativeKey
            : !canCreateTokensInCurrentScope
        }
        isRepairDisabled={displayData.length === 0}
        isManagedSiteStatusRefreshDisabled={
          !selectedAccount || tokens.length === 0 || isLoading
        }
      />

      <AccountSelectorPanel
        selectedAccount={selectedAccount}
        setSelectedAccount={handleSelectedAccountChange}
        displayData={displayData}
        selectorOpen={isAccountSelectorOpen}
        onSelectorOpenChange={setIsAccountSelectorOpen}
        selectorTriggerRef={accountSelectorTriggerRef}
        tokens={tokens}
        filteredTokens={filteredTokens}
        tokenLoadProgress={combinedTokenLoadProgress}
        failedAccounts={combinedFailedAccounts}
        onRetryFailedAccounts={retryCombinedFailedAccounts}
        nativeRows={nativeUnfilteredRows}
        filteredNativeRows={nativeRows}
        aggregateCounts={aggregateCounts}
      />

      {isSelectedOpenRouterAccount ? (
        <div className="mb-4 space-y-3">
          <OpenRouterWorkspaceSelector
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
            onSelectScope={nativeKeys.selectScope}
            onRetry={() =>
              void (nativeKeys.scopeInventoryFailure
                ? nativeKeys.retryScopeInventory()
                : nativeKeys.refresh())
            }
          />
          <SearchableSelect
            data-testid={KEY_MANAGEMENT_TEST_IDS.nativeStatusFilter}
            aria-label={t("keyManagement:openRouter.list.statusFilter.label")}
            options={nativeStatusOptions(t)}
            value={nativeKeys.statusFilter}
            onChange={(value) =>
              nativeKeys.setStatusFilter(
                value as (typeof ACCOUNT_KEY_STATUS_FILTERS)[keyof typeof ACCOUNT_KEY_STATUS_FILTERS],
              )
            }
          />
          {nativeKeys.notice ? (
            <Alert
              variant="warning"
              compact
              title={t("keyManagement:openRouter.workspace.fallback")}
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
        <TokenSearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
      ) : null}

      <TokenList
        isLoading={isLoading}
        tokens={tokens}
        filteredTokens={filteredTokens}
        entries={entries}
        filteredEntries={filteredEntries}
        visibleKeys={visibleKeys}
        resolvingVisibleKeys={resolvingVisibleKeys}
        getVisibleTokenKey={getVisibleTokenKey}
        toggleKeyVisibility={toggleKeyVisibility}
        copyKey={copyKey}
        handleEditToken={handleEditToken}
        handleDeleteToken={handleRequestDeleteToken}
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
        serviceCredentials={serviceCredentials}
        onCopyServiceCredential={copyServiceCredential}
        onRotateServiceCredential={rotateServiceCredential}
        nativeRows={nativeRows}
        nativeUnfilteredRows={nativeUnfilteredRows}
        nativeLoading={nativeKeys.isLoading}
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
      />

      {!isManagedSiteConfigComplete ? (
        <Notice
          tone="info"
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

      <AddTokenDialog
        isOpen={isAddTokenOpen && !isSelectedOpenRouterAccount}
        onClose={handleCloseAddToken}
        availableAccounts={addTokenAvailableAccounts}
        preSelectedAccountId={addTokenPreSelectedAccountId}
        editingToken={editingToken}
      />

      <RepairMissingKeysDialog
        isOpen={isRepairOpen && !isSelectedOpenRouterAccount}
        onClose={handleCloseRepairMissingKeys}
        accounts={displayData}
        startOnOpen={repairStartOnOpen}
        onManagedSiteImportSuccess={
          isManagedSiteChannelStatusSupported
            ? handleManagedSiteImportSuccess
            : undefined
        }
      />

      <DestructiveConfirmDialog
        isOpen={Boolean(deleteTokenTarget)}
        onClose={() => setDeleteTokenTarget(null)}
        title={t("keyManagement:actions.deleteKey")}
        description={t("messages.deleteConfirm", {
          name: deleteTokenTarget?.name ?? "",
        })}
        cancelLabel={t("common:actions.cancel")}
        confirmLabel={t("common:actions.delete")}
        confirmButtonTestId={KEY_MANAGEMENT_TEST_IDS.deleteTokenConfirmButton}
        onConfirm={handleConfirmDeleteToken}
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

      <DestructiveConfirmDialog
        isOpen={nativeKeys.deleteState.isOpen}
        onClose={nativeKeys.cancelDelete}
        title={t("keyManagement:openRouter.delete.title")}
        description={t("keyManagement:openRouter.delete.description", {
          name: nativeDeleteFacts?.displayName ?? "",
        })}
        cancelLabel={t("common:actions.cancel")}
        confirmLabel={
          nativeDeleteIsUncertain
            ? t("keyManagement:openRouter.delete.refresh")
            : t("keyManagement:openRouter.delete.confirm")
        }
        confirmButtonTestId={KEY_MANAGEMENT_TEST_IDS.nativeDeleteConfirmButton}
        isWorking={nativeKeys.deleteState.isExecuting}
        onConfirm={() =>
          nativeDeleteIsUncertain
            ? void nativeKeys.refresh()
            : void nativeKeys.confirmDelete()
        }
        details={
          nativeKeys.deleteState.failure ? (
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
          ) : undefined
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
