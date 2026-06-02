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
