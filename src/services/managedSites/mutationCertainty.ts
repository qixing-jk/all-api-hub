import { API_ERROR_CODES } from "~/services/apiTransport/errors"
import type { ApiResponse } from "~/services/apiTransport/type"

export const MANAGED_SITE_MUTATION_CERTAINTIES = {
  Uncertain: "uncertain",
} as const

export type ManagedSiteMutationCertainty =
  (typeof MANAGED_SITE_MUTATION_CERTAINTIES)[keyof typeof MANAGED_SITE_MUTATION_CERTAINTIES]

export type ManagedSiteChannelDeleteResponse = ApiResponse<unknown> & {
  certainty?: ManagedSiteMutationCertainty
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object")

export const isManagedSiteMutationUncertainError = (
  error: unknown,
): boolean => {
  if (!isRecord(error)) return false

  if (error.name === "AbortError" || error.code === "ABORT_ERR") {
    return true
  }
  if (error.code === API_ERROR_CODES.NETWORK_ERROR) {
    return true
  }

  return (
    error.name === "TypeError" &&
    typeof error.message === "string" &&
    /failed to fetch|network request failed|load failed/i.test(error.message)
  )
}

export const getManagedSiteDeleteCertainty = (
  error: unknown,
):
  | Pick<ManagedSiteChannelDeleteResponse, "certainty">
  | Record<string, never> =>
  isManagedSiteMutationUncertainError(error)
    ? { certainty: MANAGED_SITE_MUTATION_CERTAINTIES.Uncertain }
    : {}
