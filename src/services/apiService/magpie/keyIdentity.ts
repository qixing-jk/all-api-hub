/** Magpie identifies keys by the first five bytes of their SHA-256, never by mask or position. */
export async function magpieKeyFingerprint(key: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(key.trim()),
  )
  return [...new Uint8Array(hash).slice(0, 5)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
