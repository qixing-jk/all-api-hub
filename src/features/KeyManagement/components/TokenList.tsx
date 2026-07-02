import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  KeyIcon,
  PlusIcon,
} from "@heroicons/react/24/outline"
import { Library, Loader2, Network, SendToBack } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { CCSwitchExportDialog } from "~/components/CCSwitchExportDialog"
import { ManagedSiteIcon } from "~/components/icons/ManagedSiteIcon"
import { Badge, Button, Card, Checkbox, EmptyState } from "~/components/ui"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { saveApiTokensToApiCredentialProfiles } from "~/features/TokenProvisioning/utils/apiCredentialProfileSaveAction"
import { cn } from "~/lib/utils"
import type { AccountServiceCredential } from "~/services/apiAdapters/contracts/serviceCredential"
import type { ManagedSiteTokenChannelStatus } from "~/services/managedSites/tokenChannelStatus"
import { getManagedSiteLabel } from "~/services/managedSites/utils/managedSite"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { AccountToken, DisplaySiteData } from "~/types"
import type {
  ManagedSiteTokenBatchExportExecutionResult,
  ManagedSiteTokenBatchExportItemInput,
} from "~/types/managedSiteTokenBatchExport"
import { MANAGED_SITE_TOKEN_BATCH_EXPORT_ITEM_KINDS } from "~/types/managedSiteTokenBatchExport"
import { createTab } from "~/utils/browser/browserApi"
import { createLogger } from "~/utils/core/logger"

import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "../constants"
import { KEY_MANAGEMENT_TEST_IDS } from "../testIds"
import {
  KEY_MANAGEMENT_ENTRY_KINDS,
  type ApiCredentialProfileSaveEntry,
  type CliProxyExportEntry,
  type KeyManagementEntry,
} from "../types"
import {
  buildAccountTokenEntryIdentityKey,
  buildServiceCredentialEntryIdentityKey,
  buildTokenIdentityKey,
} from "../utils"
import { BatchCliProxyExportDialog } from "./BatchCliProxyExportDialog"
import { ManagedSiteTokenBatchExportDialog } from "./ManagedSiteTokenBatchExportDialog"
import { ServiceCredentialCard } from "./ServiceCredentialCard"
import { TokenListItem } from "./TokenListItem"

const logger = createLogger("TokenList")

interface TokenListProps {
  isLoading: boolean
  tokens: AccountToken[]
  filteredTokens: AccountToken[]
  entries?: KeyManagementEntry[]
  filteredEntries?: KeyManagementEntry[]
  visibleKeys: Set<string>
  resolvingVisibleKeys: Set<string>
  getVisibleTokenKey: (token: AccountToken) => string
  toggleKeyVisibility: (
    account: DisplaySiteData,
    token: AccountToken,
  ) => Promise<void>
  copyKey: (account: DisplaySiteData, token: AccountToken) => Promise<void>
  handleEditToken: (token: AccountToken) => void
  handleDeleteToken: (token: AccountToken) => void
  handleAddToken: () => void
  canCreateTokens?: boolean
  onAddAccount?: () => void
  onRequestAccountSelection?: () => void
  selectedAccount: string
  displayData: DisplaySiteData[]
  currentAccountLoadError?: string | null
  onRetryCurrentAccount?: () => void
  managedSiteTokenStatuses?: Record<
    string,
    {
      isChecking: boolean
      result?: ManagedSiteTokenChannelStatus
    }
  >
  onManagedSiteImportSuccess?: (token: AccountToken) => void | Promise<void>
  onManagedSiteVerificationRetry?: (
    token: AccountToken,
    managedSiteStatus: ManagedSiteTokenChannelStatus,
  ) => void | Promise<void>
  allAccountsFilterAccountIds?: string[]
  serviceCredentials?: Record<
    string,
    {
      status: "idle" | "loading" | "loaded" | "error"
      credential?: AccountServiceCredential
      errorMessage?: string
      isRotating?: boolean
    }
  >
  onCopyServiceCredential?: (account: DisplaySiteData) => Promise<void>
  onRotateServiceCredential?: (account: DisplaySiteData) => Promise<void>
}

/**
 * Skeleton placeholder shown while tokens list is loading.
 */
