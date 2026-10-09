/** Owns cancellable background runs without allowing predecessors to release successors. */
export function createApiCheckProbeRunRegistry() {
  const active = new Map<string, AbortController>()

  return {
    async run<T>(
      runId: string | undefined,
      execute: (signal: AbortSignal | undefined) => Promise<T>,
    ): Promise<T> {
      const controller = runId ? new AbortController() : undefined
      if (runId && controller) active.set(runId, controller)
      try {
        return await execute(controller?.signal)
      } finally {
        if (runId && active.get(runId) === controller) active.delete(runId)
      }
    },
    cancel(runId: string): boolean {
      const controller = active.get(runId)
      if (!controller) return false
      controller.abort()
      if (active.get(runId) === controller) active.delete(runId)
      return true
    },
  }
}
