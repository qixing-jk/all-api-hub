import { Storage } from "@plasmohq/storage"

import { RuntimeMessageTypes } from "~/constants/runtimeActions"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  canRunAccountDefaultTokenAutomation,
  createStoredAccountKeyProductContext,
} from "~/services/accounts/keyProductCapabilities"
import { TOKEN_PROVISIONING_REPAIR_POLICY_KINDS } from "~/services/apiAdapters/contracts/tokenProvisioning"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS } from "~/services/core/storageKeys"
import type { DisplaySiteData, SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import type {
  AccountKeyRepairAccountResult,
  AccountKeyRepairDeleteInvalidTokensRequest,
  AccountKeyRepairDeleteInvalidTokensResult,
  AccountKeyRepairManagedSiteImportReceipt,
  AccountKeyRepairProgress,
  AccountKeyRepairRecordManagedSiteImportResultsRequest,
  AccountKeyRepairSkipReason,
  AccountKeyRepairStartOptions,
} from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_ERRORS,
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_SKIP_REASONS,
} from "~/types/accountKeyAutoProvisioning"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import {
  deleteInvalidAccountToken,
  ensureAccountKeysForAvailableGroups,
} from "./groupCoverage"
import {
  AccountKeyRepairMessageTypes,
  onAccountKeyRepairMessage,
} from "./messaging"
import { runPerKeySequential } from "./perOriginQueue"

const logger = createLogger("AccountKeyRepair")

export const ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_RECEIPT_LIMIT = 500
export const ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_REQUEST_ERROR =
  "invalid_managed_site_import_results_request"

const managedSiteImportStatuses = new Set<string>(
  Object.values(ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES),
)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
) => Object.keys(value).every((key) => allowedKeys.includes(key))

const isControlledManagedSiteImportRequest = (
  request: unknown,
): request is AccountKeyRepairRecordManagedSiteImportResultsRequest =>
  isRecord(request) &&
  hasOnlyKeys(request, ["jobId", "targetFingerprint", "items"]) &&
  typeof request.jobId === "string" &&
  typeof request.targetFingerprint === "string" &&
  /^[a-f0-9]{64}$/.test(request.targetFingerprint) &&
  Array.isArray(request.items) &&
  request.items.length > 0 &&
  request.items.every(
    (item) =>
      isRecord(item) &&
      hasOnlyKeys(item, ["accountId", "tokenId", "status"]) &&
      typeof item.accountId === "string" &&
      Number.isSafeInteger(item.tokenId) &&
      typeof item.status === "string" &&
      managedSiteImportStatuses.has(item.status),
  )

/** Rejects runtime payloads that contain fields outside the receipt protocol. */
function assertControlledManagedSiteImportRequest(
  request: unknown,
): asserts request is AccountKeyRepairRecordManagedSiteImportResultsRequest {
  if (!isControlledManagedSiteImportRequest(request)) {
    throw new Error(ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_REQUEST_ERROR)
  }
}

const getManagedSiteImportReceiptKey = (
  receipt: Pick<
    AccountKeyRepairManagedSiteImportReceipt,
    "targetFingerprint" | "accountId" | "tokenId"
  >,
) =>
  JSON.stringify([
    receipt.targetFingerprint,
    receipt.accountId,
    receipt.tokenId,
  ])

const getInvalidTokenDeleteErrorMessage = (error: unknown) => {
  const message = getErrorMessage(error)
  return message === "{}" ? "" : message
}

/**
 * Creates a default idle progress snapshot used when no repair job has started
 * yet (or when the stored progress blob is missing).
 * @returns Idle `AccountKeyRepairProgress` payload.
 */
function createIdleProgress(): AccountKeyRepairProgress {
  return {
    jobId: "idle",
    state: ACCOUNT_KEY_REPAIR_JOB_STATES.Idle,
    totals: {
      enabledAccounts: 0,
      eligibleAccounts: 0,
      processedAccounts: 0,
      processedEligibleAccounts: 0,
    },
    summary: {
      created: 0,
      alreadyHad: 0,
      skipped: 0,
      failed: 0,
    },
    results: [],
  }
}

/**
 * Derives a stable queue key for a site URL so accounts on the same origin are
 * processed sequentially.
 * @param siteUrl - Raw site URL string.
 * @returns Lowercased origin when parsable, otherwise the trimmed input.
 */
function getOriginKey(siteUrl: string): string {
  return normalizeUrlForOriginKey(siteUrl, {
    lowerCase: true,
    stripTrailingSlashes: false,
  })
}

