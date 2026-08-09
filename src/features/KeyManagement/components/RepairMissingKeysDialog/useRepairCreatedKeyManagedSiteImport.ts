import type { TFunction } from "i18next"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { BASIC_SETTINGS_ANCHOR_TO_TAB } from "~/constants/basicSettingsTabs"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import {
  AccountKeyRepairMessageTypes,
  sendAccountKeyRepairMessage,
} from "~/services/accounts/accountKeyAutoProvisioning/messaging"
import { isAccountTokenRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import {
  getRepairCreatedTokenBatchImportAbsenceReason,
  REPAIR_CREATED_TOKEN_BATCH_IMPORT_ABSENCE_REASONS,
  REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS,
  resolveRepairCreatedTokenBatchImportCandidate,
} from "~/services/managedSites/repairCreatedTokenBatchImport"
import { getCurrentManagedSiteRuntimeConfig } from "~/services/managedSites/runtimeConfig"
import { createManagedSiteTokenBatchImportTarget } from "~/services/managedSites/tokenBatchImportTarget"
import type { AccountToken, DisplaySiteData } from "~/types"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  type AccountKeyRepairManagedSiteImportStatus,
  type AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
import {
  isResolvedManagedSiteTokenBatchExportItemInput,
  type ManagedSiteBatchImportIntent,
  type ManagedSiteTokenBatchExportExecutionResult,
  type ManagedSiteTokenBatchExportItemInput,
} from "~/types/managedSiteTokenBatchExport"
import { openSettingsTabInNewTab } from "~/utils/navigation"

import type { ManagedSiteTokenBatchExportCompletionContext } from "../ManagedSiteTokenBatchExportDialog/useManagedSiteTokenBatchExportDialog"

interface UseRepairCreatedKeyManagedSiteImportParams {
  accounts: DisplaySiteData[]
  isOpen: boolean
  isCurrentSessionResult: boolean
  progress: AccountKeyRepairProgress | null
  setProgress: (progress: AccountKeyRepairProgress) => void
  onManagedSiteImportSuccess?: (token: AccountToken) => void | Promise<void>
  t: TFunction
}

interface RepairCreatedImportFeedback {
  action?: "configure-managed-site" | "use-regular-import"
  description: string
  variant: "destructive" | "info" | "warning"
}

const isSafeCreatedReference = (
  value: unknown,
): value is {
  tokenId: number
  group: string
} =>
  typeof value === "object" &&
  value !== null &&
  "tokenId" in value &&
  Number.isSafeInteger(value.tokenId) &&
  "group" in value &&
  typeof value.group === "string"

const countRecoverableCreatedReferences = (
  progress: AccountKeyRepairProgress | null,
  accounts: DisplaySiteData[],
) => {
  if (!progress || progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Completed) {
    return 0
  }

  const activeAccountIds = new Set(
    accounts
      .filter((account) => !account.disabled)
      .map((account) => account.id),
  )
  const referenceKeys = new Set<string>()
  for (const result of progress.results) {
    if (
      result.outcome !== ACCOUNT_KEY_REPAIR_OUTCOMES.Created ||
      !activeAccountIds.has(result.accountId)
    ) {
      continue
    }
    for (const reference of result.createdTokens ?? []) {
      if (!isSafeCreatedReference(reference)) continue
      referenceKeys.add(`${result.accountId}:${reference.tokenId}`)
    }
  }

  return referenceKeys.size
}

const getVisibleProgress = (
  progress: AccountKeyRepairProgress,
  accounts: DisplaySiteData[],
): AccountKeyRepairProgress => {
  const disabledAccountIds = new Set(
    accounts.filter((account) => account.disabled).map((account) => account.id),
  )
  return {
    ...progress,
    results: progress.results.filter(
      (result) => !disabledAccountIds.has(result.accountId),
    ),
  }
}

const getRepairImportReceiptItems = (params: {
  candidateItems: ManagedSiteTokenBatchExportItemInput[]
  result: ManagedSiteTokenBatchExportExecutionResult
  context?: ManagedSiteTokenBatchExportCompletionContext
}) => {
  const inputById = new Map(
    params.candidateItems
      .filter(isResolvedManagedSiteTokenBatchExportItemInput)
      .map((input) => [input.runtimeKey.id, input] as const),
  )
  const receiptByKey = new Map<
    string,
    {
      accountId: string
      tokenId: number
      status: AccountKeyRepairManagedSiteImportStatus
    }
  >()

  const addReceipt = (
    id: string,
    status: AccountKeyRepairManagedSiteImportStatus,
  ) => {
    const input = inputById.get(id)
    if (!input || !isAccountTokenRuntimeKey(input.runtimeKey)) return
    const key = `${input.account.id}:${input.runtimeKey.tokenId}`
    receiptByKey.set(key, {
      accountId: input.account.id,
      tokenId: input.runtimeKey.tokenId,
      status,
    })
  }

  for (const item of params.result.items) {
    const status =
      item.result === "created"
        ? ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created
        : item.result === "failed"
          ? ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Failed
          : ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Uncertain
    addReceipt(item.id, status)
  }

  for (const id of params.context?.alreadyPresentItemIds ?? []) {
    addReceipt(
      id,
      ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.AlreadyPresent,
    )
  }

  return Array.from(receiptByKey.values())
}

/**
 * Owns only repair-entry orchestration; preparation, review, execution, and
 * retry remain inside the shared managed-site batch dialog.
 */
export function useRepairCreatedKeyManagedSiteImport({
  accounts,
  isOpen,
  isCurrentSessionResult,
  progress,
  setProgress,
  onManagedSiteImportSuccess,
  t,
}: UseRepairCreatedKeyManagedSiteImportParams) {
  const [isBatchImportOpen, setIsBatchImportOpen] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [batchImportItems, setBatchImportItems] = useState<
    ManagedSiteTokenBatchExportItemInput[]
  >([])
  const [batchImportIntent, setBatchImportIntent] =
    useState<ManagedSiteBatchImportIntent | null>(null)
  const [importFeedback, setImportFeedback] =
    useState<RepairCreatedImportFeedback | null>(null)
  const activeJobIdRef = useRef<string | null>(null)
  const activeTargetFingerprintRef = useRef<string | null>(null)
  const activeItemsRef = useRef<ManagedSiteTokenBatchExportItemInput[]>([])

  const recoverableReferenceCount = useMemo(
    () => countRecoverableCreatedReferences(progress, accounts),
    [accounts, progress],
  )

  const closeBatchImport = useCallback(() => {
    if (isResolving) return
    setIsBatchImportOpen(false)
    setBatchImportItems([])
    setBatchImportIntent(null)
    activeJobIdRef.current = null
    activeTargetFingerprintRef.current = null
    activeItemsRef.current = []
  }, [isResolving])

  const prepareBatchImport = useCallback(
    async (includeCompletedReferences = false) => {
      if (
        isResolving ||
        isBatchImportOpen ||
        !progress ||
        progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Completed
      ) {
        return
      }

      setIsResolving(true)
      setImportFeedback(null)
      try {
        const runtimeConfig = await getCurrentManagedSiteRuntimeConfig()
        if (!runtimeConfig) {
          setImportFeedback({
            action: "configure-managed-site",
            description: t(
              "keyManagement:repairMissingKeys.managedSiteImport.configMissing",
            ),
            variant: "warning",
          })
          return
        }

        const target =
          await createManagedSiteTokenBatchImportTarget(runtimeConfig)
        const visibleProgress = getVisibleProgress(progress, accounts)
        const candidate = await resolveRepairCreatedTokenBatchImportCandidate({
          progress: visibleProgress,
          accounts,
          targetFingerprint: target.targetFingerprint,
          freshness: isCurrentSessionResult
            ? REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.CURRENT_SESSION
            : REPAIR_CREATED_TOKEN_BATCH_IMPORT_FRESHNESS.HISTORICAL,
          forceCompleteVerification: includeCompletedReferences,
          includeCompletedReferences,
        })
        if (!candidate) {
          const absenceReason = getRepairCreatedTokenBatchImportAbsenceReason({
            progress: visibleProgress,
            targetFingerprint: target.targetFingerprint,
          })
          const nothingPending =
            absenceReason ===
            REPAIR_CREATED_TOKEN_BATCH_IMPORT_ABSENCE_REASONS.NOTHING_PENDING
          setImportFeedback({
            action:
              nothingPending && !includeCompletedReferences
                ? "use-regular-import"
                : undefined,
            description: t(
              nothingPending
                ? "keyManagement:repairMissingKeys.managedSiteImport.nothingPending"
                : "keyManagement:repairMissingKeys.managedSiteImport.unavailable",
            ),
            variant: nothingPending ? "warning" : "destructive",
          })
          return
        }

        activeJobIdRef.current = progress.jobId
        activeTargetFingerprintRef.current = target.targetFingerprint
        activeItemsRef.current = candidate.items
        setBatchImportItems(candidate.items)
        setBatchImportIntent(candidate.intent)
        setIsBatchImportOpen(true)
      } catch {
        setImportFeedback({
          description: t(
            "keyManagement:repairMissingKeys.managedSiteImport.failed",
          ),
          variant: "destructive",
        })
      } finally {
        setIsResolving(false)
      }
    },
    [
      accounts,
      isBatchImportOpen,
      isCurrentSessionResult,
      isResolving,
      progress,
      t,
    ],
  )

  const openBatchImport = useCallback(
    () => prepareBatchImport(),
    [prepareBatchImport],
  )

  const openRegularBatchImport = useCallback(
    () => prepareBatchImport(true),
    [prepareBatchImport],
  )

  const openManagedSiteConfiguration = useCallback(async () => {
    try {
      await openSettingsTabInNewTab(
        BASIC_SETTINGS_ANCHOR_TO_TAB[SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR],
        {
          anchor: SETTINGS_ANCHORS.MANAGED_SITE_SELECTOR,
        },
      )
    } catch {
      setImportFeedback({
        description: t(
          "keyManagement:repairMissingKeys.managedSiteImport.configurationOpenFailed",
        ),
        variant: "destructive",
      })
    }
  }, [t])

  const handleBatchImportCompleted = useCallback(
    (
      result: ManagedSiteTokenBatchExportExecutionResult,
      context?: ManagedSiteTokenBatchExportCompletionContext,
    ) => {
      const receiptItems = getRepairImportReceiptItems({
        candidateItems: activeItemsRef.current,
        result,
        context,
      })
      const jobId = activeJobIdRef.current
      const targetFingerprint = activeTargetFingerprintRef.current

      for (const item of result.items) {
        if (item.result !== "created") continue
        const input = activeItemsRef.current
          .filter(isResolvedManagedSiteTokenBatchExportItemInput)
          .find((candidateItem) => candidateItem.runtimeKey.id === item.id)
        if (!input) continue
        if (!isAccountTokenRuntimeKey(input.runtimeKey)) continue
        void onManagedSiteImportSuccess?.(input.runtimeKey.token)
      }

      if (!jobId || !targetFingerprint || receiptItems.length === 0) return

      void sendAccountKeyRepairMessage(
        AccountKeyRepairMessageTypes.RecordManagedSiteImportResults,
        { jobId, targetFingerprint, items: receiptItems },
      )
        .then((response) => {
          if (response?.success && response.data) {
            setProgress(response.data)
          }
        })
        .catch(() => {
          setImportFeedback({
            description: t(
              "keyManagement:repairMissingKeys.managedSiteImport.receiptFailed",
            ),
            variant: "destructive",
          })
        })
    },
    [onManagedSiteImportSuccess, setProgress, t],
  )

  useEffect(() => {
    if (isOpen) return
    setIsBatchImportOpen(false)
    setBatchImportItems([])
    setBatchImportIntent(null)
    setImportFeedback(null)
    activeJobIdRef.current = null
    activeTargetFingerprintRef.current = null
    activeItemsRef.current = []
  }, [isOpen])

  return {
    batchImportIntent,
    batchImportItems,
    importFeedback,
    isBatchImportOpen,
    isResolving,
    openBatchImport,
    openManagedSiteConfiguration,
    openRegularBatchImport,
    closeBatchImport,
    handleBatchImportCompleted,
    recoverableReferenceCount,
  }
}
