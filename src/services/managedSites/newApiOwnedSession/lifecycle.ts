import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"

export const NEW_API_OWNED_SESSION_ALARM_NAME = "new-api-owned-session-cleanup"

const RECEIPT_VERSION = 1 as const
const IDLE_CLEANUP_DELAY_MS = 10 * 60 * 1000
const CLEANUP_EXPIRY_SAFETY_MS = 30 * 1000
const CLEANUP_RETRY_DELAY_MS = 60 * 1000

export interface NewApiOwnedSessionBundle {
  baseUrl: string
  sessionId: string
  accessToken: string
  /** Epoch seconds, matching New API's AuthBundle response. */
  accessExpiresAt: number
}

export interface NewApiOwnedSessionReceipt {
  version: typeof RECEIPT_VERSION
  origin: string
  sessionId: string
  accessToken: string
  accessExpiresAt: number
  lastUsedAt: number
  cleanupAt: number
}

interface StoredReceipts {
  version: typeof RECEIPT_VERSION
  receipts: Record<string, NewApiOwnedSessionReceipt>
}

export interface NewApiOwnedSessionLifecycleDependencies {
  now: () => number
  readStoredReceipts: () => Promise<unknown>
  writeStoredReceipts: (value: StoredReceipts) => Promise<void>
  createAlarm: (name: string, alarmInfo: { when: number }) => Promise<void>
  clearAlarm: (name: string) => Promise<boolean>
  onAlarm: (
    listener: (alarm: { name: string }) => void | Promise<void>,
  ) => () => void
  reportError: (error: unknown) => void
  revokeSession: (
    receipt: NewApiOwnedSessionReceipt,
  ) => Promise<{ status: "cleaned" | "retry" | "unavailable" }>
}

const normalizeOrigin = (baseUrl: string) => {
  const normalized = normalizeUrlForOriginKey(baseUrl, {
    stripTrailingSlashes: true,
  })
  if (!normalized) return null

  try {
    const url = new URL(normalized)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null
  } catch {
    return null
  }
}

const normalizeBundle = (bundle: NewApiOwnedSessionBundle) => {
  const origin = normalizeOrigin(bundle.baseUrl)
  const sessionId = bundle.sessionId.trim()
  const accessToken = bundle.accessToken.trim()
  if (
    !origin ||
    !sessionId ||
    !accessToken ||
    !Number.isFinite(bundle.accessExpiresAt)
  ) {
    return null
  }

  return {
    origin,
    sessionId,
    accessToken,
    accessExpiresAt: bundle.accessExpiresAt,
  }
}

const getReceiptKey = (origin: string, sessionId: string) =>
  `${origin}\n${sessionId}`

const isReceipt = (value: unknown): value is NewApiOwnedSessionReceipt => {
  if (!value || typeof value !== "object") return false
  const receipt = value as Partial<NewApiOwnedSessionReceipt>
  return (
    receipt.version === RECEIPT_VERSION &&
    typeof receipt.origin === "string" &&
    typeof receipt.sessionId === "string" &&
    typeof receipt.accessToken === "string" &&
    typeof receipt.accessExpiresAt === "number" &&
    typeof receipt.lastUsedAt === "number" &&
    typeof receipt.cleanupAt === "number"
  )
}

const parseStoredReceipts = (value: unknown): StoredReceipts => {
  if (!value || typeof value !== "object") {
    return { version: RECEIPT_VERSION, receipts: {} }
  }

  const candidate = value as Partial<StoredReceipts>
  if (
    candidate.version !== RECEIPT_VERSION ||
    !candidate.receipts ||
    typeof candidate.receipts !== "object"
  ) {
    return { version: RECEIPT_VERSION, receipts: {} }
  }

  const receipts = Object.fromEntries(
    Object.entries(candidate.receipts).filter(
      ([receiptKey, receipt]) =>
        isReceipt(receipt) &&
        getReceiptKey(receipt.origin, receipt.sessionId) === receiptKey,
    ),
  )
  return { version: RECEIPT_VERSION, receipts }
}

const getCleanupAt = (now: number, accessExpiresAt: number) =>
  Math.min(
    now + IDLE_CLEANUP_DELAY_MS,
    accessExpiresAt * 1000 - CLEANUP_EXPIRY_SAFETY_MS,
  )

const getReceiptEntriesForOrigin = (stored: StoredReceipts, origin: string) =>
  Object.entries(stored.receipts).filter(
    ([, receipt]) => receipt.origin === origin,
  )

/**
 * Owns only sessions explicitly captured from a fresh credential login. The
 * persisted receipt lives in browser.storage.session, which Chrome documents
 * as memory-only and cleared when the browser stops.
 * https://developer.chrome.com/docs/extensions/reference/api/storage#storage-areas
 */
