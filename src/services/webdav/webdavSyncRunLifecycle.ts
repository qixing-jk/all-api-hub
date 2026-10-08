import { getErrorMessage } from "~/utils/core/error"

type SyncRunOutcome =
  | { kind: "busy" }
  | { kind: "success" }
  | { kind: "error"; error: unknown }

/** Owns the shared run lease and completion facts across all cloud-sync triggers. */
export class WebdavSyncRunLifecycle {
  private isSyncing = false
  private lastSyncTime = 0
  private lastSyncStatus: "success" | "error" | "idle" = "idle"
  private lastSyncError: string | null = null

  /** Returns completion facts without exposing mutable state. */
  getStatus() {
    return {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      lastSyncStatus: this.lastSyncStatus,
      lastSyncError: this.lastSyncError,
    }
  }

  /** Holds admission through trigger-specific feedback and always releases it. */
  async run(
    work: () => Promise<void>,
    feedback: {
      success?: () => void | Promise<void>
      failure?: (error: unknown) => void | Promise<void>
    } = {},
  ): Promise<SyncRunOutcome> {
    if (this.isSyncing) return { kind: "busy" }
    this.isSyncing = true
    try {
      await work()
      this.lastSyncTime = Date.now()
      this.lastSyncStatus = "success"
      this.lastSyncError = null
      await feedback.success?.()
      return { kind: "success" }
    } catch (error) {
      this.lastSyncStatus = "error"
      this.lastSyncError = getErrorMessage(error)
      await feedback.failure?.(error)
      return { kind: "error", error }
    } finally {
      this.isSyncing = false
    }
  }
}
