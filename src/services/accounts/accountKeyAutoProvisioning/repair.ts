import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import {
  buildAccountKeyResourceRuntimeKeyId,
  buildTargetScopedAccountKeyResourceId,
} from "~/services/accounts/keys/accountRuntimeKeys"
import {
  getInventorySecretAvailability,
  INVENTORY_SECRET_AVAILABILITIES,
} from "~/services/apiAdapters/contracts/inventorySecret"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import type {
  AccountKeyRepairDeleteInvalidResourcesRequest,
  AccountKeyRepairDeleteInvalidResourcesResult,
  AccountKeyRepairManagedSiteImportReceipt,
  AccountKeyRepairProgress,
  AccountKeyRepairSkipReason,
  AccountKeyRepairStartOptions,
} from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES,
  ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_SKIP_REASONS,
} from "~/types/accountKeyAutoProvisioning"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"

import {
  createEmptyAccountItemResults,
  executeAccountKeyRepair,
  getOriginKey,
} from "./accountRepairExecution"
import { deleteInvalidRepairResources } from "./deleteInvalidRepairResources"
import {
  AccountKeyRepairMessageTypes,
  onAccountKeyRepairMessage,
} from "./messaging"
import { runPerKeySequential } from "./perOriginQueue"
import {
  discardRepairCreatedRuntimeSecrets,
  resetRepairCreatedRuntimeSecrets,
} from "./repairCreatedRuntimeSecrets"
import { AccountKeyRepairProgressStore } from "./repairProgressStore"
import {
  ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_RECEIPT_LIMIT,
  assertControlledManagedSiteImportRequest,
  assertInvalidResourceDeleteRequest,
} from "./repairRequestValidation"

const logger = createLogger("AccountKeyRepair")

// A job can accumulate target/resource pairs until the next manual run, so
// retain recency eviction independently of the browser's storage quota.

const getManagedSiteImportReceiptKey = (
  receipt: Pick<
    AccountKeyRepairManagedSiteImportReceipt,
    "targetFingerprint" | "resourceRef"
  >,
) =>
  buildTargetScopedAccountKeyResourceId(
    receipt.targetFingerprint,
    receipt.resourceRef,
  )

/**
 * Computes whether an account should be skipped by the repair runner.
 * @param account - Stored account record.
 * @returns A skip reason when the account is ineligible, otherwise `null`.
 */
function getSkipReason(
  account: SiteAccount,
): AccountKeyRepairSkipReason | null {
  if (account.authType === AuthTypeEnum.None) {
    return ACCOUNT_KEY_REPAIR_SKIP_REASONS.NoneAuth
  }

  const capabilities = getSiteTypeCapabilities(account.site_type).account
  if (
    capabilities?.keyResourceManagement &&
    getInventorySecretAvailability(capabilities.keyResourceManagement) ===
      INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly
  ) {
    // Keep the persisted skip code while deriving eligibility from secret availability.
    return ACCOUNT_KEY_REPAIR_SKIP_REASONS.OneTimeKey
  }

  if (!capabilities?.keyResourceManagement) {
    return ACCOUNT_KEY_REPAIR_SKIP_REASONS.ProvisioningUnavailable
  }

  return null
}

class AccountKeyRepairRunner {
  private readonly progressStore = new AccountKeyRepairProgressStore()
  private currentRun: Promise<void> | null = null
  private currentRunProgress: AccountKeyRepairProgress | null = null
  private currentAbortController: AbortController | null = null

  private getReservedRunProgress(): AccountKeyRepairProgress | null {
    return this.currentRunProgress &&
      this.progressStore.current?.jobId !== this.currentRunProgress.jobId
      ? this.currentRunProgress
      : null
  }

  async getProgress(): Promise<AccountKeyRepairProgress> {
    const reservedRunProgress = this.getReservedRunProgress()
    if (reservedRunProgress) {
      return reservedRunProgress
    }

    if (this.progressStore.current) {
      return this.progressStore.current
    }

    const stored = await this.progressStore.read()

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
    this.currentAbortController = abortController
    const { progress, persisted: initialPersist } = this.progressStore.begin(
      safeRandomUUID("accountKeyRepair"),
      now,
    )
    const runPromise = initialPersist
      .then(async () => {
        await resetRepairCreatedRuntimeSecrets(progress.jobId)
        await this.run(progress.jobId, abortController.signal, options)
      })
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
    await this.progressStore.update((prev) =>
      prev.state === ACCOUNT_KEY_REPAIR_JOB_STATES.Running
        ? {
            ...prev,
            state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
            finishedAt: Date.now(),
          }
        : prev,
    )
    await resetRepairCreatedRuntimeSecrets(progress.jobId)

    return {
      success: true as const,
      data: this.progressStore.current ?? progress,
    }
  }

  private isCurrentJobCancelled(jobId: string, abortSignal: AbortSignal) {
    return (
      abortSignal.aborted ||
      (this.progressStore.current?.jobId === jobId &&
        this.progressStore.current?.state ===
          ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled)
    )
  }