export function createNewApiOwnedSessionLifecycle(
  dependencies: NewApiOwnedSessionLifecycleDependencies,
) {
  let operation = Promise.resolve()
  let initialized = false

  const exclusively = async <T>(task: () => Promise<T>): Promise<T> => {
    const previous = operation
    let release: () => void = () => {}
    operation = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await task()
    } finally {
      release()
    }
  }

  const read = async () =>
    parseStoredReceipts(await dependencies.readStoredReceipts())

  const schedule = async (stored: StoredReceipts) => {
    const cleanupTimes = Object.values(stored.receipts).map(
      (receipt) => receipt.cleanupAt,
    )
    if (cleanupTimes.length === 0) {
      await dependencies.clearAlarm(NEW_API_OWNED_SESSION_ALARM_NAME)
      return
    }

    await dependencies.createAlarm(NEW_API_OWNED_SESSION_ALARM_NAME, {
      when: Math.max(dependencies.now(), Math.min(...cleanupTimes)),
    })
  }

  const persistAndSchedule = async (stored: StoredReceipts) => {
    await dependencies.writeStoredReceipts(stored)
    await schedule(stored)
  }

  const cleanupReceipt = async (
    stored: StoredReceipts,
    receiptKey: string,
  ): Promise<"cleaned" | "failed"> => {
    const receipt = stored.receipts[receiptKey]
    if (!receipt) return "cleaned"

    const result = await dependencies.revokeSession(receipt)
    if (result.status === "cleaned" || result.status === "unavailable") {
      delete stored.receipts[receiptKey]
      return result.status === "cleaned" ? "cleaned" : "failed"
    }

    const retryAt = dependencies.now() + CLEANUP_RETRY_DELAY_MS
    if (retryAt >= receipt.accessExpiresAt * 1000) {
      delete stored.receipts[receiptKey]
      return "failed"
    }

    stored.receipts[receiptKey] = { ...receipt, cleanupAt: retryAt }
    return "failed"
  }

  const cleanupDue = async () =>
    exclusively(async () => {
      const stored = await read()
      const now = dependencies.now()
      for (const [receiptKey, receipt] of Object.entries(stored.receipts)) {
        if (receipt.cleanupAt <= now) {
          await cleanupReceipt(stored, receiptKey)
        }
      }
      await persistAndSchedule(stored)
    })

  return {
    initialize() {
      if (!initialized) {
        initialized = true
        // Register synchronously so an MV3 worker cannot miss the wake event
        // while storage reconciliation is awaiting its first promise.
        dependencies.onAlarm((alarm) => {
          if (alarm.name === NEW_API_OWNED_SESSION_ALARM_NAME) {
            void cleanupDue().catch(dependencies.reportError)
          }
        })
      }

      return exclusively(async () => {
        await schedule(await read())
      })
    },

    capture(bundle: NewApiOwnedSessionBundle) {
      return exclusively(async () => {
        const normalized = normalizeBundle(bundle)
        if (!normalized) return

        const now = dependencies.now()
        const stored = await read()
        stored.receipts[
          getReceiptKey(normalized.origin, normalized.sessionId)
        ] = {
          version: RECEIPT_VERSION,
          origin: normalized.origin,
          sessionId: normalized.sessionId,
          accessToken: normalized.accessToken,
          accessExpiresAt: normalized.accessExpiresAt,
          lastUsedAt: now,
          cleanupAt: getCleanupAt(now, normalized.accessExpiresAt),
        }
        await persistAndSchedule(stored)
      })
    },

    refresh(bundle: NewApiOwnedSessionBundle) {
      return exclusively(async () => {
        const normalized = normalizeBundle(bundle)
        if (!normalized) return { owned: false }

        const stored = await read()
        const receiptKey = getReceiptKey(
          normalized.origin,
          normalized.sessionId,
        )
        const receipt = stored.receipts[receiptKey]
        if (!receipt) {
          return { owned: false }
        }

        const now = dependencies.now()
        stored.receipts[receiptKey] = {
          ...receipt,
          accessToken: normalized.accessToken,
          accessExpiresAt: normalized.accessExpiresAt,
          lastUsedAt: now,
          cleanupAt: getCleanupAt(now, normalized.accessExpiresAt),
        }
        await persistAndSchedule(stored)
        return { owned: true }
      })
    },

    touch(baseUrl: string, sessionId?: string) {
      return exclusively(async () => {
        const origin = normalizeOrigin(baseUrl)
        if (!origin) return { owned: false }
        const stored = await read()
        const entries = getReceiptEntriesForOrigin(stored, origin).filter(
          ([, receipt]) => !sessionId || receipt.sessionId === sessionId,
        )
        if (entries.length === 0) return { owned: false }

        const now = dependencies.now()
        for (const [receiptKey, receipt] of entries) {
          stored.receipts[receiptKey] = {
            ...receipt,
            lastUsedAt: now,
            cleanupAt: getCleanupAt(now, receipt.accessExpiresAt),
          }
        }
        await persistAndSchedule(stored)
        return { owned: true }
      })
    },

    getStatus(baseUrl: string) {
      return exclusively(async () => {
        const origin = normalizeOrigin(baseUrl)
        if (!origin) return { owned: false }
        const stored = await read()
        return {
          owned: getReceiptEntriesForOrigin(stored, origin).length > 0,
        }
      })
    },

    cleanup(baseUrl: string) {
      return exclusively(async () => {
        const origin = normalizeOrigin(baseUrl)
        if (!origin) return { status: "none" as const }
        const stored = await read()
        const entries = getReceiptEntriesForOrigin(stored, origin)
        if (entries.length === 0) return { status: "none" as const }

        let status: "cleaned" | "failed" = "cleaned"
        for (const [receiptKey] of entries) {
          if ((await cleanupReceipt(stored, receiptKey)) === "failed") {
            status = "failed"
          }
        }
        await persistAndSchedule(stored)
        return { status }
      })
    },
  }
}