function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <Card key={i} padding="sm" className="animate-pulse">
          <div className="dark:bg-dark-bg-tertiary mb-2 h-4 w-1/4 rounded bg-gray-200"></div>
          <div className="dark:bg-dark-bg-tertiary mb-2 h-3 w-1/2 rounded bg-gray-200"></div>
          <div className="dark:bg-dark-bg-tertiary h-3 w-3/4 rounded bg-gray-200"></div>
        </Card>
      ))}
    </div>
  )
}

/**
 * Empty state content for no tokens or filtered results.
 * @param props Component props container.
 * @param props.selectedAccount Currently selected account identifier.
 * @param props.tokens All tokens for the current account.
 * @param props.handleAddToken Callback to open the add-token flow.
 * @param props.canCreateTokens Whether the current account scope supports token creation.
 * @param props.displayData Account display data used to determine empty states.
 * @param props.currentAccountLoadError Error message shown when the selected account fails to load.
 * @param props.onRetryCurrentAccount Optional callback to retry loading the selected account.
 * @param props.onAddAccount Optional callback to open the add-account flow.
 * @param props.onRequestAccountSelection Optional callback to focus the account selector.
 */
function TokenEmptyState({
  selectedAccount,
  tokens,
  handleAddToken,
  canCreateTokens = true,
  displayData,
  currentAccountLoadError,
  onRetryCurrentAccount,
  onAddAccount,
  onRequestAccountSelection,
}: {
  selectedAccount: string
  tokens: unknown[]
  handleAddToken: () => void
  canCreateTokens?: boolean
  displayData: DisplaySiteData[]
  currentAccountLoadError?: string | null
  onRetryCurrentAccount?: () => void
  onAddAccount?: () => void
  onRequestAccountSelection?: () => void
}) {
  const { t } = useTranslation(["keyManagement", "account"])
  const currentAccount =
    selectedAccount && selectedAccount !== KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
      ? displayData.find((account) => account.id === selectedAccount) ?? null
      : null

  const handleOpenCurrentAccountSite = () => {
    const baseUrl = currentAccount?.baseUrl?.trim()
    if (!baseUrl) return
    void createTab(baseUrl, true)
  }

  // 如果没有账户
  if (displayData.length === 0) {
    return (
      <EmptyState
        icon={<KeyIcon className="h-12 w-12" />}
        title={t("account:emptyState")}
        description={t("keyManagement:pleaseAddAccount")}
        action={
          onAddAccount
            ? {
                label: t("account:addFirstAccount"),
                onClick: onAddAccount,
                variant: "default",
                icon: <PlusIcon className="h-4 w-4" />,
              }
            : undefined
        }
      />
    )
  }

  if (!selectedAccount) {
    return (
      <EmptyState
        icon={<KeyIcon className="h-12 w-12" />}
        title={t("keyManagement:pleaseSelectAccount")}
        description={t("keyManagement:selectAccountToContinue")}
        action={
          onRequestAccountSelection
            ? {
                label: t("keyManagement:selectAccount"),
                onClick: onRequestAccountSelection,
                variant: "default",
              }
            : undefined
        }
      />
    )
  }

  if (currentAccountLoadError) {
    return (
      <EmptyState
        variant="destructive"
        icon={<ExclamationTriangleIcon className="h-12 w-12" />}
        title={t("loadError.title")}
        description={t("loadError.description", {
          error: currentAccountLoadError,
        })}
        descriptionClassName="max-w-xl whitespace-pre-line"
        className="mt-4"
        actions={[
          {
            label: t("refreshTokenList"),
            onClick: () => onRetryCurrentAccount?.(),
            variant: "default",
            icon: <ArrowPathIcon className="h-4 w-4" />,
            disabled: !onRetryCurrentAccount,
          },
          {
            label: t("loadError.openSite"),
            onClick: handleOpenCurrentAccountSite,
            variant: "outline",
            icon: <GlobeAltIcon className="h-4 w-4" />,
            disabled: !currentAccount?.baseUrl?.trim(),
          },
        ]}
      />
    )
  }

  // 如果没有密钥
  if (tokens.length === 0) {
    return (
      <EmptyState
        icon={<KeyIcon className="h-12 w-12" />}
        title={t("noKeys")}
        action={{
          label: t("createFirstKey"),
          onClick: handleAddToken,
          variant: "success",
          icon: <PlusIcon className="h-4 w-4" />,
          testId: KEY_MANAGEMENT_TEST_IDS.emptyStateAddTokenButton,
          disabled: !canCreateTokens,
        }}
      />
    )
  }

  // 搜索无结果
  return (
    <EmptyState
      icon={<KeyIcon className="h-12 w-12" />}
      title={t("noMatchingKeys")}
    />
  )
}