  private async terminalizeInactiveRunningProgress(
    progress: AccountKeyRepairProgress,
  ): Promise<AccountKeyRepairProgress> {
    if (
      progress.state !== ACCOUNT_KEY_REPAIR_JOB_STATES.Running ||
      this.currentRun
    ) {
      return progress
    }

    await this.progressStore.update((prev) => ({
      ...prev,
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
      finishedAt: Date.now(),
    }))
    await resetRepairCreatedRuntimeSecrets(progress.jobId)
    return this.progressStore.current ?? progress
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

      const allAccounts = await accountQueries.getAllAccounts()
      if (this.isCurrentJobCancelled(jobId, abortSignal)) {
        return
      }
      const enabledAccounts = allAccounts.filter(
        (account) => account.disabled !== true,
      )
      const displaySiteDataById = new Map(
        accountPresentation
          .convertToDisplayData(allAccounts)
          .map((account) => [account.id, account] as const),
      )

      const eligibleAccounts: SiteAccount[] = []

      await this.progressStore.update((prev) => ({
        ...prev,
        totals: {
          ...prev.totals,
          enabledAccounts: enabledAccounts.length,
        },
      }))
      for (const account of enabledAccounts) {
        if (this.isCurrentJobCancelled(jobId, abortSignal)) {
          return
        }

        const skipReason = getSkipReason(account)
        if (skipReason) {
          await this.progressStore.recordResult({
            accountId: account.id,
            accountName:
              displaySiteDataById.get(account.id)?.name ?? account.site_name,
            siteType: account.site_type,
            siteUrlOrigin: getOriginKey(account.site_url),
            outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
            skipReason,
            ...createEmptyAccountItemResults(),
            finishedAt: Date.now(),
          })
          continue
        }

        eligibleAccounts.push(account)
      }

      await this.progressStore.update((prev) => ({
        ...prev,
        totals: {
          ...prev.totals,
          eligibleAccounts: eligibleAccounts.length,
        },
      }))
      await runPerKeySequential({
        items: eligibleAccounts,
        getKey: (account) => getOriginKey(account.site_url),
        shouldContinue: () => !this.isCurrentJobCancelled(jobId, abortSignal),
        worker: async (account) => {
          await executeAccountKeyRepair({
            jobId,
            account,
            accountName:
              displaySiteDataById.get(account.id)?.name ?? account.site_name,
            abortSignal,
            options,
            recordResult: (result) => this.progressStore.recordResult(result),
          })
        },
      })

      if (this.isCurrentJobCancelled(jobId, abortSignal)) {
        return
      }

      await this.progressStore.update((prev) => ({
        ...prev,
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
        finishedAt: Date.now(),
      }))
    } catch (error) {
      if (this.isCurrentJobCancelled(jobId, abortSignal)) {
        return
      }

      logger.error("Repair run failed", error)
      await this.progressStore.update((prev) => ({
        ...prev,
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Failed,
        finishedAt: Date.now(),
        lastError: getErrorMessage(error),
      }))
      await resetRepairCreatedRuntimeSecrets(jobId)
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

  async deleteInvalidResources(
    request: unknown,
  ): Promise<AccountKeyRepairDeleteInvalidResourcesResult> {
    assertInvalidResourceDeleteRequest(request)

    const progress = await this.getProgress()
    const { results } = await deleteInvalidRepairResources(request, progress)

    const appliedRefKeys = new Set(
      results.flatMap((result) =>
        result.outcome === ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied
          ? [buildAccountKeyResourceRuntimeKeyId(result.resource.ref)]
          : [],
      ),
    )
    const deleteApplied = results.filter(
      ({ outcome }) => outcome === ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied,
    ).length
    const deleteRejected = results.filter(
      ({ outcome }) =>
        outcome === ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Rejected,
    ).length
    const deleteUncertain = results.filter(
      ({ outcome }) =>
        outcome === ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Uncertain,
    ).length

    await this.progressStore.update((prev) => ({
      ...prev,
      results: prev.results.map((accountResult) => ({
        ...accountResult,
        invalidResources: accountResult.invalidResources.filter(
          (resource) =>
            !appliedRefKeys.has(
              buildAccountKeyResourceRuntimeKeyId(resource.ref),
            ),
        ),
      })),
      summary: {
        ...prev.summary,
        invalidResources: Math.max(
          0,
          prev.summary.invalidResources - deleteApplied,
        ),
        deleteApplied: prev.summary.deleteApplied + deleteApplied,
        deleteRejected: prev.summary.deleteRejected + deleteRejected,
        deleteUncertain: prev.summary.deleteUncertain + deleteUncertain,
      },
    }))

    return { results }
  }

  async recordManagedSiteImportResultsForCurrentProgress(
    request: unknown,
  ): Promise<AccountKeyRepairProgress> {
    assertControlledManagedSiteImportRequest(request)
    const progress = await this.getProgress()
    if (progress.jobId !== request.jobId) {
      return progress
    }

    await this.progressStore.update((prev) => {
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
          resourceRef: item.resourceRef,
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

    await discardRepairCreatedRuntimeSecrets(
      request.jobId,
      request.items.flatMap((item) =>
        item.status ===
          ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.Created ||
        item.status ===
          ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES.AlreadyPresent
          ? [item.resourceRef]
          : [],
      ),
    )

    return this.progressStore.current ?? progress
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
async function getAccountKeyRepairProgress() {
  const progress = await accountKeyRepairRunner.getProgress()
  return { success: true as const, data: progress }
}

/**
 * Cancel the active background repair job, if one is running.
 */
async function cancelAccountKeyRepair() {
  return await accountKeyRepairRunner.cancel()
}

/**
 * Delete selected invalid account key resources and update the current repair progress.
 */
export async function deleteInvalidAccountKeyResources(
  request: AccountKeyRepairDeleteInvalidResourcesRequest,
): Promise<{
  success: true
  data: AccountKeyRepairDeleteInvalidResourcesResult
}> {
  return {
    success: true,
    data: await accountKeyRepairRunner.deleteInvalidResources(request),
  }
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
      AccountKeyRepairMessageTypes.DeleteInvalidResources,
      async ({ data }) => {
        try {
          return await deleteInvalidAccountKeyResources(data)
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
