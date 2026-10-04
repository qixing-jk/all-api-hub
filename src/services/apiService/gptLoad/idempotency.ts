/**
 * Generates a canonical UUID v4 for gpt-load's `Idempotency-Key` header.
 *
 * The gateway rejects keys that are not canonical UUID v4 (verified live:
 * non-UUID keys answer `INVALID_IDEMPOTENCY_KEY`), so this does not reuse
 * `safeRandomUUID`, whose fallback is time+random and would be rejected.
 */
export function newGptLoadIdempotencyKey(): string {
  const bytes = new Uint8Array(16)
  const cryptoRef = globalThis.crypto
  if (typeof cryptoRef?.getRandomValues === "function") {
    try {
      cryptoRef.getRandomValues(bytes)
    } catch {
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256)
      }
    }
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  const b6 = bytes[6] ?? 0
  const b8 = bytes[8] ?? 0
  bytes[6] = (b6 & 0x0f) | 0x40
  bytes[8] = (b8 & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-")
}