/**
 * Computes whether an account should be skipped by the repair runner.
 * @param account - Stored account record.
 * @returns A skip reason when the account is ineligible, otherwise `null`.
 */
function getSkipReason(
  account: SiteAccount,
): AccountKeyRepairSkipReason | null {
  const policy = getSiteTypeCapabilities(
    account.site_type,
  ).account?.tokenProvisioning?.getRepairPolicy()

  if (policy?.kind === TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Skipped) {
    return policy.skipReason
  }

  if (account.authType === AuthTypeEnum.None) {
    return ACCOUNT_KEY_REPAIR_SKIP_REASONS.NoneAuth
  }

  if (
    !canRunAccountDefaultTokenAutomation(
      createStoredAccountKeyProductContext(account),
    )
  ) {
    return ACCOUNT_KEY_REPAIR_SKIP_REASONS.TokenAutomationUnsupported
  }

  return null
}

class AccountKeyRepairRunner {
  private storage: Storage
  private currentProgress: AccountKeyRepairProgress | null = null
  private currentRun: Promise<void> | null = null
  private currentRunProgress: AccountKeyRepairProgress | null = null
  private currentAbortController: AbortController | null = null
  private progressQueue: Promise<void> = Promise.resolve()

  constructor() {
    this.storage = new Storage({ area: "local" })
  }

  private getReservedRunProgress(): AccountKeyRepairProgress | null {
    return this.currentRunProgress &&
      this.currentProgress?.jobId !== this.currentRunProgress.jobId
      ? this.currentRunProgress
      : null
  }

  async getProgress(): Promise<AccountKeyRepairProgress> {
    const reservedRunProgress = this.getReservedRunProgress()
    if (reservedRunProgress) {
      return reservedRunProgress
    }

    if (this.currentProgress) {
      return this.currentProgress
    }

    const stored = (await this.storage.get(
      ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_PROGRESS,
    )) as AccountKeyRepairProgress | undefined

    if (!stored) {
      return createIdleProgress()
    }

    return await this.terminalizeInactiveRunningProgress(stored)
  }

  async start(
    options: AccountKeyRepairStartOptions = {},
  ): Promise<AccountKeyRepairProgress> {
    if (this.currentRun) {
      const reservedRunProgress = this.getReservedRunProgress()
      if (reservedRunProgress) {
        return reservedRunProgress
      }
      return await this.getProgress()
    }

    const abortController = new AbortController()
    const now = Date.now()
    const progress: AccountKeyRepairProgress = {
      jobId: safeRandomUUID("accountKeyRepair"),
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
      startedAt: now,
      updatedAt: now,
      totals: {
        enabledAccounts: 0,
        eligibleAccounts: 0,
        processedAccounts: 0,
        processedEligibleAccounts: 0,
      },
      summary: {
        created: 0,
        alreadyHad: 0,
        skipped: 0,
        failed: 0,
      },
      results: [],
    }

    this.currentAbortController = abortController
    const initialPersist = this.queueProgressReplacement(progress)
    const runPromise = initialPersist
      .then(() => this.run(progress.jobId, abortController.signal, options))
      .catch((error) => {
        logger.error("Repair run failed to start", error)
      })
      .finally(() => {
        if (this.currentAbortController === abortController) {
          this.currentAbortController = null
        }
        if (this.currentRun === runPromise) {
          this.currentRun = null
        }
        if (this.currentRunProgress === progress) {
          this.currentRunProgress = null
        }
      })
    this.currentRunProgress = progress
    this.currentRun = runPromise
    await initialPersist

    return progress
  }

  async cancel(): Promise<{
    success: true
    data: AccountKeyRepairProgress
  }> {
    const progress = await this.getProgress()

    if (progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Running) {
      return { success: true as const, data: progress }
    }

    this.currentAbortController?.abort()
    this.currentAbortController = null
    await this.queueProgressUpdate((prev) =>
      prev.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Running
        ? {
            ...prev,
            state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
            finishedAt: Date.now(),
          }
        : prev,
    )

    return {
      success: true as const,
      data: this.currentProgress ?? progress,
    }
  }

  private isCurrentJobCancelled(jobId: string, abortSignal: AbortSignal) {
    return (
      abortSignal.aborted ||
      (this.currentProgress?.jobId === jobId &&
        this.currentProgress?.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled)
    )
  }

