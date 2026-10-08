import { getErrorMessage } from "~/utils/core/error"

export class OctopusMutationApiError extends Error {
  constructor(
    message: string,
    readonly evidence: {
      dispatch: "not-dispatched" | "dispatched"
      responseReceived: boolean
      confirmedNonApplication: boolean
      raw: unknown
      statusCode?: number
      code?: string | number
    },
  ) {
    super(message)
    this.name = "OctopusMutationApiError"
  }

  get dispatch() {
    return this.evidence.dispatch
  }

  get responseReceived() {
    return this.evidence.responseReceived
  }

  get confirmedNonApplication() {
    return this.evidence.confirmedNonApplication
  }

  get raw() {
    return this.evidence.raw
  }

  get statusCode() {
    return this.evidence.statusCode
  }

  get code() {
    return this.evidence.code
  }
}

export const getOctopusErrorCode = (error: unknown) => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined
  }
  const code = error.code
  return typeof code === "string" ||
    (typeof code === "number" && Number.isSafeInteger(code))
    ? code
    : undefined
}

export const getOctopusMutationErrorMessage = (error: unknown) => {
  const providerMessage =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? (error as { message?: unknown }).message
        : undefined
  return getErrorMessage(providerMessage, "Octopus mutation failed")
}

export const parseOctopusEnvelope = (
  endpoint: string,
  data: unknown,
): Record<string, unknown> => {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`Invalid Octopus response from ${endpoint}`)
  }
  return data as Record<string, unknown>
}

export const getOctopusEnvelopeData = (
  endpoint: string,
  data: unknown,
): unknown => {
  const envelope = parseOctopusEnvelope(endpoint, data)
  if (
    envelope.success === false ||
    (envelope.code !== undefined && envelope.code !== 200)
  ) {
    throw new Error(getErrorMessage(envelope.message, "API request failed"))
  }
  return envelope.data
}
