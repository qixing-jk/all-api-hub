import { useEffect, useState } from "react"

import {
  loginProviderEvidence,
  type LoginProviderEvidenceMap,
} from "~/services/checkin/autoCheckin/loginProviderEvidence"

const NO_EVIDENCE: LoginProviderEvidenceMap = {}

/**
 * Reads the last observed login outcomes used to decide login-provider
 * ownership, so the settings UI greys out the same option a run would skip.
 *
 * Re-read whenever the caller reloads its account data: evidence only changes
 * after a background check-in, which already triggers that reload.
 */
export function useLoginProviderEvidence(input: {
  enabled: boolean
  refreshKey?: unknown
}): LoginProviderEvidenceMap {
  const [evidence, setEvidence] =
    useState<LoginProviderEvidenceMap>(NO_EVIDENCE)

  useEffect(() => {
    if (!input.enabled) return
    let cancelled = false

    void loginProviderEvidence.readAll().then((next) => {
      if (!cancelled) setEvidence(next)
    })

    return () => {
      cancelled = true
    }
  }, [input.enabled, input.refreshKey])

  return evidence
}
