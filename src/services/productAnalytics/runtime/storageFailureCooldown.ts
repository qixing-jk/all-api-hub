import {
  PRODUCT_ANALYTICS_SESSION_STORAGE_KEYS,
  STORAGE_LOCKS,
} from "~/services/core/storageKeys"
import { withExtensionStorageWriteLock } from "~/services/core/storageWriteLock"
import { STORAGE_WRITE_FAILURE_REPORT_INTERVAL_MS } from "~/services/productAnalytics/configuration/storageFailurePolicy"
import {
  PRODUCT_ANALYTICS_STORAGE_FAILURE_STAGES,
  PRODUCT_ANALYTICS_STORAGE_OPERATIONS,
} from "~/services/productAnalytics/contracts"
import {
  getSessionStorageValues,
  setSessionStorageValues,
} from "~/utils/browser/storage"

const STORAGE_KEY =
  PRODUCT_ANALYTICS_SESSION_STORAGE_KEYS.STORAGE_FAILURE_REPORTED_AT
const REPORT_KEYS = new Set(
  Object.values(PRODUCT_ANALYTICS_STORAGE_OPERATIONS).flatMap((operation) =>
    Object.values(PRODUCT_ANALYTICS_STORAGE_FAILURE_STAGES).map(
      (stage) => `${operation}:${stage}`,
    ),
  ),
)

/**
 * Reserves one diagnostic attempt per operation/stage across worker restarts.
 * Use session storage independently of the failing local store. If admission
 * cannot be saved, skip this diagnostic rather than emit without a bound.
 */
export async function reserveStorageFailureReport(
  properties: Record<string, unknown>,
): Promise<boolean> {
  const key = `${properties.storage_operation}:${properties.storage_failure_stage}`
  if (!REPORT_KEYS.has(key)) return false

  try {
    return await withExtensionStorageWriteLock(
      STORAGE_LOCKS.PRODUCT_ANALYTICS_STORAGE_FAILURE_REPORT,
      async () => {
        const values = await getSessionStorageValues(STORAGE_KEY)
        const stored = values[STORAGE_KEY]
        const timestamps: Record<string, unknown> =
          stored && typeof stored === "object"
            ? (stored as Record<string, unknown>)
            : {}
        const now = Date.now()
        const recent = Object.fromEntries(
          Object.entries(timestamps).filter(
            ([reportKey, timestamp]) =>
              REPORT_KEYS.has(reportKey) &&
              typeof timestamp === "number" &&
              Number.isFinite(timestamp) &&
              now - timestamp < STORAGE_WRITE_FAILURE_REPORT_INTERVAL_MS,
          ),
        )
        if (key in recent) return false

        // Reserve before capture: even a failed SDK capture consumes this slot.
        // Never report failures of this guard through analytics recursively.
        return await setSessionStorageValues({
          [STORAGE_KEY]: { ...recent, [key]: now },
        })
      },
    )
  } catch {
    return false
  }
}
