import { Storage } from "@plasmohq/storage"

import { RuntimeMessageTypes } from "~/constants/runtimeActions"
import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES,
  ACCOUNT_KEY_RECONCILIATION_OUTCOMES,
  reconcileAccountKeyInventory,
  type AccountKeyInventoryReconciliationResult,
} from "~/services/accounts/accountKeyInventoryReconciliation"
import {
  buildAccountKeyResourceRuntimeKeyId,
  buildTargetScopedAccountKeyResourceId,
} from "~/services/accounts/accountRuntimeKeys"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
  type AccountKeyResourceSession,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { runAbortableTask } from "~/services/apiTransport/abortableTask"
import { ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS } from "~/services/core/storageKeys"
import type { SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import type {
  AccountKeyRepairAccountResult,
  AccountKeyRepairDeleteInvalidResourcesRequest,
  AccountKeyRepairDeleteInvalidResourcesResult,
  AccountKeyRepairInvalidResource,
  AccountKeyRepairManagedSiteImportReceipt,
  AccountKeyRepairProgress,
  AccountKeyRepairRecordManagedSiteImportResultsRequest,
  AccountKeyRepairRequirementResult,
  AccountKeyRepairSkipReason,
  AccountKeyRepairStartOptions,
} from "~/types/accountKeyAutoProvisioning"
import {
  ACCOUNT_KEY_REPAIR_ERRORS,
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES,
  ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
  ACCOUNT_KEY_REPAIR_SKIP_REASONS,
} from "~/types/accountKeyAutoProvisioning"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

import {
  AccountKeyRepairMessageTypes,
  onAccountKeyRepairMessage,
} from "./messaging"
import { runPerKeySequential } from "./perOriginQueue"
import {
  captureRepairCreatedRuntimeSecrets,
  discardRepairCreatedRuntimeSecrets,
  resetRepairCreatedRuntimeSecrets,
} from "./repairCreatedRuntimeSecrets"

const logger = createLogger("AccountKeyRepair")

export const ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_RECEIPT_LIMIT = 500
export const ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_REQUEST_ERROR =
  "invalid_managed_site_import_results_request"
const ACCOUNT_KEY_REPAIR_INVALID_RESOURCE_DELETE_LIMIT = 500
const INVALID_RESOURCE_DELETE_OPERATION_TIMEOUT_MS = 30_000

const managedSiteImportStatuses = new Set<string>(
  Object.values(ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_STATUSES),
)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
) => Object.keys(value).every((key) => allowedKeys.includes(key))

const isControlledAccountKeyResourceRef = (
  value: unknown,
): value is AccountKeyRepairInvalidResource["ref"] =>
  isRecord(value) &&
  hasOnlyKeys(value, ["accountId", "siteType", "scopeKey", "resourceId"]) &&
  typeof value.accountId === "string" &&
  value.accountId.length > 0 &&
  isAccountSiteType(value.siteType) &&
  typeof value.scopeKey === "string" &&
  value.scopeKey.length > 0 &&
  typeof value.resourceId === "string" &&
  value.resourceId.length > 0

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
  request.items.length <=
    ACCOUNT_KEY_REPAIR_MANAGED_SITE_IMPORT_RECEIPT_LIMIT &&
  request.items.every(
    (item) =>
      isRecord(item) &&
      hasOnlyKeys(item, ["resourceRef", "status"]) &&
      isControlledAccountKeyResourceRef(item.resourceRef) &&
      typeof item.status === "string" &&
      managedSiteImportStatuses.has(item.status),
  )

