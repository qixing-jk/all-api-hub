type ActiveRun = { controller: AbortController; ownerTabId?: number }

/** Owns cancellable background runs without allowing predecessors to release successors. */
export function createApiCheckProbeRunRegistry() {
  const active = new Map<string, ActiveRun>()

  const release = (runId: string, run: ActiveRun) => {
    if (active.get(runId) === run) active.delete(runId)
  }

  return {
    /**
     * Runs one cancellable request. `ownerTabId` allows the run to be aborted
     * when the content-script context that started it disappears.
     */
    async run<T>(
      runId: string | undefined,
      execute: (signal: AbortSignal | undefined) => Promise<T>,
      ownerTabId?: number,
    ): Promise<T> {
      const controller = runId ? new AbortController() : undefined
      const entry = controller ? { controller, ownerTabId } : undefined
      if (runId && entry) active.set(runId, entry)
      try {
        return await execute(controller?.signal)
      } finally {
        if (runId && entry) release(runId, entry)
      }
    },
    cancel(runId: string): boolean {
      const entry = active.get(runId)
      if (!entry) return false
      entry.controller.abort()
      release(runId, entry)
      return true
    },
    /**
     * Aborts every run started by a tab whose page context is gone.
     *
     * A torn-down content script cannot send its own cancellation, so the
     * background has to stop those runs itself.
     */
    cancelForTab(tabId: number): void {
      if (typeof tabId !== "number") return
      for (const [runId, entry] of [...active]) {
        if (entry.ownerTabId !== tabId) continue
        entry.controller.abort()
        release(runId, entry)
      }
    },
  }
}