/**
 * Displays a list of API tokens with loading and empty states.
 * Handles key visibility toggles, copy, edit/delete actions, and CCSwitch export.
 * @param props Component props configuring the token list view.
 * @param props.isLoading Whether data for the current account is still loading.
 * @param props.tokens Tokens belonging to the selected account.
 * @param props.filteredTokens Tokens after search/filter is applied.
 * @param props.visibleKeys Set of token IDs whose values are currently unmasked.
 * @param props.resolvingVisibleKeys Set of token IDs currently resolving to a usable secret.
 * @param props.getVisibleTokenKey Returns the best available source value for a token key.
 * @param props.toggleKeyVisibility Toggles a token between visible/hidden states.
 * @param props.copyKey Copies the token value to the clipboard.
 * @param props.handleEditToken Opens the edit modal for the given token.
 * @param props.handleDeleteToken Removes the token after confirmation.
 * @param props.handleAddToken Opens the add-token dialog.
 * @param props.canCreateTokens Whether the current account scope supports token creation.
 * @param props.selectedAccount Currently selected account identifier.
 * @param props.displayData Account metadata used to render contextual info.
 * @param props.currentAccountLoadError Optional load error for the currently selected account.
 * @param props.onRetryCurrentAccount Optional retry handler for the current account load.
 * @param props.managedSiteTokenStatuses Optional managed-site channel status by token identity.
 * @param props.onManagedSiteImportSuccess Optional callback after a managed-site token import succeeds.
 * @param props.onManagedSiteVerificationRetry Optional callback to retry managed-site token verification.
 * @param props.allAccountsFilterAccountIds Optional account ID filters applied in all-accounts mode.
 */