  private async terminalizeInactiveRunningProgress(
    progress: AccountKeyRepairProgress,
  ): Promise<AccountKeyRepairProgress> {
    if (
      progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Running ||
      this.currentRun
    ) {
      this.currentProgress = progress
      return progress
    }

    const now = Date.now()
    const cancelledProgress = {
      ...progress,
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
      finishedAt: now,
      updatedAt: now,
    }
    this.currentProgress = cancelledProgress
    await this.persistAndNotify()
    return cancelledProgress
  }

  private async run(
    jobId: string,
    abortSignal: AbortSignal,
    options: AccountKeyRepairStartOptions,
  ): Promise<void> {
    try {
      if (this.isCurrentJobCancelled(jobId, abortSignal)) {
        return
      }

      const allAccounts = await accountStorage.getAllAccounts()
      if (this.isCurrentJobCancelled(jobId, abortSignal)) {
        return
      }
      const enabledAccounts = allAccounts.filter(
        (account) => account.disabled !== true,
      )
      const displaySiteDataById = new Map(
        accountStorage
          .convertToDisplayData(allAccounts, allAccounts)
          .map((account) => [account.id, account] as const),
      )

      const eligibleAccounts: SiteAccount[] = []

      this.updateProgress((prev) => ({
        ...prev,
        totals: {
          ...prev.totals,
          enabledAccounts: enabledAccounts.length,
        },
      }))
      await this.persistAndNotify()

      for (const account of enabledAccounts) {
        if (this.isCurrentJobCancelled(jobId, abortSignal)) {
          return
        }

        const skipReason = getSkipReason(account)
        if (skipReason) {
          await this.recordResult({
            accountId: account.id,
            accountName:
              displaySiteDataById.get(account.id)?.name ?? account.site_name,
            siteType: account.site_type,
            siteUrlOrigin: getOriginKey(account.site_url),
            outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
            skipReason,
            finishedAt: Date.now(),
          })
          continue
        }

        eligibleAccounts.push(account)
      }

      this.updateProgress((prev) => ({
        ...prev,
        totals: {
          ...prev.totals,
          eligibleAccounts: eligibleAccounts.length,
        },
      }))
      await this.persistAndNotify()

      await runPerKeySequential({
        items: eligibleAccounts,
        getKey: (account) => getOriginKey(account.site_url),
        shouldContinue: () => !this.isCurrentJobCancelled(jobId, abortSignal),
        worker: async (account) => {
          await this.processEligibleAccount(
            account,
            displaySiteDataById.get(account.id)?.name ?? account.site_name,
            displaySiteDataById,
            abortSignal,
            options,
          )
        },
      })

      if (this.isCurrentJobCancelled(jobId, abortSignal)) {
        return
      }

      this.updateProgress((prev) => ({
        ...prev,
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
        finishedAt: Date.now(),
      }))
      await this.persistAndNotify()
    } catch (error) {
      if (this.isCurrentJobCancelled(jobId, abortSignal)) {
        return
      }

      logger.error("Repair run failed", error)
      this.updateProgress((prev) => ({
        ...prev,
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Failed,
        finishedAt: Date.now(),
        lastError: getErrorMessage(error),
      }))
      await this.persistAndNotify()
    } finally {
      const current = await this.getProgress()
      if (current.jobId !== jobId) {
        logger.warn("Repair runner jobId mismatch; possible concurrent start", {
          jobId,
          currentJobId: current.jobId,
        })
      }
      if (this.currentAbortController?.signal === abortSignal) {
        this.currentAbortController = null
      }
    }
  }

