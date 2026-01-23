/**
 * Generates a UUID while avoiding "illegal invocation" issues seen when a UUID
 * method is detached from its owning object in some environments.
 *
 * Falls back to a time+random based identifier when `crypto.randomUUID` is not
 * available (e.g. certain test environments).
 */
export function safeRandomUUID(customPrefix?: string): string {
  const cryptoRef = globalThis.crypto
  const randomUUID = cryptoRef?.randomUUID

  const finalPrefix = customPrefix ? `${customPrefix}-` : ""

  if (typeof randomUUID === "function") {
    try {
      return finalPrefix + `${randomUUID.call(cryptoRef)}`
    } catch (error) {
      console.error("Failed to generate UUID using crypto.randomUUID:", error)
    }
  }

  return (
    finalPrefix + `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  )
}