export function TokenList(props: TokenListProps) {
  const {
    isLoading,
    tokens,
    filteredTokens,
    entries: providedEntries,
    filteredEntries: providedFilteredEntries,
    visibleKeys,
    resolvingVisibleKeys,
    getVisibleTokenKey,
    toggleKeyVisibility,
    copyKey,
    handleEditToken,
    handleDeleteToken,
    handleAddToken,
    canCreateTokens = true,
    onAddAccount,
    onRequestAccountSelection,
    selectedAccount,
    displayData,
    currentAccountLoadError,
    onRetryCurrentAccount,
    managedSiteTokenStatuses,
    onManagedSiteImportSuccess,
    onManagedSiteVerificationRetry,
    allAccountsFilterAccountIds = [],
    serviceCredentials = {},
    onCopyServiceCredential,
    onRotateServiceCredential,
  } = props
  const { t } = useTranslation(["keyManagement", "settings"])
  const { managedSiteType } = useUserPreferencesContext()
  const [ccSwitchContext, setCCSwitchContext] = useState<{
    token: AccountToken
    account: DisplaySiteData
  } | null>(null)
  const [batchExportOpen, setBatchExportOpen] = useState(false)
  const [batchExportItems, setBatchExportItems] = useState<
    ManagedSiteTokenBatchExportItemInput[]
  >([])
  const [batchCliProxyExportOpen, setBatchCliProxyExportOpen] = useState(false)
  const [batchCliProxyExportItems, setBatchCliProxyExportItems] = useState<
    CliProxyExportEntry[]
  >([])
  const [isBatchApiProfilesSaving, setIsBatchApiProfilesSaving] =
    useState(false)
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(
    () => new Set(),
  )

  const accountById = useMemo(() => {
    return new Map(displayData.map((account) => [account.id, account]))
  }, [displayData])
  const entries = useMemo(() => {
    if (providedEntries) return providedEntries

    const tokenEntries = filteredTokens
      .map((token): KeyManagementEntry | null => {
        const account = accountById.get(token.accountId)
        return account
          ? {
              kind: KEY_MANAGEMENT_ENTRY_KINDS.AccountToken,
              id: buildAccountTokenEntryIdentityKey(token.accountId, token.id),
              account,
              token,
            }
          : null
      })
      .filter((entry): entry is KeyManagementEntry => entry !== null)

    const serviceCredentialEntries = displayData
      .map((account): KeyManagementEntry | null => {
        const entry = serviceCredentials[account.id]
        if (entry?.status !== "loaded" || !entry.credential) {
          return null
        }

        return {
          kind: KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential,
          id: buildServiceCredentialEntryIdentityKey(
            account.id,
            entry.credential.service,
          ),
          account,
          credential: entry.credential,
          isRotating: entry.isRotating === true,
        }
      })
      .filter((entry): entry is KeyManagementEntry => entry !== null)

    return [...serviceCredentialEntries, ...tokenEntries]
  }, [
    accountById,
    displayData,
    filteredTokens,
    providedEntries,
    serviceCredentials,
  ])
  const filteredEntries = providedFilteredEntries ?? entries
  const managedSiteLabel = getManagedSiteLabel(t, managedSiteType)

  const isAllAccountsMode =
    selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
  const [collapsedAccountIds, setCollapsedAccountIds] = useState<Set<string>>(
    () =>
      selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
        ? new Set(displayData.map((account) => account.id))
        : new Set(),
  )
  const hasInitializedCollapseRef = useRef(isAllAccountsMode)

  useEffect(() => {
    if (!isAllAccountsMode) {
      hasInitializedCollapseRef.current = false
      setCollapsedAccountIds(new Set())
      return
    }

    if (hasInitializedCollapseRef.current) return
    hasInitializedCollapseRef.current = true
    setCollapsedAccountIds(new Set(displayData.map((account) => account.id)))
  }, [displayData, isAllAccountsMode])

  useEffect(() => {
    if (!isAllAccountsMode) return
    if (allAccountsFilterAccountIds.length === 0) return

    // When the user filters via AccountSummaryBar, ensure matching groups are
    // expanded so the tokens are immediately visible.
    setCollapsedAccountIds((prev) => {
      const next = new Set(prev)
      let didChange = false

      for (const accountId of allAccountsFilterAccountIds) {
        if (!next.has(accountId)) continue
        next.delete(accountId)
        didChange = true
      }

      if (!didChange) return prev
      return next
    })
  }, [allAccountsFilterAccountIds, isAllAccountsMode])

  const groupedEntries = useMemo(() => {
    if (!isAllAccountsMode) return null

    const totalTokensByAccountId = new Map<string, AccountToken[]>()
    for (const token of tokens) {
      const list = totalTokensByAccountId.get(token.accountId) ?? []
      list.push(token)
      totalTokensByAccountId.set(token.accountId, list)
    }

    const entriesByAccountId = new Map<string, KeyManagementEntry[]>()
    for (const entry of filteredEntries) {
      const accountId =
        entry.kind === KEY_MANAGEMENT_ENTRY_KINDS.AccountToken
          ? entry.token.accountId
          : entry.account.id
      const list = entriesByAccountId.get(accountId) ?? []
      list.push(entry)
      entriesByAccountId.set(accountId, list)
    }

    return displayData
      .filter((account) => entriesByAccountId.has(account.id))
      .map((account) => {
        const total = totalTokensByAccountId.get(account.id) ?? []
        const filteredAccountEntries = entriesByAccountId.get(account.id) ?? []
        const filteredAccountTokens = filteredAccountEntries
          .filter(
            (
              entry,
            ): entry is Extract<
              KeyManagementEntry,
              { kind: typeof KEY_MANAGEMENT_ENTRY_KINDS.AccountToken }
            > => entry.kind === KEY_MANAGEMENT_ENTRY_KINDS.AccountToken,
          )
          .map((entry) => entry.token)
        return {
          account,
          totalTokens: total,
          filteredTokens: filteredAccountTokens,
          filteredEntries: filteredAccountEntries,
          totalCount: Math.max(total.length, filteredAccountEntries.length),
          enabledCount: total.filter((item) => item.status === 1).length,
          showingCount: filteredAccountEntries.length,
        }
      })
  }, [displayData, filteredEntries, isAllAccountsMode, tokens])

  const filteredEntryIds = useMemo(
    () => new Set(filteredEntries.map((entry) => entry.id)),
    [filteredEntries],
  )
  const selectedVisibleCount = useMemo(
    () =>
      Array.from(selectedEntryIds).filter((entryId) =>
        filteredEntryIds.has(entryId),
      ).length,
    [filteredEntryIds, selectedEntryIds],
  )
  const allFilteredSelected =
    filteredEntries.length > 0 &&
    selectedVisibleCount === filteredEntries.length
  const visibleSelectionChecked =
    selectedVisibleCount === 0
      ? false
      : selectedVisibleCount === filteredEntries.length
        ? true
        : "indeterminate"
  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedEntryIds.has(entry.id)),
    [entries, selectedEntryIds],
  )
  const selectedManagedSiteBatchItems = useMemo(
    (): ManagedSiteTokenBatchExportItemInput[] =>
      selectedEntries.map((entry) =>
        entry.kind === KEY_MANAGEMENT_ENTRY_KINDS.AccountToken
          ? {
              kind: MANAGED_SITE_TOKEN_BATCH_EXPORT_ITEM_KINDS.AccountToken,
              account: entry.account,
              token: entry.token,
            }
          : {
              kind: MANAGED_SITE_TOKEN_BATCH_EXPORT_ITEM_KINDS.ServiceCredential,
              account: entry.account,
              credential: entry.credential,
            },
      ),
    [selectedEntries],
  )
  const selectedApiProfileItems = useMemo(
    (): ApiCredentialProfileSaveEntry[] =>
      selectedEntries.map((entry) =>
        entry.kind === KEY_MANAGEMENT_ENTRY_KINDS.AccountToken
          ? {
              kind: KEY_MANAGEMENT_ENTRY_KINDS.AccountToken,
              account: entry.account,
              token: entry.token,
            }
          : {
              kind: KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential,
              account: entry.account,
              credential: entry.credential,
            },
      ),
    [selectedEntries],
  )
  const selectedCliProxyItems = useMemo(
    (): CliProxyExportEntry[] => selectedApiProfileItems,
    [selectedApiProfileItems],
  )

  useEffect(() => {
    const availableIds = new Set(entries.map((entry) => entry.id))
    setSelectedEntryIds((prev) => {
      const next = new Set(
        Array.from(prev).filter((entryId) => availableIds.has(entryId)),
      )
      return next.size === prev.size ? prev : next
    })
  }, [entries])

  const collapseAll = useCallback(() => {
    if (!groupedEntries) return
    setCollapsedAccountIds(
      new Set(groupedEntries.map((group) => group.account.id)),
    )
  }, [groupedEntries, setCollapsedAccountIds])

  const expandAll = useCallback(
    () => setCollapsedAccountIds(new Set()),
    [setCollapsedAccountIds],
  )

  const toggleGroup = (accountId: string) => {
    setCollapsedAccountIds((prev) => {
      const next = new Set(prev)
      if (next.has(accountId)) {
        next.delete(accountId)
      } else {
        next.add(accountId)
      }
      return next
    })
  }

  const toggleEntrySelection = (entryId: string, checked: boolean) => {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(entryId)
      } else {
        next.delete(entryId)
      }
      return next
    })
  }

  const toggleFilteredSelection = () => {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev)
      for (const entry of filteredEntries) {
        if (allFilteredSelected) {
          next.delete(entry.id)
        } else {
          next.add(entry.id)
        }
      }
      return next
    })
  }

  const toggleGroupSelection = (
    groupEntries: KeyManagementEntry[],
    checked: boolean | "indeterminate",
  ) => {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev)
      const shouldSelect = checked === true

      for (const entry of groupEntries) {
        if (shouldSelect) {
          next.add(entry.id)
        } else {
          next.delete(entry.id)
        }
      }

      return next
    })
  }

  const clearSelection = () => {
    setSelectedEntryIds(new Set())
  }

  const openBatchExportDialog = () => {
    setBatchExportItems(selectedManagedSiteBatchItems)
    setBatchExportOpen(true)
  }

  const closeBatchExportDialog = () => {
    setBatchExportOpen(false)
    setBatchExportItems([])
  }

  const openBatchCliProxyExportDialog = () => {
    setBatchCliProxyExportItems(selectedCliProxyItems)
    setBatchCliProxyExportOpen(true)
  }

  const closeBatchCliProxyExportDialog = () => {
    setBatchCliProxyExportOpen(false)
    setBatchCliProxyExportItems([])
  }

  const handleBatchSaveToApiProfiles = async () => {
    if (selectedApiProfileItems.length === 0 || isBatchApiProfilesSaving) return

    const tracker = startProductAnalyticsAction({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokensToApiCredentialProfiles,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })

    setIsBatchApiProfilesSaving(true)
    try {
      await saveApiTokensToApiCredentialProfiles({
        items: selectedApiProfileItems,
        t,
        logger,
        source: "TokenListBatchAction",
      })
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      clearSelection()
    } catch {
      tracker.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      })
    } finally {
      setIsBatchApiProfilesSaving(false)
    }
  }

  const handleBatchExportCompleted = (
    result: ManagedSiteTokenBatchExportExecutionResult,
  ) => {
    if (!onManagedSiteImportSuccess) return

    const selectedTokenByIdentity = new Map(
      batchExportItems.flatMap((item) =>
        item.kind ===
        MANAGED_SITE_TOKEN_BATCH_EXPORT_ITEM_KINDS.ServiceCredential
          ? []
          : [
              [
                buildTokenIdentityKey(item.token.accountId, item.token.id),
                item.token,
              ] as const,
            ],
      ),
    )

    for (const item of result.items) {
      if (!item.success) continue
      const token = selectedTokenByIdentity.get(item.id)
      if (!token) continue
      void Promise.resolve(onManagedSiteImportSuccess(token))
    }
  }

  const handleOpenCCSwitchDialog = (
    token: AccountToken,
    account: DisplaySiteData,
  ) => {
    setCCSwitchContext({ token, account })
  }

  const handleCloseCCSwitchDialog = () => {
    setCCSwitchContext(null)
  }

  if (isLoading && entries.length === 0) {
    return <LoadingSkeleton />
  }

  const renderServiceCredentialCard = (
    entry: Extract<
      KeyManagementEntry,
      { kind: typeof KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential }
    >,
  ) => {
    const managedSiteStatusEntry = managedSiteTokenStatuses?.[entry.id]

    return onCopyServiceCredential ? (
      <ServiceCredentialCard
        account={entry.account}
        credential={entry.credential}
        isRotating={entry.isRotating}
        isSelected={selectedEntryIds.has(entry.id)}
        managedSiteStatus={managedSiteStatusEntry?.result}
        isManagedSiteStatusChecking={
          managedSiteStatusEntry?.isChecking === true
        }
        selectionLabel={entry.credential.label}
        onSelectionChange={(checked) => toggleEntrySelection(entry.id, checked)}
        onCopy={onCopyServiceCredential}
        onRotate={onRotateServiceCredential}
      />
    ) : null
  }

  if (filteredEntries.length === 0) {
    return (
      <TokenEmptyState
        selectedAccount={selectedAccount}
        tokens={tokens}
        handleAddToken={handleAddToken}
        canCreateTokens={canCreateTokens}
        displayData={displayData}
        currentAccountLoadError={currentAccountLoadError}
        onRetryCurrentAccount={onRetryCurrentAccount}
        onAddAccount={onAddAccount}
        onRequestAccountSelection={onRequestAccountSelection}
      />
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={visibleSelectionChecked}
            disabled={filteredEntries.length === 0}
            onCheckedChange={toggleFilteredSelection}
          />
          {t("batchManagedSiteExport.selection.visible", {
            selected: selectedVisibleCount,
            total: filteredEntries.length,
          })}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            type="button"
            disabled={selectedEntryIds.size === 0}
            onClick={clearSelection}
          >
            {t("batchManagedSiteExport.actions.clearSelection")}
          </Button>
          <Button
            size="sm"
            type="button"
            disabled={selectedCliProxyItems.length === 0}
            variant="outline"
            onClick={openBatchCliProxyExportDialog}
            leftIcon={<Network className="h-4 w-4" />}
          >
            {t("batchCliProxyExport.actions.open", {
              selectedCount: selectedCliProxyItems.length,
            })}
          </Button>
          <Button
            size="sm"
            type="button"
            data-testid={KEY_MANAGEMENT_TEST_IDS.batchSaveToApiProfilesButton}
            disabled={
              selectedApiProfileItems.length === 0 || isBatchApiProfilesSaving
            }
            variant="outline"
            onClick={() => void handleBatchSaveToApiProfiles()}
            leftIcon={
              isBatchApiProfilesSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Library className="h-4 w-4" />
              )
            }
          >
            {t("batchApiCredentialProfiles.actions.open", {
              selectedCount: selectedApiProfileItems.length,
            })}
          </Button>
          <Button
            size="sm"
            type="button"
            disabled={selectedManagedSiteBatchItems.length === 0}
            onClick={openBatchExportDialog}
            leftIcon={<SendToBack className="h-4 w-4" />}
          >
            <span className="inline-flex items-center gap-1">
              <ManagedSiteIcon siteType={managedSiteType} size="sm" />
              {t("batchManagedSiteExport.actions.open", {
                site: managedSiteLabel,
                selectedCount: selectedManagedSiteBatchItems.length,
              })}
            </span>
          </Button>
        </div>
      </div>

      {isAllAccountsMode && groupedEntries && groupedEntries.length > 0 ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              type="button"
              data-testid={KEY_MANAGEMENT_TEST_IDS.expandAllButton}
              onClick={expandAll}
              leftIcon={<ChevronDownIcon className="h-4 w-4" />}
            >
              {t("actions.expandAll")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={collapseAll}
              leftIcon={<ChevronUpIcon className="h-4 w-4" />}
            >
              {t("actions.collapseAll")}
            </Button>
          </div>

          <div className="space-y-3">
            {groupedEntries.map((group) => {
              const { account } = group
              const isCollapsed = collapsedAccountIds.has(account.id)
              const shouldShowShowingCount =
                group.showingCount !== group.totalCount
              const selectedGroupVisibleCount = group.filteredEntries.filter(
                (entry) => selectedEntryIds.has(entry.id),
              ).length
              const groupSelectionChecked =
                selectedGroupVisibleCount === 0
                  ? false
                  : selectedGroupVisibleCount === group.filteredEntries.length
                    ? true
                    : "indeterminate"

              return (
                <Card
                  key={account.id}
                  variant="outlined"
                  className="overflow-hidden"
                >
                  <div
                    className={cn(
                      "dark:hover:bg-dark-bg-tertiary flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-gray-50",
                      isCollapsed
                        ? "rounded-lg"
                        : "dark:border-dark-bg-tertiary border-b border-gray-200",
                    )}
                  >
                    <Checkbox
                      checked={groupSelectionChecked}
                      aria-label={t(
                        "batchManagedSiteExport.selection.accountGroup",
                        { name: account.name },
                      )}
                      onCheckedChange={(checked) =>
                        toggleGroupSelection(group.filteredEntries, checked)
                      }
                    />
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                      onClick={() => toggleGroup(account.id)}
                      aria-expanded={!isCollapsed}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate font-medium">
                          {account.name}
                        </span>
                        <Badge
                          variant="secondary"
                          size="sm"
                          className="shrink-0"
                        >
                          {t("accountSummary.keys", {
                            count: group.totalCount,
                          })}
                        </Badge>
                        <Badge variant="outline" size="sm" className="shrink-0">
                          {t("enabledCount", { count: group.enabledCount })}
                        </Badge>
                        {shouldShowShowingCount ? (
                          <Badge
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                          >
                            {t("showingCount", { count: group.showingCount })}
                          </Badge>
                        ) : null}
                      </div>
                      <ChevronDownIcon
                        className={cn(
                          "dark:text-dark-text-tertiary h-4 w-4 shrink-0 text-gray-500 transition-transform",
                          isCollapsed ? "rotate-0" : "rotate-180",
                        )}
                      />
                    </button>
                  </div>

                  {!isCollapsed ? (
                    <div className="space-y-3 p-3">
                      {group.filteredEntries.map((entry) => {
                        if (
                          entry.kind ===
                          KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential
                        ) {
                          return (
                            <div key={entry.id}>
                              {renderServiceCredentialCard(entry)}
                            </div>
                          )
                        }

                        const { token } = entry
                        const tokenIdentityKey = buildTokenIdentityKey(
                          token.accountId,
                          token.id,
                        )
                        const managedSiteStatusEntry =
                          managedSiteTokenStatuses?.[tokenIdentityKey]

                        return (
                          <TokenListItem
                            key={tokenIdentityKey}
                            token={token}
                            displayTokenKey={getVisibleTokenKey(token)}
                            visibleKeys={visibleKeys}
                            isKeyVisibilityLoading={resolvingVisibleKeys.has(
                              tokenIdentityKey,
                            )}
                            toggleKeyVisibility={toggleKeyVisibility}
                            copyKey={copyKey}
                            handleEditToken={handleEditToken}
                            handleDeleteToken={handleDeleteToken}
                            account={account}
                            managedSiteStatus={managedSiteStatusEntry?.result}
                            isManagedSiteStatusChecking={
                              managedSiteStatusEntry?.isChecking === true
                            }
                            onManagedSiteImportSuccess={
                              onManagedSiteImportSuccess
                            }
                            onManagedSiteVerificationRetry={
                              onManagedSiteVerificationRetry
                            }
                            isSelected={selectedEntryIds.has(entry.id)}
                            onSelectionChange={(checked) =>
                              toggleEntrySelection(entry.id, checked)
                            }
                            onOpenCCSwitchDialog={() =>
                              handleOpenCCSwitchDialog(token, account)
                            }
                          />
                        )
                      })}
                    </div>
                  ) : null}
                </Card>
              )
            })}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => {
            if (entry.kind === KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential) {
              return (
                <div key={entry.id}>{renderServiceCredentialCard(entry)}</div>
              )
            }

            const { token } = entry
            const account = accountById.get(token.accountId)
            if (!account) {
              return null
            }

            const tokenIdentityKey = buildTokenIdentityKey(
              token.accountId,
              token.id,
            )
            const managedSiteStatusEntry =
              managedSiteTokenStatuses?.[tokenIdentityKey]

            return (
              <TokenListItem
                key={tokenIdentityKey}
                token={token}
                displayTokenKey={getVisibleTokenKey(token)}
                visibleKeys={visibleKeys}
                isKeyVisibilityLoading={resolvingVisibleKeys.has(
                  tokenIdentityKey,
                )}
                toggleKeyVisibility={toggleKeyVisibility}
                copyKey={copyKey}
                handleEditToken={handleEditToken}
                handleDeleteToken={handleDeleteToken}
                account={account}
                managedSiteStatus={managedSiteStatusEntry?.result}
                isManagedSiteStatusChecking={
                  managedSiteStatusEntry?.isChecking === true
                }
                onManagedSiteImportSuccess={onManagedSiteImportSuccess}
                onManagedSiteVerificationRetry={onManagedSiteVerificationRetry}
                isSelected={selectedEntryIds.has(entry.id)}
                onSelectionChange={(checked) =>
                  toggleEntrySelection(entry.id, checked)
                }
                onOpenCCSwitchDialog={() =>
                  handleOpenCCSwitchDialog(token, account)
                }
              />
            )
          })}
        </div>
      )}

      {ccSwitchContext && (
        <CCSwitchExportDialog
          isOpen={true}
          onClose={handleCloseCCSwitchDialog}
          account={ccSwitchContext.account}
          token={ccSwitchContext.token}
        />
      )}

      <BatchCliProxyExportDialog
        isOpen={batchCliProxyExportOpen}
        onClose={closeBatchCliProxyExportDialog}
        items={batchCliProxyExportItems}
      />

      <ManagedSiteTokenBatchExportDialog
        isOpen={batchExportOpen}
        onClose={closeBatchExportDialog}
        items={batchExportItems}
        onCompleted={handleBatchExportCompleted}
      />
    </>
  )
}
