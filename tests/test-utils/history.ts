/**
 * Narrows a nullable history target in tests and fails fast when setup is invalid.
 * @param target - Possibly nullable target returned by a history-target factory.
 * @returns The same target once nullability has been ruled out.
 */
export function requireHistoryTarget<T>(target: T | null) {
  if (!target) {
    throw new Error("Expected history target")
  }

  return target
}
