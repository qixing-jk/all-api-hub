import {
  getSessionStorageValues,
  setSessionStorageValues,
} from "~/utils/browser/storage"

/** Serializes one background snapshot and retains successful sends during local write outages. */
export class SnapshotCadence {
  private inFlight = false
  private capturedAt: number | undefined

  constructor(
    private readonly sessionKey: string,
    private readonly shouldSend: (
      at: number | undefined,
      now: number,
    ) => boolean,
  ) {}

  async capture(
    readLastCapturedAt: () => Promise<number | undefined>,
    capture: (now: number, markPartialCapture: () => void) => Promise<boolean>,
  ): Promise<boolean> {
    if (this.inFlight) return false
    this.inFlight = true
    try {
      const now = Date.now()
      const timestamps: unknown[] = [
        this.capturedAt,
        await readLastCapturedAt(),
      ]
      try {
        const values = await getSessionStorageValues(this.sessionKey)
        timestamps.push(values[this.sessionKey])
      } catch {
        // Local state and the current worker's cooldown remain usable.
      }
      if (
        timestamps.some(
          (at) =>
            !this.shouldSend(typeof at === "number" ? at : undefined, now),
        )
      )
        return false
      let consumed = false
      const markCaptured = () => {
        consumed = true
        this.capturedAt = now
      }
      try {
        const complete = await capture(now, markCaptured)
        if (complete) markCaptured()
        return complete
      } finally {
        // A captured prefix must not be replayed when a later group fails.
        // Keep this independent of local state, including local read outages.
        if (consumed) await setSessionStorageValues({ [this.sessionKey]: now })
      }
    } finally {
      this.inFlight = false
    }
  }
}
