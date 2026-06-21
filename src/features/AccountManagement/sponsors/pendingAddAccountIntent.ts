import { Storage } from "@plasmohq/storage"

import { isAccountSiteType, SITE_TYPES } from "~/constants/siteType"
import { normalizeOptionalAccountAuthType } from "~/features/AccountManagement/utils/accountAuthType"
import {
  normalizeAccountSiteProfileUrlForStorage,
  resolveAccountSiteDefaultAuthType,
} from "~/services/accounts/accountSiteProfile"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { createLogger } from "~/utils/core/logger"

import {
  SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE,
  type AddAccountPrefill,
} from "./types"

const logger = createLogger("SponsorAddAccountIntent")
const storage = new Storage({ area: "local" })
const PENDING_SPONSOR_ADD_ACCOUNT_PREFILL_TTL_MS = 5 * 60 * 1000

interface PendingSponsorAddAccountPrefillEnvelope {
  createdAt: number
  prefill: AddAccountPrefill
}

type PendingSponsorAddAccountPrefillSignal = () => void

/** Stores a short-lived sponsor add-account prefill for side-panel handoff. */
export async function setPendingSponsorAddAccountPrefill(
  prefill: AddAccountPrefill,
): Promise<void> {
  const normalized = normalizeSponsorAddAccountPrefill(prefill)
  if (!normalized) return

  try {
    await storage.set(STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL, {
      createdAt: Date.now(),
      prefill: normalized,
    } satisfies PendingSponsorAddAccountPrefillEnvelope)
  } catch (error) {
    logger.warn("Failed to store pending sponsor add-account prefill", error)
  }
}

/** Consumes and clears the pending sponsor add-account prefill if still valid. */
export async function getAndClearPendingSponsorAddAccountPrefill(): Promise<AddAccountPrefill | null> {
  let raw: unknown

  try {
    raw = await storage.get(STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL)
  } catch (error) {
    logger.warn("Failed to read pending sponsor add-account prefill", error)
    return null
  }

  try {
    await storage.remove(STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL)
  } catch (error) {
    logger.warn("Failed to clear pending sponsor add-account prefill", error)
  }

  return normalizePendingEnvelope(raw)
}

/** Watches for new pending sponsor add-account prefill writes in mounted side panels. */
export function watchPendingSponsorAddAccountPrefill(
  onPendingPrefill: PendingSponsorAddAccountPrefillSignal,
): () => void {
  const callbackMap = {
    [STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL]: (change) => {
      if (change.newValue !== undefined) {
        onPendingPrefill()
      }
    },
  } satisfies Parameters<typeof storage.watch>[0]

  if (!storage.watch(callbackMap)) {
    return () => {}
  }

  return () => {
    storage.unwatch(callbackMap)
  }
}

/** Identifies validated sponsor add-account prefill values while ignoring UI events. */
export function isSponsorAddAccountPrefill(
  value: unknown,
): value is AddAccountPrefill {
  return normalizeSponsorAddAccountPrefill(value) !== null
}

/**
 * Validates a stored pending-prefill envelope and enforces its short TTL.
 */
function normalizePendingEnvelope(value: unknown): AddAccountPrefill | null {
  if (!isRecord(value)) return null
  if (typeof value.createdAt !== "number") return null
  if (!Number.isFinite(value.createdAt)) return null
  if (
    Date.now() - value.createdAt >
    PENDING_SPONSOR_ADD_ACCOUNT_PREFILL_TTL_MS
  ) {
    return null
  }

  return normalizeSponsorAddAccountPrefill(value.prefill)
}

/**
 * Validates the sponsor prefill payload before it is written into an envelope.
 */
export function normalizeSponsorAddAccountPrefill(
  value: unknown,
): AddAccountPrefill | null {
  const envelopePrefill = normalizePendingEnvelope(value)
  if (envelopePrefill) return envelopePrefill

  if (!isRecord(value)) return null
  if (value.source !== SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE) return null
  if (typeof value.sponsorId !== "string" || !value.sponsorId.trim()) {
    return null
  }
  const siteType = value.siteType
  if (!isAccountSiteType(siteType) || siteType === SITE_TYPES.UNKNOWN) {
    return null
  }
  if (typeof value.siteUrl !== "string") return null
  const normalizedAuthType = normalizeOptionalAccountAuthType(value.authType)
  if (normalizedAuthType === false) return null

  try {
    const url = new URL(value.siteUrl)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    const siteUrl = normalizeAccountSiteProfileUrlForStorage({
      siteType,
      url: value.siteUrl,
    })

    return {
      source: SPONSOR_ADD_ACCOUNT_PREFILL_SOURCE,
      sponsorId: value.sponsorId.trim(),
      siteType,
      siteUrl,
      authType:
        normalizedAuthType ??
        resolveAccountSiteDefaultAuthType({ siteType, url: siteUrl }),
    }
  } catch {
    return null
  }
}

/**
 * Narrows unknown JSON-like values before field-level validation.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
