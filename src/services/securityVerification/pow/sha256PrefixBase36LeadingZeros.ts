const NONCE_BATCH_SIZE = 256
const YIELD_INTERVAL = NONCE_BATCH_SIZE * 16
const MAX_NONCE_ATTEMPTS = 2 ** 24
const MAX_PREFIX_LENGTH = 256
const SUPPORTED_LEADING_ZERO_BITS = 16

/** Execution inputs for one specific PoW scheme, with bounded supported difficulty. */
export interface Sha256PrefixBase36LeadingZerosOptions {
  /** Nonempty UTF-8 input, limited to 256 JavaScript string code units. */
  prefix: string
  /** Other difficulties remain unsupported until their work budget is reviewed. */
  leadingZeroBits: typeof SUPPORTED_LEADING_ZERO_BITS
  /** Absolute Unix time in milliseconds; acquisition time must count toward expiry. */
  deadline: number
  abortSignal?: AbortSignal
}

/**
 * Finds n in [0, 2^24) such that SHA-256(UTF-8(prefix + n.toString(36)))
 * begins with 16 zero bits. There is no separator, padding or case conversion.
 * Returns only the lowercase base36 nonce; the caller owns tickets and submission.
 * Other hash/encoding/target schemes need a separately named solver.
 */
export async function solveSha256PrefixBase36LeadingZeros({
  prefix,
  leadingZeroBits,
  deadline,
  abortSignal,
}: Sha256PrefixBase36LeadingZerosOptions): Promise<string> {
  if (
    leadingZeroBits !== SUPPORTED_LEADING_ZERO_BITS ||
    typeof prefix !== "string" ||
    !prefix ||
    prefix.length > MAX_PREFIX_LENGTH ||
    !Number.isFinite(deadline)
  )
    throw new RangeError(
      "Unsupported SHA-256 prefix/base36 leading-zero PoW inputs",
    )
  const encoder = new TextEncoder()
  const assertActive = () => {
    abortSignal?.throwIfAborted()
    if (Date.now() >= deadline)
      throw new DOMException("PoW deadline exceeded", "TimeoutError")
  }
  for (let first = 0; first < MAX_NONCE_ATTEMPTS; first += NONCE_BATCH_SIZE) {
    assertActive()
    const nonces = Array.from({ length: NONCE_BATCH_SIZE }, (_, offset) =>
      (first + offset).toString(36),
    )
    const hashes = await Promise.all(
      nonces.map((nonce) =>
        crypto.subtle.digest("SHA-256", encoder.encode(prefix + nonce)),
      ),
    )
    assertActive()
    const index = hashes.findIndex((hash) => {
      const bytes = new Uint8Array(hash)
      return bytes[0] === 0 && bytes[1] === 0
    })
    if (index >= 0) return nonces[index]!
    if (first % YIELD_INTERVAL === 0)
      await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error("SHA-256 prefix/base36 leading-zero PoW search exhausted")
}
