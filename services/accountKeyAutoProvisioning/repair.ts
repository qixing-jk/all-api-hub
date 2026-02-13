import { Storage } from "@plasmohq/storage"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { SUB2API } from "~/constants/siteType"
import { accountStorage } from "~/services/accountStorage"
import { ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS } from "~/services/storageKeys"
import type { DisplaySiteData, SiteAccount } from "~/types"
import { AuthTypeEnum } from "~/types"
import type {
  AccountKeyRepairAccountResult,
  AccountKeyRepairProgress,
  AccountKeyRepairSkipReason,
} from "~/types/accountKeyAutoProvisioning"
import { sendRuntimeMessage } from "~/utils/browserApi"
import { getErrorMessage } from "~/utils/error"
import { safeRandomUUID } from "~/utils/identifier"
import { createLogger } from "~/utils/logger"

import { ensureDefaultApiTokenForAccount } from "./ensureDefaultToken"
import { runPerKeySequential } from "./perOriginQueue"

const logger = createLogger("AccountKeyRepair")

export const ACCOUNT_KEY_REPAIR_PROGRESS_MESSAGE_TYPE =
  "ACCOUNT_KEY_REPAIR_PROGRESS"

/**
 * Creates a default idle progress snapshot used when no repair job has started
 * yet (or when the stored progress blob is missing).
 * @returns Idle `AccountKeyRepairProgress` payload.
 */
function createIdleProgress(): AccountKeyRepairProgress {
  return {
    jobId: "idle",
    state: "idle",
    totals: {
      enabledAccounts: 0,
      eligibleAccounts: 0,
      processedAccounts: 0,
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
  try {
    return new URL(siteUrl).origin.toLowerCase()
  } catch {
    return siteUrl.trim().toLowerCase()
  }
}

/**
 * Computes whether an account should be skipped by the repair runner.
 * @param account - Stored account record.
 * @returns A skip reason when the account is ineligible, otherwise `null`.
 */
function getSkipReason(
  account: SiteAccount,
): AccountKeyRepairSkipReason | null {
  if (account.site_type === SUB2API) {
    return "sub2api"
  }

  if (account.authType === AuthTypeEnum.None) {
    return "noneAuth"
  }

  return null
}

class AccountKeyRepairRunner {
  private storage: Storage
  private currentProgress: AccountKeyRepairProgress | null = null
  private currentRun: Promise<void> | null = null
  private progressQueue: Promise<void> = Promise.resolve()

  constructor() {
    this.storage = new Storage({ area: "local" })
  }

  async getProgress(): Promise<AccountKeyRepairProgress> {
    if (this.currentProgress) {
      return this.currentProgress
    }

    const stored = (await this.storage.get(
      ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_PROGRESS,
    )) as AccountKeyRepairProgress | undefined

    if (!stored) {
      return createIdleProgress()
    }

    this.currentProgress = stored
    return stored
  }

  async start(): Promise<AccountKeyRepairProgress> {
    if (this.currentRun) {
      return await this.getProgress()
    }

    const now = Date.now()
    const progress: AccountKeyRepairProgress = {
      jobId: safeRandomUUID("accountKeyRepair"),
      state: "running",
      startedAt: now,
      updatedAt: now,
      totals: {
        enabledAccounts: 0,
        eligibleAccounts: 0,
        processedAccounts: 0,
      },
      summary: {
        created: 0,
        alreadyHad: 0,
        skipped: 0,
        failed: 0,
      },
      results: [],
    }

    this.currentProgress = progress
    await this.persistAndNotify()

    this.currentRun = this.run(progress.jobId).finally(() => {
      this.currentRun = null
    })

    return progress
  }

  private async run(jobId: string): Promise<void> {
    try {
      const enabledAccounts = await accountStorage.getEnabledAccounts()

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
        const skipReason = getSkipReason(account)
        if (skipReason) {
          await this.recordResult({
            accountId: account.id,
            accountName: account.site_name,
            siteType: account.site_type,
            siteUrlOrigin: getOriginKey(account.site_url),
            outcome: "skipped",
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
        worker: async (account) => {
          await this.processEligibleAccount(account)
        },
      })

      this.updateProgress((prev) => ({
        ...prev,
        state: "completed",
        finishedAt: Date.now(),
      }))
      await this.persistAndNotify()
    } catch (error) {
      logger.error("Repair run failed", error)
      this.updateProgress((prev) => ({
        ...prev,
        state: "failed",
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
    }
  }

  private async processEligibleAccount(account: SiteAccount): Promise<void> {
    const originKey = getOriginKey(account.site_url)
    try {
      const displaySiteData = accountStorage.convertToDisplayData(
        account,
      ) as DisplaySiteData

      const result = await ensureDefaultApiTokenForAccount({
        account,
        displaySiteData,
      })

      await this.recordResult({
        accountId: account.id,
        accountName: account.site_name,
        siteType: account.site_type,
        siteUrlOrigin: originKey,
        outcome: result.created ? "created" : "alreadyHad",
        finishedAt: Date.now(),
      })
    } catch (error) {
      await this.recordResult({
        accountId: account.id,
        accountName: account.site_name,
        siteType: account.site_type,
        siteUrlOrigin: originKey,
        outcome: "failed",
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
        case "created":
          nextSummary.created += 1
          break
        case "alreadyHad":
          nextSummary.alreadyHad += 1
          break
        case "skipped":
          nextSummary.skipped += 1
          break
        case "failed":
          nextSummary.failed += 1
          break
        default:
          break
      }

      return {
        ...prev,
        results: nextResults,
        summary: nextSummary,
        totals: {
          ...prev.totals,
          processedAccounts: nextResults.length,
        },
      }
    })
  }

  private async queueProgressUpdate(
    updater: (progress: AccountKeyRepairProgress) => AccountKeyRepairProgress,
  ): Promise<void> {
    this.progressQueue = this.progressQueue
      .then(async () => {
        this.updateProgress(updater)
        await this.persistAndNotify()
      })
      .catch((error) => {
        logger.error("Failed to persist repair progress update", error)
      })

    await this.progressQueue
  }

  private async persistAndNotify(): Promise<void> {
    const progress = this.currentProgress ?? createIdleProgress()
    await this.storage.set(
      ACCOUNT_KEY_AUTO_PROVISIONING_STORAGE_KEYS.REPAIR_PROGRESS,
      progress,
    )

    try {
      void sendRuntimeMessage(
        {
          type: ACCOUNT_KEY_REPAIR_PROGRESS_MESSAGE_TYPE,
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

export const handleAccountKeyRepairMessage = async (
  request: any,
  sendResponse: (response: any) => void,
) => {
  try {
    switch (request.action) {
      case RuntimeActionIds.AccountKeyRepairStart: {
        const progress = await accountKeyRepairRunner.start()
        sendResponse({ success: true, data: progress })
        break
      }

      case RuntimeActionIds.AccountKeyRepairGetProgress: {
        const progress = await accountKeyRepairRunner.getProgress()
        sendResponse({ success: true, data: progress })
        break
      }

      default:
        sendResponse({ success: false, error: "Unknown action" })
    }
  } catch (error) {
    logger.error("Message handling failed", error)
    sendResponse({ success: false, error: getErrorMessage(error) })
  }
}
