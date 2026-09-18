import { Storage } from "@plasmohq/storage"

import {
  isAccountLoginProvider,
  type AccountLoginProvider,
} from "~/constants/accountLogin"
import { LOGIN_PROVIDER_EVIDENCE_STORAGE_KEYS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import type { LoginProviderEvidenceOutcome } from "~/types/loginProviderEvidence"
import {
  LOGIN_PROVIDER_EVIDENCE_OUTCOMES,
  type LoginProviderEvidence,
  type LoginProviderEvidenceMap,
} from "~/types/loginProviderEvidence"
import { createLogger } from "~/utils/core/logger"
import { isPlainObject } from "~/utils/core/object"

const logger = createLogger("LoginProviderEvidence")

const STORAGE_KEY = LOGIN_PROVIDER_EVIDENCE_STORAGE_KEYS.EVIDENCE

export const LOGIN_PROVIDER_EVIDENCE_STORAGE_LOCK =
  "all-api-hub:agentrouter-login-provider-evidence" as const

export {
  LOGIN_PROVIDER_EVIDENCE_OUTCOMES,
  type LoginProviderEvidence,
  type LoginProviderEvidenceMap,
  type LoginProviderEvidenceOutcome,
} from "~/types/loginProviderEvidence"

const EMPTY_EVIDENCE: LoginProviderEvidenceMap = {}

/** Narrows one persisted entry, dropping anything written by an older shape. */
function normalizeEvidence(value: unknown): LoginProviderEvidence | null {
  if (!isPlainObject(value)) return null
  if (!isAccountLoginProvider(value.provider)) return null
  if (
    value.outcome !== LOGIN_PROVIDER_EVIDENCE_OUTCOMES.Success &&
    value.outcome !== LOGIN_PROVIDER_EVIDENCE_OUTCOMES.IdentityMismatch
  ) {
    return null
  }
  if (typeof value.at !== "number" || !Number.isFinite(value.at)) return null

  return {
    provider: value.provider,
    outcome: value.outcome,
    at: value.at,
  }
}

/**
 * Stores the login outcome each account last proved, so provider ownership can
 * prefer accounts the browser session actually matches instead of an arbitrary
 * tiebreak. This is runtime observation, not user configuration: it is kept out
 * of the account record so account saves, imports, and config normalization
 * cannot drop or overwrite it.
 */
class LoginProviderEvidenceStore {
  private storage = new Storage({ area: "local" })

  /**
   * Reads all evidence. A read failure reports "no evidence", which falls back
   * to the deterministic account-id ordering instead of blocking a run.
   */
  async readAll(): Promise<LoginProviderEvidenceMap> {
    try {
      const stored = await this.storage.get(STORAGE_KEY)
      if (!isPlainObject(stored)) return EMPTY_EVIDENCE

      const evidence: Record<string, LoginProviderEvidence> = {}
      for (const [accountId, value] of Object.entries(stored)) {
        const normalized = normalizeEvidence(value)
        if (normalized) evidence[accountId] = normalized
      }
      return evidence
    } catch (error) {
      logger.warn("Login provider evidence could not be read", { error })
      return EMPTY_EVIDENCE
    }
  }

  /** Records one login outcome. Never fails the caller's check-in on error. */
  async record(input: {
    accountId: string
    provider: AccountLoginProvider
    outcome: LoginProviderEvidenceOutcome
    at?: number
  }): Promise<void> {
    try {
      await withExtensionStorageWriteLock(
        LOGIN_PROVIDER_EVIDENCE_STORAGE_LOCK,
        async () => {
          const current = await this.readAll()
          await this.storage.set(STORAGE_KEY, {
            ...current,
            [input.accountId]: {
              provider: input.provider,
              outcome: input.outcome,
              at: input.at ?? Date.now(),
            },
          })
        },
      )
    } catch (error) {
      logger.warn("Login provider evidence could not be recorded", { error })
    }
  }
}

export const loginProviderEvidence = new LoginProviderEvidenceStore()
