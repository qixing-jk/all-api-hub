export type RuntimeMessageSuccess<T> = {
  success: true
  data: T
}

export type RuntimeMessageFailure = {
  success: false
  error: string
}

export type RuntimeMessageResponse<T> =
  | RuntimeMessageSuccess<T>
  | RuntimeMessageFailure

/**
 * Creates a standard failure response for typed runtime message handlers.
 */
export function createRuntimeMessageFailure(
  error: string,
): RuntimeMessageFailure {
  return { success: false, error }
}

/**
 * Returns the failure text carried by a runtime response, falling back to local
 * copy when the remote message is empty or unsuitable for display.
 */
export function getRuntimeMessageFailureMessage(
  response: RuntimeMessageFailure,
  fallbackMessage: string,
): string {
  return response.error.trim() || fallbackMessage
}

/**
 * Returns optional backend-provided toast copy for failed runtime responses.
 */
export function getRuntimeMessageToastMessage<T>(
  response: RuntimeMessageResponse<T>,
): string | undefined {
  if (response.success) {
    return undefined
  }

  return response.error.trim() || undefined
}
