import type { ResourceFailure } from "~/services/apiAdapters/contracts/managedResourceNative"

export type ManagedResourceFailurePresentation = {
  category: string
  message: string
  variant?: "warning"
}

/** Prefers an adapter-sanitized message and uses local copy as its fallback. */
export const presentManagedResourceFailure = (
  failure: ResourceFailure,
  fallback: ManagedResourceFailurePresentation,
): ManagedResourceFailurePresentation => {
  const candidateMessage = failure.message?.trim()
  const message =
    candidateMessage && candidateMessage !== failure.code
      ? candidateMessage
      : fallback.message
  const upstreamCode = failure.upstreamCode?.trim()
  const visibleCode =
    upstreamCode && upstreamCode !== failure.code && upstreamCode !== message
      ? upstreamCode
      : undefined

  return {
    ...fallback,
    message: visibleCode ? `${message} (${visibleCode})` : message,
  }
}