const isControlledInvalidResourceDeleteRequest = (
  request: unknown,
): request is AccountKeyRepairDeleteInvalidResourcesRequest => {
  if (
    !isRecord(request) ||
    !hasOnlyKeys(request, ["resources"]) ||
    !Array.isArray(request.resources) ||
    request.resources.length === 0 ||
    request.resources.length > ACCOUNT_KEY_REPAIR_INVALID_RESOURCE_DELETE_LIMIT
  ) {
    return false
  }

  const seenRefs = new Set<string>()
  return request.resources.every((resource) => {
    if (
      !isRecord(resource) ||
      !hasOnlyKeys(resource, [
        "accountId",
        "accountName",
        "siteType",
        "siteUrlOrigin",
        "ref",
        "displayLabel",
        "groupLabel",
        "reason",
      ]) ||
      typeof resource.accountId !== "string" ||
      typeof resource.accountName !== "string" ||
      !isAccountSiteType(resource.siteType) ||
      typeof resource.siteUrlOrigin !== "string" ||
      !isControlledAccountKeyResourceRef(resource.ref) ||
      resource.ref.accountId !== resource.accountId ||
      resource.ref.siteType !== resource.siteType ||
      (resource.displayLabel !== undefined &&
        typeof resource.displayLabel !== "string") ||
      (resource.groupLabel !== undefined &&
        typeof resource.groupLabel !== "string") ||
      typeof resource.reason !== "string"
    ) {
      return false
    }
    const refId = buildAccountKeyResourceRuntimeKeyId(resource.ref)
    if (seenRefs.has(refId)) return false
    seenRefs.add(refId)
    return true
  })
}

/**
 * Rejects runtime payloads that contain fields outside the receipt protocol.
 * In particular, callers cannot supply `updatedAt`; the background owns receipt
 * ordering so untrusted messages cannot displace newer bounded receipts.
 */
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
    "targetFingerprint" | "resourceRef"
  >,
) =>
  buildTargetScopedAccountKeyResourceId(
    receipt.targetFingerprint,
    receipt.resourceRef,
  )

const accountKeyResourceFailureCodes = new Set<string>(
  Object.values(ACCOUNT_KEY_RESOURCE_FAILURE_CODES),
)

const getControlledAccountKeyResourceFailure = (
  error: unknown,
): ResourceFailure | undefined =>
  error instanceof AccountKeyResourceError ||
  (isRecord(error) &&
    isRecord(error.failure) &&
    typeof error.failure.code === "string" &&
    accountKeyResourceFailureCodes.has(error.failure.code))
    ? (error.failure as ResourceFailure)
    : undefined

const mapInvalidDeleteFailure = (error: unknown): ResourceFailure =>
  error instanceof DOMException && error.name === "TimeoutError"
    ? {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
        message: error.message,
      }
    : getControlledAccountKeyResourceFailure(error) ?? {
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
        ...(error instanceof Error && error.message
          ? { message: error.message }
          : {}),
      }

const createEmptySummary = (): AccountKeyRepairProgress["summary"] => ({
  complete: 0,
  partial: 0,
  blocked: 0,
  skipped: 0,
  failed: 0,
  requirements: 0,
  coveredRequirements: 0,
  createdRequirements: 0,
  blockedRequirements: 0,
  rejectedRequirements: 0,
  uncertainRequirements: 0,
  invalidResources: 0,
  renameApplied: 0,
  renameRejected: 0,
  renameUncertain: 0,
  deleteApplied: 0,
  deleteRejected: 0,
  deleteUncertain: 0,
})

const createEmptyAccountItemResults = () => ({
  requirementResults: [],
  createdRefs: [],
  invalidResources: [],
  renameResults: [],
})

const stripCreatedSecrets = (
  requirementResults: AccountKeyInventoryReconciliationResult["requirementResults"],
): AccountKeyRepairRequirementResult[] =>
  requirementResults.map((result) =>
    "created" in result
      ? {
          requirement: result.requirement,
          outcome: result.outcome,
          created: { ref: result.created.ref },
        }
      : result,
  )

const classifyReconciliationResult = (
  result: AccountKeyInventoryReconciliationResult,
): AccountKeyRepairAccountResult["outcome"] => {
  if (
    result.requirementResults.length === 0 &&
    result.inventoryStatus ===
      ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES.Incomplete
  ) {
    return ACCOUNT_KEY_REPAIR_OUTCOMES.Blocked
  }

  if (
    result.inventoryStatus ===
      ACCOUNT_KEY_RECONCILIATION_INVENTORY_STATUSES.Complete &&
    result.requirementResults.every(
      ({ outcome }) =>
        outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered ||
        outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
    ) &&
    result.renameResults.every(
      ({ outcome }) => outcome === ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied,
    )
  ) {
    return result.requirementResults.some(
      ({ outcome }) => outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
    )
      ? ACCOUNT_KEY_REPAIR_OUTCOMES.Repaired
      : ACCOUNT_KEY_REPAIR_OUTCOMES.Covered
  }

  if (
    result.requirementResults.length > 0 &&
    result.requirementResults.every(
      ({ outcome }) =>
        outcome ===
          ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedIncompleteInventory ||
        outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedInputRequired,
    )
  ) {
    return ACCOUNT_KEY_REPAIR_OUTCOMES.Blocked
  }

  return ACCOUNT_KEY_REPAIR_OUTCOMES.Partial
}

