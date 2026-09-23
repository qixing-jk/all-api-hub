import { Storage } from "@plasmohq/storage"

import { isAccountSiteType, type AccountSiteType } from "~/constants/siteType"
import {
  SITE_TYPE_OBSERVATION_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { createLogger } from "~/utils/core/logger"
import { isPlainObject } from "~/utils/core/object"

import type { SiteTypeMismatch } from "./siteTypeMismatch"

const logger = createLogger("SiteTypeObservations")

const STORAGE_KEY = SITE_TYPE_OBSERVATION_STORAGE_KEYS.OBSERVATIONS

/**
 * What one site said about itself while an account could not use it, plus when it
 * was recorded. The record stays inside the store: readers get the mismatch that
 * still applies to an account, never the raw persisted set.
 */
interface SiteTypeObservation extends SiteTypeMismatch {
  at: number
}

type SiteTypeObservationMap = Record<string, SiteTypeObservation>

/** Observations that still apply to their account, keyed by account id. */
export type SiteTypeMismatchMap = Record<string, SiteTypeMismatch>

/** The account facts that decide whether a recorded observation still applies. */
interface SiteTypeObservationSubject {
  id: string
  siteType: AccountSiteType
}

/**
 * A site-type edit after the observation was recorded makes it inapplicable:
 * reporting it would name a type the account no longer has.
 */
function observationAppliesTo(
  observation: SiteTypeObservation,
  siteType: AccountSiteType,
): boolean {
  return observation.storedSiteType === siteType
}

/** Narrows one persisted entry, dropping anything written by an older shape. */
function normalizeObservation(value: unknown): SiteTypeObservation | null {
  if (!isPlainObject(value)) return null
  if (
    !isAccountSiteType(value.storedSiteType) ||
    !isAccountSiteType(value.suggestedSiteType)
  ) {
    return null
  }
  if (typeof value.at !== "number" || !Number.isFinite(value.at)) return null

  return {
    storedSiteType: value.storedSiteType,
    suggestedSiteType: value.suggestedSiteType,
    at: value.at,
  }
}

/** Keeps only the entries whose persisted shape this build still understands. */
function normalizeObservations(stored: unknown): SiteTypeObservationMap {
  if (!isPlainObject(stored)) return {}

  const observations: SiteTypeObservationMap = {}
  for (const [accountId, value] of Object.entries(stored)) {
    const normalized = normalizeObservation(value)
    if (normalized) observations[accountId] = normalized
  }
  return observations
}

/**
 * Records which type each site resolves to when an account cannot use it, and
 * answers what still applies to an account.
 *
 * This is runtime observation, not user configuration: it is kept out of both
 * the account record and the check-in status, so account saves, imports, config
 * normalization, and check-in bookkeeping cannot drop or overwrite it, and any
 * feature can read it without loading another feature's state.
 */
class SiteTypeObservationStore {
  private storage = new Storage({ area: "local" })

  /**
   * Reads every recorded observation, including ones a later site-type edit
   * retired. A failed read reports none: callers treat this as advice they may
   * not have, never as proof that nothing was observed.
   *
   * Kept private so the retired-advice rule cannot be bypassed: every read a
   * caller can reach runs through `readForAccounts`.
   */
  private async readAll(): Promise<SiteTypeObservationMap> {
    try {
      return normalizeObservations(await this.storage.get(STORAGE_KEY))
    } catch (error) {
      logger.warn("Site type observations could not be read", { error })
      return {}
    }
  }

  /**
   * Reads the observations that still apply to the given accounts.
   *
   * The account-scoped read is the way in for anything that reports a stored
   * type to a user, because the store owns the rule that a later site-type edit
   * retires an observation: no caller can report a type an account no longer
   * has, and a caller that lacks the account cannot read the advice at all.
   */
  async readForAccounts(
    accounts: readonly SiteTypeObservationSubject[],
  ): Promise<SiteTypeMismatchMap> {
    const observations = await this.readAll()
    const applicable: SiteTypeMismatchMap = {}

    for (const account of accounts) {
      const observation = observations[account.id]
      if (
        !observation ||
        !observationAppliesTo(observation, account.siteType)
      ) {
        continue
      }

      applicable[account.id] = {
        storedSiteType: observation.storedSiteType,
        suggestedSiteType: observation.suggestedSiteType,
      }
    }

    return applicable
  }

  /** Reads the observation that still applies to one account, if any. */
  async readForAccount(
    accountId: string,
    siteType: AccountSiteType,
  ): Promise<SiteTypeMismatch | null> {
    const applicable = await this.readForAccounts([{ id: accountId, siteType }])

    return applicable[accountId] ?? null
  }

  /** Records the mismatch one account's site resolved to. Never fails the caller's flow. */
  async record(input: {
    accountId: string
    mismatch: SiteTypeMismatch
    at?: number
  }): Promise<void> {
    await this.mutate((current) => ({
      ...current,
      [input.accountId]: { ...input.mismatch, at: input.at ?? Date.now() },
    }))
  }

  /**
   * Retires the observation for one account, once a later reading shows it no
   * longer holds. Never fails the caller's flow.
   */
  async clear(accountId: string): Promise<void> {
    await this.mutate((current) => {
      if (!(accountId in current)) return current

      const remaining: SiteTypeObservationMap = {}
      for (const [id, observation] of Object.entries(current)) {
        if (id === accountId) continue
        remaining[id] = observation
      }

      return remaining
    })
  }

  /**
   * Applies one read-modify-write under the store's lock. The read happens
   * inside the lock, and a failed read skips the write: patching an unknown base
   * would drop observations recorded in between.
   */
  private async mutate(
    update: (current: SiteTypeObservationMap) => SiteTypeObservationMap,
  ): Promise<void> {
    try {
      await withExtensionStorageWriteLock(
        STORAGE_LOCKS.SITE_TYPE_OBSERVATIONS,
        async () => {
          let current: SiteTypeObservationMap
          try {
            current = normalizeObservations(await this.storage.get(STORAGE_KEY))
          } catch (error) {
            logger.error(
              "Site type observations could not be read for update",
              {
                error,
              },
            )
            return
          }

          const next = update(current)
          if (next === current) return

          await this.storage.set(STORAGE_KEY, next)
        },
      )
    } catch (error) {
      logger.warn("Site type observations could not be recorded", { error })
    }
  }
}

export const siteTypeObservations = new SiteTypeObservationStore()
