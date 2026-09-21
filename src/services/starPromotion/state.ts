import { Storage } from "@plasmohq/storage"

import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { createLogger } from "~/utils/core/logger"

import {
  addCheckinSuccessesOnState,
  completeStarPromotionOnState,
  createDefaultStarPromotionState,
  deferThresholdPromptOnState,
  normalizeStarPromotionState,
  resolveAccountBaseline,
  shouldShowThresholdPromptOnState,
  type StarPromotionState,
} from "./contracts"

/**
 * Unified logger scoped to the star promotion state service.
 */
const logger = createLogger("StarPromotionState")

/**
 * Persists GitHub star promotion state and applies the star/cooldown
 * transitions. Star completion is terminal across every CTA surface.
 */
class StarPromotionStateService {
  private storage: Storage

  constructor() {
    this.storage = new Storage({ area: "local" })
  }

  /** Reads the normalized promotion state, falling back to defaults. */
  async getState(): Promise<StarPromotionState> {
    try {
      const raw = await this.storage.get(STORAGE_KEYS.STAR_PROMOTION_STATE)
      return normalizeStarPromotionState(raw)
    } catch (error) {
      logger.warn("Failed to read star promotion state", {
        error: error instanceof Error ? error.message : String(error),
      })
      return createDefaultStarPromotionState()
    }
  }

  /**
   * Whether the value threshold currently allows a prompt display. The card is
   * persistent, so this stays true until the user resolves or defers it.
   * Account count is read live; failures degrade to the check-in signal only.
   */
  async isThresholdPromptDue(): Promise<boolean> {
    const [state, accountCount] = await Promise.all([
      this.getState(),
      this.readAccountCount(),
    ])

    const resolvedBaseline = resolveAccountBaseline(state, accountCount)
    if (resolvedBaseline !== state.baselineAccountCount) {
      // Persist the lowered high-water mark so a user who deleted accounts is
      // not stranded below an old peak until their next deferral.
      await this.mutateState((current) => ({
        ...current,
        baselineAccountCount: resolveAccountBaseline(current, accountCount),
      }))
    }

    return shouldShowThresholdPromptOnState(state, {
      now: Date.now(),
      accountCount,
    })
  }

  /** Accumulates successful auto check-ins toward the next threshold. */
  async addCheckinSuccesses(count: number): Promise<void> {
    if (!Number.isFinite(count) || count <= 0) {
      return
    }

    await this.mutateState((state) => addCheckinSuccessesOnState(state, count))
  }

  /** Applies a non-star exit ("not now" or the close control). */
  async deferThresholdPrompt(): Promise<void> {
    // Pass the live count: a deferral anchors the next ask to the accounts the
    // user actually has right now.
    const accountCount = await this.readAccountCount()
    await this.mutateState((state) =>
      deferThresholdPromptOnState(state, { now: Date.now(), accountCount }),
    )
  }

  /** Terminal completion after a star click, self-report, or detection. */
  async markCompleted(): Promise<void> {
    await this.mutateState(completeStarPromotionOnState)
  }

  /** Restores the default promotion state. Dev tooling only. */
  async reset(): Promise<void> {
    try {
      await withExtensionStorageWriteLock(STORAGE_LOCKS.STAR_PROMOTION, () =>
        this.storage.remove(STORAGE_KEYS.STAR_PROMOTION_STATE),
      )
    } catch (error) {
      logger.warn("Failed to reset star promotion state", {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Reads the managed-account count. Returns `undefined` on storage failure so
   * callers fall back to the check-in signal instead of showing a stale gate.
   */
  private async readAccountCount(): Promise<number | undefined> {
    try {
      return (await accountQueries.getAllAccounts()).length
    } catch (error) {
      logger.debug("Account count unavailable for star prompt evaluation", {
        error: error instanceof Error ? error.message : String(error),
      })
      return undefined
    }
  }

  private async mutateState(
    transform: (state: StarPromotionState) => StarPromotionState,
  ): Promise<void> {
    try {
      await withExtensionStorageWriteLock(
        STORAGE_LOCKS.STAR_PROMOTION,
        async () => {
          const current = normalizeStarPromotionState(
            await this.storage.get(STORAGE_KEYS.STAR_PROMOTION_STATE),
          )
          await this.storage.set(
            STORAGE_KEYS.STAR_PROMOTION_STATE,
            transform(current),
          )
        },
      )
    } catch (error) {
      logger.warn("Failed to update star promotion state", {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export const starPromotionState = new StarPromotionStateService()