  private async processEligibleAccount(
    account: SiteAccount,
    accountName: string,
    displaySiteDataById: ReadonlyMap<string, DisplaySiteData>,
    abortSignal: AbortSignal,
    options: AccountKeyRepairStartOptions,
  ): Promise<void> {
    const originKey = getOriginKey(account.site_url)
    try {
      if (abortSignal.aborted) {
        return
      }

      const displaySiteData: DisplaySiteData =
        displaySiteDataById.get(account.id) ??
        accountStorage.convertToDisplayData(account)
      const resolvedAccountName = displaySiteData.name || accountName

      const result = await ensureAccountKeysForAvailableGroups({
        account,
        displaySiteData,
        accountName: resolvedAccountName,
        siteUrlOrigin: originKey,
        abortSignal,
        renameAutoTemplateTokens: options.renameAutoTemplateTokens,
      })

      if (abortSignal.aborted) {
        return
      }

      await this.recordResult({
        accountId: account.id,
        accountName: resolvedAccountName,
        siteType: account.site_type,
        siteUrlOrigin: originKey,
        outcome:
          !result.created && result.missingGroups.length > 0
            ? ACCOUNT_KEY_REPAIR_OUTCOMES.Failed
            : result.created
              ? ACCOUNT_KEY_REPAIR_OUTCOMES.Created
              : ACCOUNT_KEY_REPAIR_OUTCOMES.AlreadyHad,
        availableGroups: result.availableGroups,
        coveredGroups: result.coveredGroups,
        createdGroups: result.createdGroups,
        createdTokens: result.createdTokens,
        missingGroups: result.missingGroups,
        invalidTokens: result.invalidTokens,
        renamedTokens: result.renamedTokens,
        renameFailedTokens: result.renameFailedTokens,
        finishedAt: Date.now(),
      })
    } catch (error) {
      if (abortSignal.aborted) {
        return
      }

      await this.recordResult({
        accountId: account.id,
        accountName,
        siteType: account.site_type,
        siteUrlOrigin: originKey,
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
        errorMessage: getErrorMessage(error),
        finishedAt: Date.now(),
      })
    }
  }

  private updateProgress(
    updater: (progress: AccountKeyRepairProgress) => AccountKeyRepairProgress,
  ) {
    const base = this.currentProgress ?? createIdleProgress()
    this.currentProgress = {
      ...updater(base),
      updatedAt: Date.now(),
    }
  }

  private async recordResult(
    result: AccountKeyRepairAccountResult,
  ): Promise<void> {
    await this.queueProgressUpdate((prev) => {
      const nextResults = [...prev.results, result]

      const nextSummary = { ...prev.summary }
      switch (result.outcome) {
        case ACCOUNT_KEY_REPAIR_OUTCOMES.Created:
          nextSummary.created += 1
          break
        case ACCOUNT_KEY_REPAIR_OUTCOMES.AlreadyHad:
          nextSummary.alreadyHad += 1
          break
        case ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped:
          nextSummary.skipped += 1
          break
        case ACCOUNT_KEY_REPAIR_OUTCOMES.Failed:
          nextSummary.failed += 1
          break
        default:
          break
      }

      const isEligibleOutcome =
        result.outcome !== ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped
      const availableGroupCount = result.availableGroups?.length ?? 0
      const coveredGroupCount = result.coveredGroups?.length ?? 0
      const createdKeyCount = result.createdGroups?.length ?? 0
      const invalidKeyCount = result.invalidTokens?.length ?? 0
      const renamedKeyCount = result.renamedTokens?.length ?? 0
      const renameFailedKeyCount = result.renameFailedTokens?.length ?? 0
      const nextProcessedEligibleAccounts = isEligibleOutcome
        ? (prev.totals.processedEligibleAccounts ??
            prev.totals.processedAccounts) + 1
        : prev.totals.processedEligibleAccounts ?? prev.totals.processedAccounts

      return {
        ...prev,
        results: nextResults,
        summary: {
          ...nextSummary,
          availableGroups:
            (prev.summary.availableGroups ?? 0) + availableGroupCount,
          coveredGroups: (prev.summary.coveredGroups ?? 0) + coveredGroupCount,
          createdKeys: (prev.summary.createdKeys ?? 0) + createdKeyCount,
          invalidKeys: (prev.summary.invalidKeys ?? 0) + invalidKeyCount,
          deletedKeys: prev.summary.deletedKeys ?? 0,
          deleteFailed: prev.summary.deleteFailed ?? 0,
          renamedKeys: (prev.summary.renamedKeys ?? 0) + renamedKeyCount,
          renameFailed: (prev.summary.renameFailed ?? 0) + renameFailedKeyCount,
        },
        totals: {
          ...prev.totals,
          processedAccounts: isEligibleOutcome
            ? prev.totals.processedAccounts + 1
            : prev.totals.processedAccounts,
          processedEligibleAccounts: nextProcessedEligibleAccounts,
        },
      }
    })
  }

