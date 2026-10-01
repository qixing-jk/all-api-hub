/**
 * Session-level memory of what a deployment proved about itself.
 *
 * Companion deployments of one product family diverge over time — the same
 * version string can answer different endpoint sets — so a capability that only
 * probing can answer is discovered once per deployment and remembered here for
 * the rest of the session instead of being guessed from a version or re-asked on
 * every call.
 *
 * Two rules belong to callers, not to this store:
 *
 * - **Remember definite answers only, when the value classifies the deployment.**
 *   A transport failure says nothing about which contract a deployment speaks;
 *   storing it turns one network blip into a permanently wrong endpoint choice,
 *   so a caller that resolves a capability must not call
 *   {@link DeploymentProbeMemory.remember} for an inconclusive probe. The rule is
 *   about classification, not about caching: a caller whose remembered value is a
 *   short-lived freshness stamp may legitimately remember "the refresh failed"
 *   behind a lifetime, because the next read asks again anyway.
 * - **A remembered value is a preference, not a fact.** Deployments upgrade and
 *   downgrade mid-session, so a caller that finds its remembered value no longer
 *   answers must call {@link DeploymentProbeMemory.forget} before choosing again.
 *
 * The store is process-local: every extension context learns separately, which is
 * why it only ever holds conclusions that cost one read-only request to redo.
 */

/** Bound one session's memory of distinct deployments. */
const DEFAULT_DEPLOYMENT_MEMORY_MAX_ENTRIES = 100

export interface DeploymentProbeMemoryOptions {
  /** Maximum remembered deployments; the least recently written is evicted. */
  maxEntries?: number
  /**
   * Freshness window in milliseconds. An elapsed value reads as absent, and a
   * rewrite restarts the window. Omit to keep values for the whole session.
   */
  ttlMs?: number
}

export interface DeploymentProbeMemory<TValue> {
  /** Reads the value remembered for this deployment, if it is still fresh. */
  read(baseUrl: string): TValue | undefined
  /** Remembers a definite answer, refreshing this deployment's recency. */
  remember(baseUrl: string, value: TValue): void
  /** Drops one deployment's answer so the next resolution probes again. */
  forget(baseUrl: string): void
  /** Drops every answer; used between unit tests. */
  clear(): void
  /** Number of deployments currently remembered; used to check the bound. */
  readonly size: number
}

/**
 * Normalizes a deployment URL into the scope every memory is keyed by, so
 * spelling variants of one deployment share one answer.
 */
export function normalizeDeploymentScope(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "")
}

interface RememberedDeployment<TValue> {
  value: TValue
  rememberedAt: number
}

/** Creates one bounded, optionally expiring memory of probed deployment facts. */
export function createDeploymentProbeMemory<TValue>(
  options: DeploymentProbeMemoryOptions = {},
): DeploymentProbeMemory<TValue> {
  const maxEntries = options.maxEntries ?? DEFAULT_DEPLOYMENT_MEMORY_MAX_ENTRIES
  const remembered = new Map<string, RememberedDeployment<TValue>>()

  const isFresh = (entry: RememberedDeployment<TValue>) =>
    options.ttlMs === undefined ||
    Date.now() - entry.rememberedAt < options.ttlMs

  return {
    get size() {
      return remembered.size
    },

    read(baseUrl) {
      const scope = normalizeDeploymentScope(baseUrl)
      const entry = remembered.get(scope)
      if (!entry) return undefined

      if (!isFresh(entry)) {
        remembered.delete(scope)
        return undefined
      }

      return entry.value
    },

    remember(baseUrl, value) {
      const scope = normalizeDeploymentScope(baseUrl)

      // Re-insert so the least recently written deployment is evicted first.
      remembered.delete(scope)
      remembered.set(scope, { value, rememberedAt: Date.now() })

      while (remembered.size > maxEntries) {
        const oldestScope = remembered.keys().next().value
        if (typeof oldestScope !== "string") return
        remembered.delete(oldestScope)
      }
    },

    forget(baseUrl) {
      remembered.delete(normalizeDeploymentScope(baseUrl))
    },

    clear() {
      remembered.clear()
    },
  }
}
