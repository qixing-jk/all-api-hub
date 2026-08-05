import { useMemo } from "react"

import type { OneTimeSecretPresentation } from "~/features/TokenProvisioning/components/OneTimeSecretDialog"

interface LegacyApiTokenSecret {
  name: string
  key: string
}

/** Keeps legacy token presentation identity stable across equivalent DTO refreshes. */
export function useLegacyApiTokenSecretResult(
  token: LegacyApiTokenSecret | null,
): OneTimeSecretPresentation | null {
  const hasToken = token !== null
  const displayName = token?.name ?? ""
  const secret = token?.key ?? ""

  return useMemo(
    () => (hasToken ? { displayName, secret } : null),
    [displayName, hasToken, secret],
  )
}