  async recordInvalidTokenDeletionResultForCurrentProgress(
    result: AccountKeyRepairDeleteInvalidTokensResult,
  ) {
    await this.getProgress()
    await this.queueProgressUpdate((prev) => {
      const deletedIds = new Set(
        result.deleted.map((token) => `${token.accountId}:${token.tokenId}`),
      )
      let removedInvalidTokenCount = 0

      return {
        ...prev,
        results: prev.results.map((accountResult) => {
          const nextInvalidTokens = accountResult.invalidTokens?.filter(
            (token) => {
              const shouldRemove = deletedIds.has(
                `${token.accountId}:${token.tokenId}`,
              )
              if (shouldRemove) {
                removedInvalidTokenCount += 1
              }
              return !shouldRemove
            },
          )

          return {
            ...accountResult,
            invalidTokens: nextInvalidTokens,
          }
        }),
        summary: {
          ...prev.summary,
          invalidKeys: Math.max(
            0,
            (prev.summary.invalidKeys ?? 0) - removedInvalidTokenCount,
          ),
          deletedKeys: (prev.summary.deletedKeys ?? 0) + result.deleted.length,
          deleteFailed: (prev.summary.deleteFailed ?? 0) + result.failed.length,
        },
      }
    })
  }

  async recordManagedSiteImportResultsForCurrentProgress(
    request: unknown,
  ): Promise<AccountKeyRepairProgress> {
    assertControlledManagedSiteImportRequest(request)
    const progress = await this.getProgress()
    if (progress.jobId !== request.jobId) {
      return progress
    }

    await this.queueProgressUpdate((prev) => {
      if (prev.jobId !== request.jobId) {
        return null
      }

      const receiptUpdatedAt = Date.now()
      const receiptsByKey = new Map(
        (prev.managedSiteImportReceipts ?? []).map((receipt) => [
          getManagedSiteImportReceiptKey(receipt),
          receipt,
        ]),
      )

      for (const item of request.items) {
        const receipt: AccountKeyRepairManagedSiteImportReceipt = {
          targetFingerprint: request.targetFingerprint,
          accountId: item.accountId,
          tokenId: item.tokenId,
          status: item.status,
          updatedAt: receiptUpdatedAt,
        }
        receiptsByKey.set(getManagedSiteImportReceiptKey(receipt), receipt)
      }

      const mergedReceipts = Array.from(receiptsByKey.values())
      const boundedReceipts =
        mergedReceipts.length <=
        ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_RECEIPT_LIMIT
          ? mergedReceipts
          : mergedReceipts
              .sort((left, right) => left.updatedAt - right.updatedAt)
              .slice(-ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_RECEIPT_LIMIT)

      return {
        ...prev,
        managedSiteImportReceipts: boundedReceipts,
      }
    })

    return this.currentProgress ?? progress
  }

  private async queueProgressUpdate(
    updater: (
      progress: AccountKeyRepairProgress,
    ) => AccountKeyRepairProgress | null,
  ): Promise<void> {
    const operation = this.enqueueProgressOperation(async () => {
      const previousProgress = this.currentProgress
      const base = previousProgress ?? createIdleProgress()
      const nextProgress = updater(base)
      if (!nextProgress) {
        return
      }
      const pendingProgress = {
        ...nextProgress,
        updatedAt: Date.now(),
      }
      await this.persistProgressWithRollback(pendingProgress, previousProgress)
    })

    await operation
  }

  private async queueProgressReplacement(
    progress: AccountKeyRepairProgress,
  ): Promise<void> {
    const operation = this.enqueueProgressOperation(async () => {
      const previousProgress = this.currentProgress
      await this.persistProgressWithRollback(progress, previousProgress)
    })

    await operation
  }

  private enqueueProgressOperation(
    operation: () => Promise<void>,
  ): Promise<void> {
    const operationPromise = this.progressQueue.then(operation)
    this.progressQueue = operationPromise.catch((error) => {
      logger.error("Failed to persist repair progress update", error)
    })
    return operationPromise
  }

  private async persistProgressWithRollback(
    progress: AccountKeyRepairProgress,
    previousProgress: AccountKeyRepairProgress | null,
  ): Promise<void> {
    this.currentProgress = progress

    try {
      await this.persistAndNotify(progress)
    } catch (error) {
      if (this.currentProgress === progress) {
        this.currentProgress = previousProgress
      }
      throw error
    }
  }

  private async persistAndNotify(
    progress: AccountKeyRepairProgress = this.currentProgress ??
      createIdleProgress(),
  ): Promise<void> {
    await this.storage.set(
      ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_PROGRESS,
      progress,
    )

    try {
      void sendRuntimeMessage(
        {
          type: RuntimeMessageTypes.AccountKeyRepairProgress,
          payload: progress,
        },
        { maxAttempts: 1 },
      ).catch(() => {
        // Silent: UI might not be open
      })
    } catch {
      // Silent: UI might not be open
    }
  }
}

export const accountKeyRepairRunner = new AccountKeyRepairRunner()

/**
 * Start a background repair job for missing account API keys.
 */
