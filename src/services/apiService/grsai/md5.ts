/**
 * MD5 over a UTF-8 string, as lowercase hex.
 *
 * WebCrypto has no MD5, and the Grsai console signs its mutating console calls
 * with `md5(base64(aes(body)))`, so the deployment cannot be driven without one.
 * Implements RFC 1321 (https://www.rfc-editor.org/rfc/rfc1321); the digest is a
 * protocol checksum here, never an integrity or authentication primitive.
 */

/** Constants `K[i] = floor(abs(sin(i + 1)) * 2^32)` from RFC 1321 §3.4. */
const K = Array.from(
  { length: 64 },
  (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296) >>> 0,
)

/** Per-round left-rotate amounts from RFC 1321 §3.4. */
const SHIFTS: readonly number[] = (() => {
  const perRound = [
    [7, 12, 17, 22],
    [5, 9, 14, 20],
    [4, 11, 16, 23],
    [6, 10, 15, 21],
  ]
  return Array.from(
    { length: 64 },
    (_, index) => perRound[Math.floor(index / 16)]![index % 4]!,
  )
})()

const rotateLeft = (value: number, shift: number): number =>
  (value << shift) | (value >>> (32 - shift))

const wordToHex = (word: number): string => {
  const bytes = new Uint8Array(new ArrayBuffer(4))
  new DataView(bytes.buffer).setUint32(0, word >>> 0, true)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  )
}

/** Pads the message to a whole number of 64-byte blocks, little-endian. */
const toPaddedBlocks = (message: Uint8Array): DataView => {
  const blockCount = Math.ceil((message.length + 9) / 64)
  const total = blockCount * 64
  const padded = new Uint8Array(new ArrayBuffer(total))
  padded.set(message)
  padded[message.length] = 0x80

  const view = new DataView(padded.buffer)
  const bitLength = message.length * 8
  view.setUint32(total - 8, bitLength >>> 0, true)
  view.setUint32(total - 4, Math.floor(bitLength / 4294967296), true)
  return view
}

/** MD5 digest of the UTF-8 encoding of `input`, as lowercase hex. */
export function md5HexUtf8(input: string): string {
  const message = new TextEncoder().encode(input)
  const view = toPaddedBlocks(message)

  let a = 0x67452301
  let b = 0xefcdab89
  let c = 0x98badcfe
  let d = 0x10325476

  for (let block = 0; block < view.byteLength; block += 64) {
    const words = Array.from({ length: 16 }, (_, index) =>
      view.getUint32(block + index * 4, true),
    )

    let [wordA, wordB, wordC, wordD] = [a, b, c, d]

    for (let round = 0; round < 64; round++) {
      let mixed: number
      let wordIndex: number

      if (round < 16) {
        mixed = (wordB & wordC) | (~wordB & wordD)
        wordIndex = round
      } else if (round < 32) {
        mixed = (wordD & wordB) | (~wordD & wordC)
        wordIndex = (5 * round + 1) % 16
      } else if (round < 48) {
        mixed = wordB ^ wordC ^ wordD
        wordIndex = (3 * round + 5) % 16
      } else {
        mixed = wordC ^ (wordB | ~wordD)
        wordIndex = (7 * round) % 16
      }

      mixed = (mixed + wordA + K[round]! + words[wordIndex]!) | 0
      wordA = wordD
      wordD = wordC
      wordC = wordB
      wordB = (wordB + rotateLeft(mixed, SHIFTS[round]!)) | 0
    }

    a = (a + wordA) | 0
    b = (b + wordB) | 0
    c = (c + wordC) | 0
    d = (d + wordD) | 0
  }

  return [a, b, c, d].map(wordToHex).join("")
}
