const MAX_CANCELLED_SCANS = 128

/** Owns active scans and bounded close-before-dispatch history in one runtime context. */
export function createFeedbackScanRegistry() {
  const active = new Map<string, AbortController>()
  const cancelled = new Set<string>()

  return {
    start(requestId: string) {
      if (cancelled.has(requestId) || active.has(requestId)) return undefined
      const controller = new AbortController()
      active.set(requestId, controller)
      return controller
    },
    cancel(requestId: string) {
      active.get(requestId)?.abort()
      cancelled.add(requestId)
      if (cancelled.size > MAX_CANCELLED_SCANS)
        cancelled.delete(cancelled.values().next().value!)
    },
    finish(requestId: string) {
      active.delete(requestId)
    },
  }
}
