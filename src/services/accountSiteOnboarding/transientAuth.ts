import { normalizeNewApiDashboardTransientAuth } from "./contentSession/newApiTransientAuth"
import type { ContentSessionTransientAuthContext } from "./contracts"

// Keep pure admission rules separate from extractors, which may refresh sessions
// and depend on browser-session resolution themselves.
const transientAuthNormalizers = [normalizeNewApiDashboardTransientAuth]

/** Validates returned authentication without extracting or refreshing credentials. */
export function normalizeContentSessionTransientAuth(
  value: unknown,
  context: ContentSessionTransientAuthContext,
) {
  for (const normalize of transientAuthNormalizers) {
    const normalized = normalize(value, context)
    if (normalized) return normalized
  }
  return undefined
}
