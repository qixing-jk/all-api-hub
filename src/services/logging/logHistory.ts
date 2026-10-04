import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS, STORAGE_LOCKS } from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import {
  LOG_CONTEXTS,
  LOG_HISTORY_DETAILS_LIMIT,
  LOG_LEVELS,
  type LogHistoryEntry,
} from "~/types/logging"
import { onStorageChanged } from "~/utils/browser/browserApi"
import { sanitizeLogDetails } from "~/utils/core/logger"
import { sanitizeSensitiveErrorText } from "~/utils/core/sanitizeSensitiveErrorText"

export const LOG_HISTORY_LIMIT = 1000
export const LOG_HISTORY_RETENTION_MS = 24 * 60 * 60 * 1000
const LOG_HISTORY_BYTE_LIMIT = 1024 * 1024
const storage = new Storage({ area: "local" })
let pending: LogHistoryEntry[] = []
let flushing: Promise<void> | null = null

/** Validate and re-sanitize at the storage boundary, including relayed entries. */
function normalizeEntry(value: unknown): LogHistoryEntry | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  if (
    typeof row.id !== "string" ||
    !row.id ||
    typeof row.timestamp !== "number" ||
    !Number.isFinite(row.timestamp) ||
    row.timestamp < 0 ||
    row.timestamp > 8_640_000_000_000_000 ||
    !LOG_LEVELS.includes(row.level as LogHistoryEntry["level"]) ||
    !LOG_CONTEXTS.includes(row.context as LogHistoryEntry["context"]) ||
    typeof row.scope !== "string" ||
    typeof row.message !== "string"
  )
    return null
  let details = row.details
  if (typeof details === "string") {
    try {
      details = JSON.parse(details)
    } catch {
      /* Previously bounded text. */
    }
  }
  const sanitized = details == null ? null : sanitizeLogDetails(details, true)
  const text =
    sanitized == null
      ? null
      : typeof sanitized === "string"
        ? sanitized
        : JSON.stringify(sanitized)
  return {
    id: row.id.slice(0, 120),
    timestamp: row.timestamp,
    level: row.level as LogHistoryEntry["level"],
    context: row.context as LogHistoryEntry["context"],
    scope: sanitizeSensitiveErrorText(row.scope).slice(0, 120),
    message: sanitizeSensitiveErrorText(row.message).slice(0, 500),
    details:
      text == null
        ? null
        : text.length > LOG_HISTORY_DETAILS_LIMIT
          ? `${text.slice(0, LOG_HISTORY_DETAILS_LIMIT)}…`
          : text,
  }
}

/** Keep only valid recent rows, with both count and byte budgets. */
function pruneEntries(values: unknown[]): LogHistoryEntry[] {
  const cutoff = Date.now() - LOG_HISTORY_RETENTION_MS
  const rows = values
    .flatMap((value) => {
      const entry = normalizeEntry(value)
      return entry && entry.timestamp >= cutoff ? [entry] : []
    })
    .sort((a, b) => b.timestamp - a.timestamp)
  let bytes = 0
  return rows.slice(0, LOG_HISTORY_LIMIT).filter((row) => {
    bytes += new TextEncoder().encode(JSON.stringify(row)).length
    return bytes <= LOG_HISTORY_BYTE_LIMIT
  })
}

/** Read failures propagate; they must never be interpreted as an empty store. */
async function readEntries(): Promise<unknown[]> {
  const value = await storage.get<{ version: number; entries: unknown[] }>(
    STORAGE_KEYS.LOG_HISTORY,
  )
  return value?.version === 1 && Array.isArray(value.entries)
    ? value.entries
    : []
}

/** Batch concurrent logs under one lock before acknowledging relay messages. */
export function appendLogHistory(value: unknown): Promise<void> {
  const entry = normalizeEntry(value)
  if (!entry) return Promise.resolve()
  pending.push(entry)
  if (pending.length > LOG_HISTORY_LIMIT)
    pending = pending.slice(-LOG_HISTORY_LIMIT)
  return flushPendingLogs()
}

/** Drain again if a producer appends during the previous flush's final microtask. */
function flushPendingLogs(): Promise<void> {
  if (!flushing) {
    let completed = false
    flushing = Promise.resolve()
      .then(async () => {
        while (pending.length) {
          await withExtensionStorageWriteLock(
            STORAGE_LOCKS.LOG_HISTORY,
            async () => {
              let batch: LogHistoryEntry[] = []
              try {
                const existing = await readEntries()
                batch = pending.splice(0)
                if (batch.length)
                  await storage.set(STORAGE_KEYS.LOG_HISTORY, {
                    version: 1,
                    entries: pruneEntries([...batch, ...existing]),
                  })
              } catch (error) {
                pending = [...batch, ...pending].slice(-LOG_HISTORY_LIMIT)
                throw error
              }
            },
          )
        }
      })
      .then(() => {
        completed = true
      })
      .finally(() => {
        flushing = null
        if (completed && pending.length) return flushPendingLogs()
      })
  }
  return flushing
}

/** Read retained entries newest first, including after an extension/browser restart. */
export async function listLogHistory(): Promise<LogHistoryEntry[]> {
  return withExtensionStorageWriteLock(STORAGE_LOCKS.LOG_HISTORY, async () => {
    const existing = await readEntries()
    const entries = pruneEntries(existing)
    if (JSON.stringify(entries) !== JSON.stringify(existing)) {
      await storage.set(STORAGE_KEYS.LOG_HISTORY, { version: 1, entries })
    }
    return entries
  })
}

/** Clear queued and persisted logs atomically with append operations. */
export async function clearLogHistory(): Promise<void> {
  await withExtensionStorageWriteLock(STORAGE_LOCKS.LOG_HISTORY, async () => {
    pending = []
    await storage.set(STORAGE_KEYS.LOG_HISTORY, { version: 1, entries: [] })
  })
}

/** Subscribe before the initial read so the viewer cannot miss intervening logs. */
export function subscribeToLogHistory(listener: () => void): () => void {
  return onStorageChanged((changes, area) => {
    if (area === "local" && changes[STORAGE_KEYS.LOG_HISTORY]) listener()
  })
}