export async function startAccountKeyRepair(
  options: AccountKeyRepairStartOptions = {},
) {
  const progress = await accountKeyRepairRunner.start(options)
  return { success: true as const, data: progress }
}

/**
 * Read the latest account-key repair progress snapshot.
 */
export async function getAccountKeyRepairProgress() {
  const progress = await accountKeyRepairRunner.getProgress()
  return { success: true as const, data: progress }
}

/**
 * Cancel the active background repair job, if one is running.
 */
export async function cancelAccountKeyRepair() {
  return await accountKeyRepairRunner.cancel()
}

/**
 * Delete selected invalid account tokens and update the current repair progress.
 */
export async function deleteInvalidAccountTokens(
  request: AccountKeyRepairDeleteInvalidTokensRequest,
) {
  const allAccounts = await accountStorage.getAllAccounts()
  const displaySiteDataById = new Map(
    accountStorage
      .convertToDisplayData(allAccounts, allAccounts)
      .map((account) => [account.id, account] as const),
  )
  const accountById = new Map(
    allAccounts.map((account) => [account.id, account]),
  )
  const deleted: AccountKeyRepairDeleteInvalidTokensResult["deleted"] = []
  const failed: AccountKeyRepairDeleteInvalidTokensResult["failed"] = []

  for (const token of request.tokens) {
    const account = accountById.get(token.accountId)
    const displaySiteData = displaySiteDataById.get(token.accountId)
    if (!account || !displaySiteData) {
      failed.push({
        ...token,
        errorMessage: ACCOUNT_KEY_REPAIR_ERRORS.AccountNotFound,
      })
      continue
    }

    try {
      const result = await deleteInvalidAccountToken({
        token,
        account,
        displaySiteData,
      })
      deleted.push(result)
    } catch (error) {
      failed.push({
        ...token,
        errorMessage:
          getInvalidTokenDeleteErrorMessage(error) ||
          ACCOUNT_KEY_REPAIR_ERRORS.DeleteFailed,
      })
    }
  }

  await accountKeyRepairRunner.recordInvalidTokenDeletionResultForCurrentProgress(
    {
      deleted,
      failed,
    },
  )

  return { success: true as const, data: { deleted, failed } }
}

/**
 * Merge bounded managed-site import receipts into the matching repair job.
 */
export async function recordManagedSiteImportResults(request: unknown) {
  const progress =
    await accountKeyRepairRunner.recordManagedSiteImportResultsForCurrentProgress(
      request,
    )
  return { success: true as const, data: progress }
}

/**
 * Convert account-key repair listener errors into runtime responses.
 */
function toAccountKeyRepairFailure(error: unknown) {
  logger.error("Message handling failed", error)
  return { success: false as const, error: getErrorMessage(error) }
}

let accountKeyRepairMessagingCleanup: (() => void)[] | null = null

/**
 * Register typed background listeners for account-key repair messages.
 */
export function setupAccountKeyRepairMessagingListeners() {
  if (accountKeyRepairMessagingCleanup) {
    return
  }

  accountKeyRepairMessagingCleanup = [
    onAccountKeyRepairMessage(
      AccountKeyRepairMessageTypes.Start,
      async ({ data }) => {
        try {
          return await startAccountKeyRepair(data)
        } catch (error) {
          return toAccountKeyRepairFailure(error)
        }
      },
    ),
    onAccountKeyRepairMessage(AccountKeyRepairMessageTypes.Cancel, async () => {
      try {
        return await cancelAccountKeyRepair()
      } catch (error) {
        return toAccountKeyRepairFailure(error)
      }
    }),
    onAccountKeyRepairMessage(
      AccountKeyRepairMessageTypes.GetProgress,
      async () => {
        try {
          return await getAccountKeyRepairProgress()
        } catch (error) {
          return toAccountKeyRepairFailure(error)
        }
      },
    ),
    onAccountKeyRepairMessage(
      AccountKeyRepairMessageTypes.DeleteInvalidTokens,
      async ({ data }) => {
        try {
          return await deleteInvalidAccountTokens(data)
        } catch (error) {
          return toAccountKeyRepairFailure(error)
        }
      },
    ),
    onAccountKeyRepairMessage(
      AccountKeyRepairMessageTypes.RecordManagedSiteImportResults,
      async ({ data }) => {
        try {
          return await recordManagedSiteImportResults(data)
        } catch (error) {
          return toAccountKeyRepairFailure(error)
        }
      },
    ),
  ]
}