/**
 * Creates a default idle progress snapshot used when no repair job has started
 * yet (or when the stored progress blob is missing).
 * @returns Idle `AccountKeyRepairProgress` payload.
 */
function createIdleProgress(): AccountKeyRepairProgress {
  return {
    schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
    jobId: "idle",
    state: ACCOUNT_KEY_REPAIR_JOB_STATES.Idle,
    totals: {
      enabledAccounts: 0,
      eligibleAccounts: 0,
      processedAccounts: 0,
    },
    summary: createEmptySummary(),
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
  if (account.authType === AuthTypeEnum.None) {
    return ACCOUNT_KEY_REPAIR_SKIP_REASONS.NoneAuth
  }

  if (account.site_type === SITE_TYPES.AIHUBMIX) {
    // AIHubMix create responses expose one-time secrets that background
    // coverage cannot recover; remove this skip when native recovery exists.
    return ACCOUNT_KEY_REPAIR_SKIP_REASONS.AihubmixOneTimeKey
  }

  if (!getSiteTypeCapabilities(account.site_type).account?.keyResources) {
    return ACCOUNT_KEY_REPAIR_SKIP_REASONS.ProvisioningUnavailable
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

    if (
      !stored ||
      stored.schemaVersion !== ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION
    ) {
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
      schemaVersion: ACCOUNT_KEY_REPAIR_PROGRESS_SCHEMA_VERSION,
      jobId: safeRandomUUID("accountKeyRepair"),
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
      startedAt: now,
      updatedAt: now,
      totals: {
        enabledAccounts: 0,
        eligibleAccounts: 0,
        processedAccounts: 0,
      },
      summary: createEmptySummary(),
      results: [],
    }

    this.currentAbortController = abortController
    const initialPersist = this.queueProgressReplacement(progress)
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
    await this.queueProgressUpdate((prev) =>
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

    this.currentProgress = progress
    await this.queueProgressUpdate((prev) => ({
      ...prev,
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
      finishedAt: Date.now(),
    }))
    await resetRepairCreatedRuntimeSecrets(progress.jobId)
    return this.currentProgress ?? progress
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

      await this.queueProgressUpdate((prev) => ({
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
          await this.recordResult({
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

      await this.queueProgressUpdate((prev) => ({
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
          await this.processEligibleAccount(
            jobId,
            account,
            displaySiteDataById.get(account.id)?.name ?? account.site_name,
            abortSignal,
            options,
          )
        },
      })

      if (this.isCurrentJobCancelled(jobId, abortSignal)) {
        return
      }

      await this.queueProgressUpdate((prev) => ({
        ...prev,
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
        finishedAt: Date.now(),
      }))
    } catch (error) {
      if (this.isCurrentJobCancelled(jobId, abortSignal)) {
        return
      }

      logger.error("Repair run failed", error)
      await this.queueProgressUpdate((prev) => ({
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

  private async processEligibleAccount(
    jobId: string,
    account: SiteAccount,
    accountName: string,
    abortSignal: AbortSignal,
    options: AccountKeyRepairStartOptions,
  ): Promise<void> {
    const originKey = getOriginKey(account.site_url)
    try {
      if (abortSignal.aborted) {
        return
      }

      const keyResources = getSiteTypeCapabilities(account.site_type).account
        ?.keyResources
      if (!keyResources) {
        await this.recordResult({
          accountId: account.id,
          accountName,
          siteType: account.site_type,
          siteUrlOrigin: originKey,
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.ProvisioningUnavailable,
          ...createEmptyAccountItemResults(),
          finishedAt: Date.now(),
        })
        return
      }

      const { request } = createAccountApiRequestFromStoredAccount(account)
      const session = await keyResources.open(
        {
          account: {
            id: account.id,
            name: accountName,
            siteType: account.site_type,
          },
          request,
        },
        { signal: abortSignal },
      )

      if (abortSignal.aborted) {
        return
      }

      if (!session.provisioning) {
        await this.recordResult({
          accountId: account.id,
          accountName,
          siteType: account.site_type,
          siteUrlOrigin: originKey,
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.ProvisioningUnavailable,
          ...createEmptyAccountItemResults(),
          finishedAt: Date.now(),
        })
        return
      }

      const result = await reconcileAccountKeyInventory(session, {
        signal: abortSignal,
        renameSuggestedResources: options.renameAutoTemplateTokens !== false,
      })

      if (abortSignal.aborted) {
        return
      }

      await captureRepairCreatedRuntimeSecrets(
        jobId,
        result.requirementResults.flatMap((requirementResult) =>
          "created" in requirementResult &&
          requirementResult.created.createdSecret
            ? [
                {
                  ref: requirementResult.created.ref,
                  secret: requirementResult.created.createdSecret.secret,
                },
              ]
            : [],
        ),
      )
      const requirementResults = stripCreatedSecrets(result.requirementResults)

      await this.recordResult({
        accountId: account.id,
        accountName,
        siteType: account.site_type,
        siteUrlOrigin: originKey,
        outcome: classifyReconciliationResult(result),
        inventoryStatus: result.inventoryStatus,
        ...(result.inventoryIssues?.length
          ? { inventoryIssues: [...result.inventoryIssues] }
          : {}),
        ...(result.partialFailure
          ? { partialFailure: result.partialFailure }
          : {}),
        requirementResults,
        createdRefs: requirementResults.flatMap((requirementResult) =>
          "created" in requirementResult ? [requirementResult.created.ref] : [],
        ),
        invalidResources: result.invalidResources.map((resource) => ({
          accountId: account.id,
          accountName,
          siteType: account.site_type,
          siteUrlOrigin: originKey,
          ref: resource.ref,
          ...(resource.displayLabel
            ? { displayLabel: resource.displayLabel }
            : {}),
          ...(resource.groupLabel ? { groupLabel: resource.groupLabel } : {}),
          reason: resource.reasonCode,
        })),
        renameResults: [...result.renameResults],
        finishedAt: Date.now(),
      })
    } catch (error) {
      if (abortSignal.aborted) {
        return
      }

      const failure = getControlledAccountKeyResourceFailure(error)

      await this.recordResult({
        accountId: account.id,
        accountName,
        siteType: account.site_type,
        siteUrlOrigin: originKey,
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
        ...(failure ? { failure } : { errorMessage: getErrorMessage(error) }),
        ...createEmptyAccountItemResults(),
        finishedAt: Date.now(),
      })
    }
  }

  private async recordResult(
    result: AccountKeyRepairAccountResult,
  ): Promise<void> {
    await this.queueProgressUpdate((prev) => {
      const nextResults = [...prev.results, result]

      const nextSummary = { ...prev.summary }
      switch (result.outcome) {
        case ACCOUNT_KEY_REPAIR_OUTCOMES.Covered:
        case ACCOUNT_KEY_REPAIR_OUTCOMES.Repaired:
          nextSummary.complete += 1
          break
        case ACCOUNT_KEY_REPAIR_OUTCOMES.Partial:
          nextSummary.partial += 1
          break
        case ACCOUNT_KEY_REPAIR_OUTCOMES.Blocked:
          nextSummary.blocked += 1
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
      const coveredRequirements = result.requirementResults.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Covered,
      ).length
      const createdRequirements = result.requirementResults.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Created,
      ).length
      const blockedRequirements = result.requirementResults.filter(
        ({ outcome }) =>
          outcome ===
            ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedIncompleteInventory ||
          outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.BlockedInputRequired,
      ).length
      const rejectedRequirements = result.requirementResults.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Rejected,
      ).length
      const uncertainRequirements = result.requirementResults.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.Uncertain ||
          outcome === ACCOUNT_KEY_RECONCILIATION_OUTCOMES.CoveredAfterUncertain,
      ).length
      const renameApplied = result.renameResults.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied,
      ).length
      const renameRejected = result.renameResults.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Rejected,
      ).length
      const renameUncertain = result.renameResults.filter(
        ({ outcome }) =>
          outcome === ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Uncertain,
      ).length

      return {
        ...prev,
        results: nextResults,
        summary: {
          ...nextSummary,
          requirements:
            prev.summary.requirements + result.requirementResults.length,
          coveredRequirements:
            prev.summary.coveredRequirements + coveredRequirements,
          createdRequirements:
            prev.summary.createdRequirements + createdRequirements,
          blockedRequirements:
            prev.summary.blockedRequirements + blockedRequirements,
          rejectedRequirements:
            prev.summary.rejectedRequirements + rejectedRequirements,
          uncertainRequirements:
            prev.summary.uncertainRequirements + uncertainRequirements,
          invalidResources:
            prev.summary.invalidResources + result.invalidResources.length,
          renameApplied: prev.summary.renameApplied + renameApplied,
          renameRejected: prev.summary.renameRejected + renameRejected,
          renameUncertain: prev.summary.renameUncertain + renameUncertain,
        },
        totals: {
          ...prev.totals,
          processedAccounts: isEligibleOutcome
            ? prev.totals.processedAccounts + 1
            : prev.totals.processedAccounts,
        },
      }
    })
  }

  async deleteInvalidResources(
    request: unknown,
  ): Promise<AccountKeyRepairDeleteInvalidResourcesResult> {
    if (!isControlledInvalidResourceDeleteRequest(request)) {
      throw new Error(ACCOUNT_KEY_REPAIR_ERRORS.InvalidResourceDeleteRequest)
    }

    const progress = await this.getProgress()
    const currentInvalidByRef = new Map(
      progress.results.flatMap((accountResult) =>
        accountResult.invalidResources.map(
          (resource) =>
            [
              buildAccountKeyResourceRuntimeKeyId(resource.ref),
              resource,
            ] as const,
        ),
      ),
    )
    const allAccounts = await accountQueries.getAllAccounts()
    const accountById = new Map(
      allAccounts.map((account) => [account.id, account] as const),
    )
    const sessionByAccountId = new Map<string, AccountKeyResourceSession>()
    const results: AccountKeyRepairDeleteInvalidResourcesResult["results"] = []

    for (const requestedResource of request.resources) {
      const resource =
        currentInvalidByRef.get(
          buildAccountKeyResourceRuntimeKeyId(requestedResource.ref),
        ) ?? requestedResource
      const account = accountById.get(resource.accountId)
      const accountCapabilities = account
        ? getSiteTypeCapabilities(account.site_type).account
        : undefined
      if (
        !account ||
        account.site_type !== resource.siteType ||
        getOriginKey(account.site_url) !== resource.siteUrlOrigin ||
        !currentInvalidByRef.has(
          buildAccountKeyResourceRuntimeKeyId(resource.ref),
        ) ||
        !accountCapabilities?.keyResources
      ) {
        results.push({
          resource,
          outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Rejected,
          failure: {
            code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
          },
          finishedAt: Date.now(),
        })
        continue
      }

      try {
        const { request: apiRequest } =
          createAccountApiRequestFromStoredAccount(account)
        let session = sessionByAccountId.get(account.id)
        if (!session) {
          session = await runAbortableTask(
            (signal) =>
              accountCapabilities.keyResources!.open(
                {
                  account: {
                    id: account.id,
                    name: resource.accountName,
                    siteType: account.site_type,
                  },
                  request: apiRequest,
                },
                signal ? { signal } : undefined,
              ),
            { timeoutMs: INVALID_RESOURCE_DELETE_OPERATION_TIMEOUT_MS },
          )
          sessionByAccountId.set(account.id, session)
        }
        const collection = await runAbortableTask(
          (signal) =>
            session.openCollection(
              resource.ref.scopeKey,
              signal ? { signal } : undefined,
            ),
          { timeoutMs: INVALID_RESOURCE_DELETE_OPERATION_TIMEOUT_MS },
        )
        await runAbortableTask(
          (signal) =>
            collection.delete(resource.ref, signal ? { signal } : undefined),
          { timeoutMs: INVALID_RESOURCE_DELETE_OPERATION_TIMEOUT_MS },
        )
        results.push({
          resource,
          outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Applied,
          finishedAt: Date.now(),
        })
      } catch (error) {
        const failure = mapInvalidDeleteFailure(error)
        results.push(
          failure.code ===
            ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain
            ? {
                resource,
                outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Uncertain,
                failure,
                finishedAt: Date.now(),
              }
            : {
                resource,
                outcome: ACCOUNT_KEY_REPAIR_MUTATION_OUTCOMES.Rejected,
                failure,
                finishedAt: Date.now(),
              },
        )
      }
    }

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

    await this.queueProgressUpdate((prev) => ({
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
    progress: AccountKeyRepairProgress,
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
