/**
 * Shared process-local access to the saved probe prompt overrides.
 *
 * `runApiVerificationProbe` is the single dispatch point every verification
 * entry point uses, so it resolves prompts here instead of each caller threading
 * them through. The value is cached because probes run repeatedly within one
 * dialog, and invalidated whenever the preferences key changes so an edit made in
 * another extension context (or another tab) applies to the next run.
 */
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import type { ProbePromptOverrides } from "~/services/verification/aiApiVerification/probes/probePrompts"
import { onStorageChanged } from "~/utils/browser/storage"

import { loadProbePromptOverrides } from "./promptOverrides"

let cachedOverrides: ProbePromptOverrides | null = null
let inflightLoad: Promise<ProbePromptOverrides> | null = null
let isSubscribed = false
/**
 * Bumped on every invalidation so a read that started earlier cannot write the
 * cache or clear the newer in-flight read.
 */
let cacheGeneration = 0

/** Drop the cache so the next read sees the newest saved value. */
function invalidateProbePromptOverridesCache(): void {
  cacheGeneration += 1
  cachedOverrides = null
  inflightLoad = null
}

/**
 * Subscribe once per context; a preference write elsewhere invalidates the cache.
 */
function ensureInvalidationSubscription(): void {
  if (isSubscribed) return
  isSubscribed = true

  onStorageChanged((changes, areaName) => {
    if (areaName !== "local") return
    if (!changes[USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES]) return
    invalidateProbePromptOverridesCache()
  })
}

/**
 * Resolve the saved overrides, reading them at most once per invalidation.
 */
export async function getProbePromptOverrides(): Promise<ProbePromptOverrides> {
  ensureInvalidationSubscription()
  if (cachedOverrides) return cachedOverrides
  if (inflightLoad) return inflightLoad

  const generation = cacheGeneration
  const load = loadProbePromptOverrides()
    .then((overrides) => {
      if (generation === cacheGeneration) cachedOverrides = overrides
      return overrides
    })
    .finally(() => {
      // Clear on failure too: caching a rejected promise would make every later
      // probe reuse the same error instead of retrying the read. Only clear our
      // own entry so a newer read stays shared.
      if (inflightLoad === load) inflightLoad = null
    })
  inflightLoad = load

  return load
}

/** Test-only reset of the module cache and subscription flag. */
export function resetProbePromptOverridesCacheForTests(): void {
  invalidateProbePromptOverridesCache()
  isSubscribed = false
}
